import { act, renderHook } from "@testing-library/react-native"

import { OFFLINE_AFTER_MS } from "@/features/connected/boardSyncSignal"

import { useLastingOffline } from "./useLastingOffline"

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

it("ignores a brief drop, then reports one that lasts until the connection returns", () => {
  const { result, rerender } = renderHook((online: boolean) => useLastingOffline(online), {
    initialProps: false,
  })
  act(() => jest.advanceTimersByTime(OFFLINE_AFTER_MS - 1))
  rerender(true)
  act(() => jest.advanceTimersByTime(OFFLINE_AFTER_MS))
  expect(result.current).toBe(false)

  rerender(false)
  act(() => jest.advanceTimersByTime(OFFLINE_AFTER_MS))
  expect(result.current).toBe(true)

  rerender(true)
  expect(result.current).toBe(false)
})
