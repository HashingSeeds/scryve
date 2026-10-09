import { Platform } from "react-native"
import * as Sentry from "@sentry/react-native"

import * as durableOutbox from "@/features/sync/durableOutbox"
import { initObservability } from "@/utils/observability"
import { emitTelemetry, setTelemetryAdapter } from "@/utils/telemetry"

jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  setTags: jest.fn(),
  addBreadcrumb: jest.fn(),
  mobileReplayIntegration: jest.fn(() => ({ type: "mobileReplay" })),
  browserReplayIntegration: jest.fn(() => ({ type: "browserReplay" })),
  feedbackIntegration: jest.fn(() => ({ type: "feedback" })),
  reactNativeTracingIntegration: jest.fn(() => ({ type: "tracing" })),
  reactNavigationIntegration: jest.fn(() => ({ type: "navigation" })),
}))

const mockAnalytics = { enabled: false, emit: jest.fn() }

jest.mock("@/utils/analytics", () => ({
  analyticsEnabled: () => mockAnalytics.enabled,
  syncTimingAdapter: { emit: (event: unknown) => mockAnalytics.emit(event) },
}))

const mockUpdatesState = {
  updateId: "test-update-id" as string | null,
  channel: "test-channel" as string | null,
  runtimeVersion: "1.0.0" as string | null,
  isEmbeddedLaunch: false,
}

jest.mock("expo-updates", () => ({
  __esModule: true,
  get updateId() {
    return mockUpdatesState.updateId
  },
  get channel() {
    return mockUpdatesState.channel
  },
  get runtimeVersion() {
    return mockUpdatesState.runtimeVersion
  },
  get isEmbeddedLaunch() {
    return mockUpdatesState.isEmbeddedLaunch
  },
}))

const mockExpoConfig: { version?: string; extra: { appVariant?: string; releaseCommit?: string } } =
  { extra: {} }

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig
    },
  },
}))

describe("observability initialization", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAnalytics.enabled = false
    mockExpoConfig.extra = {}
    delete mockExpoConfig.version
    mockUpdatesState.updateId = "test-update-id"
    mockUpdatesState.channel = "test-channel"
    mockUpdatesState.runtimeVersion = "1.0.0"
    mockUpdatesState.isEmbeddedLaunch = false
  })

  afterEach(() => {
    jest.restoreAllMocks()
    setTelemetryAdapter()
  })

  it.each([
    ["ios", 0],
    ["android", 1],
    ["web", 1],
  ] as const)("configures replay for %s", (platform, errorReplaySampleRate) => {
    jest.replaceProperty(Platform, "OS", platform)
    initObservability()

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        sendDefaultPii: false,
        enableLogs: false,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: errorReplaySampleRate,
        integrations: [
          { type: platform === "web" ? "browserReplay" : "mobileReplay" },
          { type: "tracing" },
          { type: "navigation" },
          { type: "feedback" },
        ],
      }),
    )
  })

  it.each([
    ["production", "production", "production"],
    ["production", "beta", "beta"],
    ["production", null, "local"],
    ["preview", "preview", "preview"],
    ["development", null, "development"],
    ["perf", "", "perf"],
    ["local", "production", "production"],
    ["local", "", "local"],
    [undefined, null, "local"],
  ] as const)("reports a %s build on channel %s as %s", (appVariant, channel, environment) => {
    const development = __DEV__
    Reflect.set(globalThis, "__DEV__", false)
    mockExpoConfig.extra = { appVariant }
    mockUpdatesState.channel = channel
    try {
      initObservability()
    } finally {
      Reflect.set(globalThis, "__DEV__", development)
    }

    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ environment }))
  })

  it("reports any __DEV__ bundle as development", () => {
    mockExpoConfig.extra = { appVariant: "production" }
    mockUpdatesState.channel = "production"
    initObservability()

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "development" }),
    )
  })

  it("prefers the build's Sentry environment over the update channel", () => {
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT = "development"
    try {
      initObservability()
    } finally {
      delete process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT
    }

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "development" }),
    )
  })

  it("passes masking configuration to mobileReplayIntegration", () => {
    initObservability()

    expect(Sentry.mobileReplayIntegration).toHaveBeenCalledWith({
      maskAllText: true,
      maskAllImages: true,
      maskAllVectors: true,
    })
  })

  it("traces launch and navigation without request spans", () => {
    initObservability()

    expect(Sentry.reactNativeTracingIntegration).toHaveBeenCalledWith({
      traceFetch: false,
      traceXHR: false,
    })
  })

  it.each(["ios", "android"] as const)("traces %s only while usage sharing is on", (platform) => {
    jest.replaceProperty(Platform, "OS", platform)
    initObservability()
    const { tracesSampler } = (Sentry.init as jest.Mock).mock.calls[0][0]

    expect(tracesSampler()).toBe(0)
    mockAnalytics.enabled = true
    expect(tracesSampler()).toBe(0.2)
  })

  it("does not trace web", () => {
    jest.replaceProperty(Platform, "OS", "web")
    initObservability()

    expect((Sentry.init as jest.Mock).mock.calls[0][0].tracesSampler).toBeUndefined()
  })

  it("uploads transactions without breadcrumbs, so request URLs stay out", () => {
    mockAnalytics.enabled = true
    initObservability()
    const { beforeSendTransaction } = (Sentry.init as jest.Mock).mock.calls[0][0]

    const event = beforeSendTransaction({
      type: "transaction",
      transaction: "settings",
      breadcrumbs: [{ category: "xhr", data: { url: "https://api.example.test/private?code=1" } }],
    })

    expect(event).toEqual({ type: "transaction", transaction: "settings", breadcrumbs: [] })
  })

  it("drops a transaction that finishes after sharing was turned off", () => {
    mockAnalytics.enabled = true
    initObservability()
    const { tracesSampler, beforeSendTransaction } = (Sentry.init as jest.Mock).mock.calls[0][0]
    expect(tracesSampler()).toBe(0.2)

    mockAnalytics.enabled = false

    expect(beforeSendTransaction({ type: "transaction", transaction: "settings" })).toBeNull()
  })

  it("forwards telemetry to the sync timing adapter", () => {
    initObservability()

    emitTelemetry("join.completed", { durationMs: 840, outcome: "success" })

    expect(mockAnalytics.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "join.completed",
        metadata: { durationMs: 840, outcome: "success" },
      }),
    )
  })

  it("sets release correlation tags from expo-updates", () => {
    initObservability()

    expect(Sentry.setTags).toHaveBeenCalledWith({
      updateId: "test-update-id",
      updateChannel: "test-channel",
      runtimeVersion: "1.0.0",
      embeddedLaunch: "false",
    })
  })

  it("stamps outbox records with the same build identity as the Sentry tags", () => {
    const setOutboxWriter = jest.spyOn(durableOutbox, "setOutboxWriter")
    mockExpoConfig.version = "1.4.0"
    initObservability()
    mockExpoConfig.extra = { releaseCommit: "0123456789abcdef0123456789abcdef01234567" }
    initObservability()

    expect(setOutboxWriter.mock.calls).toEqual([
      [{ app: "1.4.0", update: "test-update-id", runtime: "1.0.0" }],
      [{ app: "1.4.0", update: "test-update-id", runtime: "1.0.0", commit: "0123456789ab" }],
    ])
  })

  it("wires telemetry adapter to emit breadcrumbs with only allowed metadata", () => {
    initObservability()

    emitTelemetry("mutation.ack", {
      durationMs: 123,
      attemptCount: 2,
      platform: "ios",
      outcome: "success",
      extraField: "should-be-filtered",
    })

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "telemetry",
      message: "mutation.ack",
      data: {
        durationMs: 123,
        attemptCount: 2,
        platform: "ios",
        outcome: "success",
      },
      level: "info",
    })
  })

  it("does not include disallowed metadata fields in breadcrumbs", () => {
    initObservability()

    emitTelemetry("error.handled", {
      errorCode: "HANDLED",
      extraField: "filtered",
      anotherField: "also-filtered",
    })

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "telemetry",
      message: "error.handled",
      data: {
        errorCode: "HANDLED",
      },
      level: "info",
    })
  })

  it("handles fallback values from expo-updates when fields are unavailable", () => {
    mockUpdatesState.updateId = null
    mockUpdatesState.channel = null
    mockUpdatesState.runtimeVersion = null
    mockUpdatesState.isEmbeddedLaunch = true

    initObservability()

    expect(Sentry.setTags).toHaveBeenCalledWith({
      updateId: "embedded",
      updateChannel: "none",
      runtimeVersion: "unknown",
      embeddedLaunch: "true",
    })
  })
})
