import * as ScreenOrientation from "expo-screen-orientation"
import { renderHook } from "@testing-library/react-native"

import { useBoardPortraitLock } from "./useBoardPortraitLock"

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => require("react").useEffect(callback, [callback]),
}))

it("holds the window in portrait until the last focused board closes", () => {
  const first = renderHook(useBoardPortraitLock)
  const second = renderHook(useBoardPortraitLock)
  expect(ScreenOrientation.lockAsync).toHaveBeenCalledTimes(1)
  expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith(
    ScreenOrientation.OrientationLock.PORTRAIT_UP,
  )
  first.unmount()
  expect(ScreenOrientation.unlockAsync).not.toHaveBeenCalled()
  second.unmount()
  expect(ScreenOrientation.unlockAsync).toHaveBeenCalledTimes(1)
})
