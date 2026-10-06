import { useCallback } from "react"
import { Platform } from "react-native"
import { useFocusEffect } from "expo-router"
import * as ScreenOrientation from "expo-screen-orientation"

let boardLocks = 0

export function useBoardPortraitLock() {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "web") return
      // why: a rotating window makes React Native relayout a few frames late and flash; large screens may ignore the lock, so useGameBoardOrientation's counter-rotation stays as the fallback.
      if (boardLocks++ === 0)
        void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
          () => undefined,
        )
      return () => {
        if (--boardLocks === 0) void ScreenOrientation.unlockAsync().catch(() => undefined)
      }
    }, []),
  )
}
