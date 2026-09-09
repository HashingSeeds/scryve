import { AppState } from "react-native"
import * as NativePostHog from "@posthog/react-native-plugin"

import { storage } from "@/utils/storage"

import { diagnosticProperties } from "./diagnosticsPolicy"

jest.mock("@posthog/react-native-plugin", () => ({
  setup: jest.fn().mockResolvedValue(undefined),
  isEnabled: jest.fn().mockResolvedValue(false),
  startRecording: jest.fn().mockResolvedValue(undefined),
  stopRecording: jest.fn().mockResolvedValue(undefined),
  startSession: jest.fn(),
  endSession: jest.fn(),
  setOptOut: jest.fn(),
  addExceptionStep: jest.fn(),
}))

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  jest.useRealTimers()
  jest.restoreAllMocks()
  delete process.env.EXPO_PUBLIC_POSTHOG_KEY
  delete process.env.EXPO_PUBLIC_POSTHOG_HOST
})

it("keeps errors and post-error replay working through analytics opt-in, offline withdrawal, and reconnect", async () => {
  jest.useFakeTimers()
  storage.clearAll()
  process.env.EXPO_PUBLIC_POSTHOG_KEY = "test-key"
  process.env.EXPO_PUBLIC_POSTHOG_HOST = "https://diagnostics.invalid"
  const fetchMock = jest
    .fn()
    .mockResolvedValue({ status: 200, text: async () => "{}", json: async () => ({}) })
  global.fetch = fetchMock
  jest.spyOn(console, "warn").mockImplementation(() => undefined)
  jest.spyOn(console, "error").mockImplementation(() => undefined)
  const addListener = jest.spyOn(AppState, "addEventListener")
  const diagnostics: typeof import("./diagnostics") = require("./diagnostics")
  const analytics: typeof import("./analytics") = require("./analytics")
  diagnostics.initDiagnostics()
  await jest.advanceTimersByTimeAsync(100)
  expect(NativePostHog.setup).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ optOut: false }),
    expect.objectContaining({
      sessionReplay: expect.objectContaining({ enabled: false }),
      errorTracking: expect.objectContaining({ nativeAutocapture: true }),
    }),
  )
  expect(NativePostHog.startRecording).not.toHaveBeenCalled()
  expect(analytics.analyticsEnabled()).toBe(false)

  diagnostics.captureDiagnosticError(new Error("offline failure token=private-value"), "Handled")
  await jest.advanceTimersByTimeAsync(31_000)
  expect(NativePostHog.startRecording).toHaveBeenCalled()
  const bodies = () =>
    fetchMock.mock.calls.map(([, options]) => String(options?.body ?? "")).join("\n")
  expect(bodies()).toContain("$exception")
  expect(bodies()).not.toContain("private-value")
  expect(bodies()).not.toContain("game_started")

  analytics.setAnalyticsEnabled(true)
  await jest.advanceTimersByTimeAsync(100)
  fetchMock.mockRejectedValue(new Error("offline"))
  analytics.captureAnalytics("game_started", { mode: "local", player_count: 2 })
  diagnostics.captureDiagnosticError(new Error("retained diagnostic"), "Handled")
  await jest.advanceTimersByTimeAsync(31_000)
  analytics.setAnalyticsEnabled(false)
  await jest.advanceTimersByTimeAsync(100)
  expect(NativePostHog.setOptOut).not.toHaveBeenCalledWith(true)
  const queued = storage
    .getAllKeys()
    .map((key) => storage.getString(key))
    .join("")
  expect(queued).toContain("retained diagnostic")
  expect(queued).not.toContain("game_started")

  fetchMock.mockClear()
  fetchMock.mockResolvedValue({ status: 200, text: async () => "{}", json: async () => ({}) })
  await jest.advanceTimersByTimeAsync(61_000)
  expect(bodies()).toContain("retained diagnostic")
  expect(bodies()).not.toContain("game_started")
  expect(NativePostHog.stopRecording).toHaveBeenCalled()

  diagnostics.captureDiagnosticError(new Error("after withdrawal"), "Handled")
  await jest.advanceTimersByTimeAsync(100)
  const starts = jest.mocked(NativePostHog.startRecording).mock.calls.length
  for (const [name, handler] of addListener.mock.calls) if (name === "change") handler("background")
  await jest.advanceTimersByTimeAsync(100)
  expect(NativePostHog.stopRecording).toHaveBeenCalled()
  for (const [name, handler] of addListener.mock.calls) if (name === "change") handler("active")
  await jest.advanceTimersByTimeAsync(100)
  expect(NativePostHog.startRecording).toHaveBeenCalledTimes(starts)
})

it("preserves symbolication metadata while removing personal properties and common secrets", () => {
  const properties = diagnosticProperties({
    token: "public-project-token",
    $debug_images: [{ type: "sourcemap", debug_id: "debug-id" }],
    $exception_list: [
      {
        type: "Error",
        value: "failed https://example.com/join/SECRET token=SECRET person@example.com",
        stacktrace: {
          frames: [{ lineno: 5, colno: 6, function: "join", vars: { password: "SECRET" } }],
        },
      },
    ],
    $current_url: "https://example.com/join/SECRET",
    $set: { email: "person@example.com" },
  })
  expect(properties).toMatchObject({
    token: "public-project-token",
    $debug_images: [{ debug_id: "debug-id" }],
  })
  expect(JSON.stringify(properties)).not.toMatch(/SECRET|person@example.com|\$current_url|\$set/)
  expect(properties).toHaveProperty("$exception_list", [
    expect.objectContaining({
      stacktrace: { frames: [{ lineno: 5, colno: 6, function: "join" }] },
    }),
  ])
})
