/** @jest-environment jsdom */
import { AppState } from "react-native"
import { PostHog } from "posthog-js"

import { storage } from "@/utils/storage"

it("sends web exceptions without analytics and only allows replay payloads during the error window", async () => {
  jest.useFakeTimers()
  storage.clearAll()
  window.localStorage.clear()
  const previousKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
  const previousHost = process.env.EXPO_PUBLIC_POSTHOG_HOST
  process.env.EXPO_PUBLIC_POSTHOG_KEY = "test-key"
  process.env.EXPO_PUBLIC_POSTHOG_HOST = "https://diagnostics.invalid"
  const request = jest.spyOn(PostHog.prototype, "_send_request").mockImplementation(() => undefined)
  const start = jest
    .spyOn(PostHog.prototype, "startSessionRecording")
    .mockImplementation(() => undefined)
  const stop = jest
    .spyOn(PostHog.prototype, "stopSessionRecording")
    .mockImplementation(() => undefined)
  const init = jest.spyOn(PostHog.prototype, "init")
  const addListener = jest.spyOn(AppState, "addEventListener")
  try {
    const diagnostics: typeof import("./diagnostics.web") = require("./diagnostics.web")
    diagnostics.initDiagnostics()
    const client = init.mock.contexts[0]
    expect(client.capture("game_started")).toBeUndefined()
    expect(client.capture("$snapshot", { snapshot_data: [] })).toBeUndefined()
    expect(start).not.toHaveBeenCalled()
    const capture = jest.spyOn(client, "capture")
    diagnostics.captureDiagnosticError(new Error("web error person@example.com"), "Handled")
    await jest.advanceTimersByTimeAsync(1)
    const exception = capture.mock.results.find(({ value }) => value?.event === "$exception")?.value
    expect(exception).toMatchObject({ event: "$exception", properties: { token: "test-key" } })
    expect(JSON.stringify(exception)).not.toContain("person@example.com")
    expect(start).toHaveBeenCalledTimes(1)
    expect(client.capture("$snapshot", { snapshot_data: [] })?.properties.token).toBe("test-key")
    expect(client.capture("$autocapture")).toBeUndefined()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(client.capture("$snapshot", { snapshot_data: [] })).toBeUndefined()
    for (const [event, handler] of addListener.mock.calls) if (event === "change") handler("active")
    await jest.advanceTimersByTimeAsync(1)
    expect(start).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalled()
  } finally {
    if (previousKey === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_KEY
    else process.env.EXPO_PUBLIC_POSTHOG_KEY = previousKey
    if (previousHost === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_HOST
    else process.env.EXPO_PUBLIC_POSTHOG_HOST = previousHost
    jest.restoreAllMocks()
    jest.useRealTimers()
  }
})
