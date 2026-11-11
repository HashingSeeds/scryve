import { act, renderHook } from "@testing-library/react-native"
import { ConvexError } from "convex/values"

import { useEventIdForCode } from "./useEventIdForCode"

const mockResolveCode = jest.fn()

jest.mock("convex/react", () => ({ useMutation: () => mockResolveCode }))
jest.mock("@/features/game/localPersistence", () => ({
  LocalGameRepository: class {
    getDeviceId() {
      return "device-1"
    }
  },
}))

const rateLimited = new ConvexError({
  code: "rate_limited",
  message: "Slow down",
  retryAfterMs: 2_000,
})

beforeEach(() => {
  jest.useFakeTimers()
  mockResolveCode.mockReset()
})

afterEach(() => jest.useRealTimers())

test("a rate-limited lookup retries after the server's wait", async () => {
  mockResolveCode.mockRejectedValueOnce(rateLimited).mockResolvedValueOnce("event-1")
  const { result } = renderHook(() => useEventIdForCode("ABC123"))
  await act(async () => {})
  expect(result.current).toBeUndefined()

  await act(async () => jest.advanceTimersByTime(2_000))
  expect(mockResolveCode).toHaveBeenCalledTimes(2)
  expect(result.current).toBe("event-1")
})

test("any other lookup error is thrown instead of retried", async () => {
  const fault = new Error("Server Error")
  mockResolveCode.mockRejectedValueOnce(fault)
  let thrown: unknown
  renderHook(() => {
    try {
      return useEventIdForCode("ABC123")
    } catch (cause) {
      thrown = cause
      return undefined
    }
  })
  await act(async () => {})
  await act(async () => jest.advanceTimersByTime(60_000))

  expect(thrown).toBe(fault)
  expect(mockResolveCode).toHaveBeenCalledTimes(1)
})
