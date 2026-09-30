import { DeviceEventEmitter, Dimensions, Platform } from "react-native"
import * as ScreenOrientation from "expo-screen-orientation"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import {
  nativeGameBoardRotation,
  rotateGameBoardAnchor,
  useGameBoardOrientation,
} from "./useGameBoardOrientation"

jest.mock("expo-screen-orientation", () => ({
  OrientationLock: { DEFAULT: 0 },
  Orientation: { UNKNOWN: 0, PORTRAIT_UP: 1, LANDSCAPE_LEFT: 3, LANDSCAPE_RIGHT: 4 },
  getOrientationAsync: jest.fn(),
  addOrientationChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}))

it("preserves portrait board dimensions and maps its menu junction in both landscape directions", async () => {
  const window = Dimensions.get("window")
  const screen = Dimensions.get("screen")
  Dimensions.set({
    window: { width: 844, height: 390, scale: 3, fontScale: 1 },
    screen: { width: 844, height: 390, scale: 3, fontScale: 1 },
  })
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
  act(() => {
    Dimensions.set({ window, screen })
    listener({
      orientationInfo: { orientation: ScreenOrientation.Orientation.PORTRAIT_UP },
      orientationLock: ScreenOrientation.OrientationLock.DEFAULT,
    })
  })
  expect(view.result.current.rotation).toBe(0)
  expect(rotateGameBoardAnchor(anchor, 0)).toEqual(anchor)
  view.unmount()
  const subscription = jest.mocked(ScreenOrientation.addOrientationChangeListener).mock.results[0]
    .value
  expect(subscription.remove).toHaveBeenCalled()
})

it("refreshes Android landscape direction even when the window size stays the same", async () => {
  const window = Dimensions.get("window")
  const screen = Dimensions.get("screen")
  jest.replaceProperty(Platform, "OS", "android")
  Dimensions.set({
    window: { width: 844, height: 390, scale: 3, fontScale: 1 },
    screen: { width: 844, height: 390, scale: 3, fontScale: 1 },
  })
  jest
    .mocked(ScreenOrientation.getOrientationAsync)
    .mockResolvedValue(ScreenOrientation.Orientation.LANDSCAPE_LEFT)
  const view = renderHook(useGameBoardOrientation)
  await waitFor(() => expect(view.result.current.rotation).toBe(-90))
  jest
    .mocked(ScreenOrientation.getOrientationAsync)
    .mockResolvedValue(ScreenOrientation.Orientation.LANDSCAPE_RIGHT)
  act(() => DeviceEventEmitter.emit("namedOrientationDidChange", { rotationDegrees: -90 }))
  await waitFor(() => expect(view.result.current.rotation).toBe(90))
  view.unmount()
  Dimensions.set({ window, screen })
  jest.restoreAllMocks()
})

it.each(["dimensions-first", "orientation-first"])(
  "keeps rotation coherent with %s events",
  async (order) => {
    const window = Dimensions.get("window")
    const screen = Dimensions.get("screen")
    Dimensions.set({
      window: { width: 390, height: 844, scale: 3, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
    })
    jest
      .mocked(ScreenOrientation.getOrientationAsync)
      .mockResolvedValue(ScreenOrientation.Orientation.PORTRAIT_UP)
    const rotations: number[] = []
    const view = renderHook(() => {
      const board = useGameBoardOrientation()
      rotations.push(board.rotation)
      return board
    })
    await act(async () => {})
    const listener = jest
      .mocked(ScreenOrientation.addOrientationChangeListener)
      .mock.calls.at(-1)![0]
    const resize = () =>
      Dimensions.set({
        window: { width: 844, height: 390, scale: 3, fontScale: 1 },
        screen: { width: 844, height: 390, scale: 3, fontScale: 1 },
      })
    const rotate = () =>
      listener({
        orientationInfo: { orientation: ScreenOrientation.Orientation.LANDSCAPE_RIGHT },
        orientationLock: ScreenOrientation.OrientationLock.DEFAULT,
      })
    act(order === "dimensions-first" ? resize : rotate)
    const intermediate = view.result.current
    act(order === "dimensions-first" ? rotate : resize)
    const finalRotation = view.result.current.rotation
    view.unmount()
    act(() => Dimensions.set({ window, screen }))
    expect(intermediate).toMatchObject({ rotation: 0, screenWidth: 390, screenHeight: 844 })
    expect(finalRotation).toBe(90)
    expect(rotations).not.toContain(-90)
  },
)

it("updates a portrait-shaped split window on a landscape screen", async () => {
  const window = Dimensions.get("window")
  const screen = Dimensions.get("screen")
  Dimensions.set({
    window: { width: 400, height: 800, scale: 2, fontScale: 1 },
    screen: { width: 1200, height: 800, scale: 2, fontScale: 1 },
  })
  jest
    .mocked(ScreenOrientation.getOrientationAsync)
    .mockResolvedValue(ScreenOrientation.Orientation.LANDSCAPE_RIGHT)
  const view = renderHook(useGameBoardOrientation)
  await act(async () => {})
  act(() =>
    Dimensions.set({
      window: { width: 500, height: 800, scale: 2, fontScale: 1 },
      screen: { width: 1200, height: 800, scale: 2, fontScale: 1 },
    }),
  )
  const board = view.result.current
  view.unmount()
  act(() => Dimensions.set({ window, screen }))
  expect(board).toMatchObject({ width: 500, height: 800, screenWidth: 500, rotation: 0 })
})

it.each([-90, 90])(
  "uses Android's immediate angle %i without waiting for an async read",
  async (rotationDegrees) => {
    const window = Dimensions.get("window")
    const screen = Dimensions.get("screen")
    jest.replaceProperty(Platform, "OS", "android")
    Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale: 1 } })
    jest
      .mocked(ScreenOrientation.getOrientationAsync)
      .mockResolvedValue(ScreenOrientation.Orientation.PORTRAIT_UP)
    const view = renderHook(useGameBoardOrientation)
    await act(async () => {})
    jest
      .mocked(ScreenOrientation.getOrientationAsync)
      .mockImplementation(() => new Promise(() => {}))
    act(() => DeviceEventEmitter.emit("namedOrientationDidChange", { rotationDegrees }))
    const beforeResize = view.result.current
    act(() => Dimensions.set({ window: { width: 844, height: 390, scale: 3, fontScale: 1 } }))
    const landscape = view.result.current
    act(() => DeviceEventEmitter.emit("namedOrientationDidChange", { rotationDegrees: 0 }))
    const beforeReturn = view.result.current
    act(() => Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale: 1 } }))
    const portrait = view.result.current
    view.unmount()
    Dimensions.set({ window, screen })
    jest.restoreAllMocks()
    expect(beforeResize).toMatchObject({ rotation: 0, screenWidth: 390 })
    expect(landscape).toMatchObject({ rotation: -rotationDegrees, screenWidth: 844 })
    expect(beforeReturn).toEqual(landscape)
    expect(portrait).toMatchObject({ rotation: 0, screenWidth: 390 })
  },
)

it("handles an Android tablet with a naturally landscape display", async () => {
  const window = Dimensions.get("window")
  const screen = Dimensions.get("screen")
  jest.replaceProperty(Platform, "OS", "android")
  Dimensions.set({ window: { width: 1200, height: 800, scale: 2, fontScale: 1 } })
  jest
    .mocked(ScreenOrientation.getOrientationAsync)
    .mockResolvedValue(ScreenOrientation.Orientation.LANDSCAPE_RIGHT)
  const view = renderHook(useGameBoardOrientation)
  await act(async () => {})
  act(() => DeviceEventEmitter.emit("namedOrientationDidChange", { rotationDegrees: 180 }))
  await waitFor(() => expect(view.result.current.rotation).toBe(-90))
  const board = view.result.current
  view.unmount()
  Dimensions.set({ window, screen })
  jest.restoreAllMocks()
  expect(board).toMatchObject({ width: 800, height: 1200, screenWidth: 1200 })
})

it.each([
  [false, 0, 0],
  [false, 90, 90],
  [false, 180, 0],
  [false, 270, -90],
  [true, 0, 90],
  [true, 90, 0],
  [true, 180, -90],
  [true, 270, 0],
])(
  "maps native rotation on naturalLandscape=%s at %i° to %i°",
  (naturalLandscape, angle, rotation) => {
    expect(nativeGameBoardRotation(angle, naturalLandscape)).toBe(rotation)
  },
)

it("keeps the portrait board unrotated when the keyboard makes the window wide", async () => {
  const window = Dimensions.get("window")
  const screen = Dimensions.get("screen")
  const portrait = { width: 390, height: 844, scale: 3, fontScale: 1 }
  Dimensions.set({ window: portrait, screen: portrait })
  jest
    .mocked(ScreenOrientation.getOrientationAsync)
    .mockResolvedValue(ScreenOrientation.Orientation.PORTRAIT_UP)
  const view = renderHook(useGameBoardOrientation)
  await act(async () => {})
  act(() => Dimensions.set({ window: { ...portrait, height: 300 }, screen: portrait }))
  const board = view.result.current
  view.unmount()
  Dimensions.set({ window, screen })
  expect(board.rotation).toBe(0)
  expect(board.nativeFrame).toBeUndefined()
})
