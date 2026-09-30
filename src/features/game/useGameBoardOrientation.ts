import { useEffect, useState } from "react"
import { DeviceEventEmitter, Platform, useWindowDimensions } from "react-native"
import * as ScreenOrientation from "expo-screen-orientation"

export function useGameBoardOrientation() {
  const dimensions = useWindowDimensions()
  const [orientation, setOrientation] = useState(ScreenOrientation.Orientation.UNKNOWN)

  useEffect(() => {
    let active = true
    let revision = 0
    async function refreshOrientation() {
      const requestedRevision = ++revision
      try {
        const current = await ScreenOrientation.getOrientationAsync()
        if (
          active &&
          revision === requestedRevision &&
          current !== ScreenOrientation.Orientation.UNKNOWN
        ) {
          setOrientation(current)
        }
      } catch {
        return
      }
    }
    const subscription = ScreenOrientation.addOrientationChangeListener(({ orientationInfo }) => {
      revision += 1
      setOrientation(orientationInfo.orientation)
    })
    const androidSubscription =
      Platform.OS === "android"
        ? DeviceEventEmitter.addListener("namedOrientationDidChange", refreshOrientation)
        : undefined
    void refreshOrientation()
    return () => {
      active = false
      subscription.remove()
      androidSubscription?.remove()
    }
  }, [])

  const rotation =
    dimensions.width > dimensions.height
      ? orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
        ? 90
        : -90
      : 0
  return {
    width: Math.min(dimensions.width, dimensions.height),
    height: Math.max(dimensions.width, dimensions.height),
    fontScale: dimensions.fontScale,
    rotation,
  }
}

export function rotateGameBoardAnchor(anchor: { x: number; y: number }, rotation: number) {
  if (rotation === 90) return { x: 1 - anchor.y, y: anchor.x }
  if (rotation === -90) return { x: anchor.y, y: 1 - anchor.x }
  return anchor
}
