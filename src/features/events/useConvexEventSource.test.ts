import { renderHook } from "@testing-library/react-native"

import { captureAnalytics } from "@/utils/analytics"

import { useConvexEventSource } from "./useConvexEventSource"

jest.mock("@/utils/analytics", () => ({ captureAnalytics: jest.fn() }))
jest.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => () => new Promise((resolve) => setTimeout(resolve, 180)),
}))

it("times a cloud event command until Convex settles it, and reports when the screen closes", async () => {
  jest.useFakeTimers()
  const { result, unmount } = renderHook(() => useConvexEventSource("event1"))

  const confirming = result.current.confirm("table1")
  jest.advanceTimersByTime(180)
  await confirming
  unmount()

  expect(captureAnalytics).toHaveBeenCalledWith(
    "sync_latency",
    expect.objectContaining({ transport: "cloud", scope: "event", ack_count: 1, ack_p50: 180 }),
  )
  jest.useRealTimers()
})
