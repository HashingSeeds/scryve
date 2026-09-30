import { DeviceEventEmitter, Dimensions, Platform } from "react-native"
import * as ScreenOrientation from "expo-screen-orientation"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import { rotateGameBoardAnchor, useGameBoardOrientation } from "./useGameBoardOrientation"

jest.mock("expo-screen-orientation", () => ({
  OrientationLock: { DEFAULT: 0 },
  Orientation: { UNKNOWN: 0, PORTRAIT_UP: 1, LANDSCAPE_LEFT: 3, LANDSCAPE_RIGHT: 4 },
  getOrientationAsync: jest.fn(),
  addOrientationChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}))

it("preserves portrait board dimensions and maps its menu junction in both landscape directions", async () => {
  const window = Dimensions.get("window")
  Dimensions.set({ window: { width: 844, height: 390, scale: 3, fontScale: 1 } })
  jest
    .mocked(ScreenOrientation.getOrientationAsync)
    .mockResolvedValue(ScreenOrientation.Orientation.LANDSCAPE_LEFT)
  const view = renderHook(useGameBoardOrientation)
  await waitFor(() => expect(view.result.current.rotation).toBe(-90))
  expect(view.result.current).toMatchObject({ width: 390, height: 844 })
  const anchor = { x: 0.5, y: 5 / 14 }
  expect(rotateGameBoardAnchor(anchor, view.result.current.rotation)).toEqual({ x: 5 / 14, y: 0.5 })
  const listener = jest.mocked(ScreenOrientation.addOrientationChangeListener).mock.calls[0][0]
  act(() =>
    listener({
      orientationInfo: { orientation: ScreenOrientation.Orientation.LANDSCAPE_RIGHT },
      orientationLock: ScreenOrientation.OrientationLock.DEFAULT,
    }),
  )
  expect(view.result.current.rotation).toBe(90)
  expect(rotateGameBoardAnchor(anchor, 90)).toEqual({ x: expect.closeTo(9 / 14), y: 0.5 })
  act(() => Dimensions.set({ window }))
  expect(view.result.current.rotation).toBe(0)
  expect(rotateGameBoardAnchor(anchor, 0)).toEqual(anchor)
  view.unmount()
  const subscription = jest.mocked(ScreenOrientation.addOrientationChangeListener).mock.results[0]
    .value
  expect(subscription.remove).toHaveBeenCalled()
})

it("refreshes Android landscape direction even when the window size stays the same", async () => {
  const window = Dimensions.get("window")
  jest.replaceProperty(Platform, "OS", "android")
  Dimensions.set({ window: { width: 844, height: 390, scale: 3, fontScale: 1 } })
  jest
    .mocked(ScreenOrientation.getOrientationAsync)
    .mockResolvedValue(ScreenOrientation.Orientation.LANDSCAPE_LEFT)
  const view = renderHook(useGameBoardOrientation)
  await waitFor(() => expect(view.result.current.rotation).toBe(-90))
  jest
    .mocked(ScreenOrientation.getOrientationAsync)
    .mockResolvedValue(ScreenOrientation.Orientation.LANDSCAPE_RIGHT)
  act(() => DeviceEventEmitter.emit("namedOrientationDidChange"))
  await waitFor(() => expect(view.result.current.rotation).toBe(90))
  view.unmount()
  Dimensions.set({ window })
  jest.restoreAllMocks()
})
