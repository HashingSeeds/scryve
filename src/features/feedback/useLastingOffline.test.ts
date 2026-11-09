import { AppState, type AppStateStatus } from "react-native"
import { act, renderHook } from "@testing-library/react-native"

import { OFFLINE_AFTER_MS } from "@/features/connected/boardSyncSignal"

import { useLastingOffline } from "./useLastingOffline"

let appStateListener: ((state: AppStateStatus) => void) | undefined

function moveApp(state: AppStateStatus) {
  act(() => {
    AppState.currentState = state
    appStateListener?.(state)
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  AppState.currentState = "active"
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener
    return { remove: () => (appStateListener = undefined) }
  })
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

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

it("counts only foreground time, so a drop seen before backgrounding stays quiet on resume", () => {
  const { result } = renderHook(() => useLastingOffline(false))
  moveApp("background")
  act(() => jest.advanceTimersByTime(OFFLINE_AFTER_MS * 10))
  moveApp("active")
  expect(result.current).toBe(false)

  act(() => jest.advanceTimersByTime(OFFLINE_AFTER_MS))
  expect(result.current).toBe(true)
})
