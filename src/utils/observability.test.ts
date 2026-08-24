import * as Sentry from "@sentry/react-native"

import { initObservability } from "@/utils/observability"
import { emitTelemetry, setTelemetryAdapter } from "@/utils/telemetry"

jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  setTags: jest.fn(),
  addBreadcrumb: jest.fn(),
  mobileReplayIntegration: jest.fn(() => ({ type: "mobileReplay" })),
  feedbackIntegration: jest.fn(() => ({ type: "feedback" })),
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

describe("observability initialization", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdatesState.updateId = "test-update-id"
    mockUpdatesState.channel = "test-channel"
    mockUpdatesState.runtimeVersion = "1.0.0"
    mockUpdatesState.isEmbeddedLaunch = false
  })

  afterEach(() => {
    setTelemetryAdapter()
  })

  it("calls Sentry.init with correct configuration", () => {
    initObservability()

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        sendDefaultPii: false,
        enableLogs: false,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1,
      }),
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

  it("includes both mobileReplayIntegration and feedbackIntegration", () => {
    initObservability()

    const callArgs = (Sentry.init as jest.Mock).mock.calls[0][0]
    expect(callArgs.integrations).toHaveLength(2)
    expect(callArgs.integrations[0].type).toBe("mobileReplay")
    expect(callArgs.integrations[1].type).toBe("feedback")
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
