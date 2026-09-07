import { AppState, Platform } from "react-native"
import { act, renderHook } from "@testing-library/react-native"

import { requestStoreReview } from "./storeReview"
import { useStoreReview } from "./useStoreReview"

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => require("react").useEffect(callback, [callback]),
}))
jest.mock("./storeReview", () => ({ requestStoreReview: jest.fn(async () => undefined) }))

const originalDev = __DEV__
const originalState = AppState.currentState
const originalPlatform = Platform.OS

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  Object.assign(globalThis, { __DEV__: false })
  AppState.currentState = "active"
  Platform.OS = "ios"
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
  Object.assign(globalThis, { __DEV__: originalDev })
  AppState.currentState = originalState
  Platform.OS = originalPlatform
})

it("waits for the finished summary and invalidates a request on leaving it", () => {
  const hook = renderHook(({ finished }: { finished: boolean }) => useStoreReview(finished), {
    initialProps: { finished: false },
  })
  act(() => jest.advanceTimersByTime(2000))
  expect(requestStoreReview).not.toHaveBeenCalled()
  hook.rerender({ finished: true })
  act(() => jest.advanceTimersByTime(1999))
  expect(requestStoreReview).not.toHaveBeenCalled()
  act(() => jest.advanceTimersByTime(1))
  expect(requestStoreReview).toHaveBeenCalledTimes(1)
  const stillVisible = jest.mocked(requestStoreReview).mock.calls[0][0]
  expect(stillVisible()).toBe(true)
  hook.unmount()
  expect(stillVisible()).toBe(false)
})

it("cancels when navigating away before the delay", () => {
  const hook = renderHook(() => useStoreReview(true))
  hook.unmount()
  act(() => jest.advanceTimersByTime(2000))
  expect(requestStoreReview).not.toHaveBeenCalled()
})

it("cancels on backgrounding even if the app returns before the delay", () => {
  const listener = jest.spyOn(AppState, "addEventListener")
  renderHook(() => useStoreReview(true))
  act(() => listener.mock.calls[0][1]("background"))
  act(() => listener.mock.calls[0][1]("active"))
  act(() => jest.advanceTimersByTime(2000))
  expect(requestStoreReview).not.toHaveBeenCalled()
})

it("skips development builds and web", () => {
  Object.assign(globalThis, { __DEV__: true })
  const dev = renderHook(() => useStoreReview(true))
  act(() => jest.advanceTimersByTime(2000))
  dev.unmount()
  Object.assign(globalThis, { __DEV__: false })
  Platform.OS = "web"
  renderHook(() => useStoreReview(true))
  act(() => jest.advanceTimersByTime(2000))
  expect(requestStoreReview).not.toHaveBeenCalled()
})
