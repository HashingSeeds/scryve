import { AppState, type AppStateStatus } from "react-native"
import { renderHook } from "@testing-library/react-native"

import { SyncLatency } from "@/features/connected/syncLatency"
import { captureAnalytics } from "@/utils/analytics"

import { useLatencyReports } from "./useLatencyReports"

jest.mock("@/utils/analytics", () => ({ captureAnalytics: jest.fn() }))

it("sends an event's times when the app is put away, and none for time away", () => {
  let change: ((state: AppStateStatus) => void) | undefined
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    change = listener
    return { remove: jest.fn() }
  })
  let time = 0
  const latency = new SyncLatency({ transport: "cloud", scope: "event" }, () => time)
  renderHook(() => useLatencyReports(latency))

  time = 120
  latency.commandShown(0)
  change!("background")
  expect(captureAnalytics).toHaveBeenCalledWith(
    "sync_latency",
    expect.objectContaining({ transport: "cloud", scope: "event", ack_count: 1, ack_p50: 120 }),
  )

  time = 9_000
  change!("active")
  latency.commandShown(100)
  expect(latency.summary()).toEqual({})
})
