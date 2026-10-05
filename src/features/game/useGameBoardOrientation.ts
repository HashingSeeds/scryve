import { useEffect, useState } from "react"
import { DeviceEventEmitter, Dimensions, Platform } from "react-native"
import * as ScreenOrientation from "expo-screen-orientation"
import Animated, {
  measure,
  SensorType,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedSensor,
  useSharedValue,
} from "react-native-reanimated"

export function useGameBoardOrientation() {
  const [board, setBoard] = useState(() => ({
    ...Dimensions.get("window"),
    screen: Dimensions.get("screen"),
    rotation: 0,
  }))

  const frameRef = useAnimatedRef<Animated.View>()
  const { sensor } = useAnimatedSensor(SensorType.GRAVITY, {
    interval: 32,
    adjustToInterfaceOrientation: false,
  })
  const nativeFrame = useSharedValue<{ width: number; height: number; rotation: number } | null>(
    null,
  )
  const measuredWindow = useSharedValue({ width: 0, height: 0 })
  const naturalLandscape = useSharedValue<boolean | null>(null)
  const android = Platform.OS === "android"
  const screen = board.screen
  const fullWindow = board.width / screen.width > 0.9 && board.height / screen.height > 0.9
  const screenLandscape = screen.width > screen.height
  useAnimatedReaction(
    () => sensor.value,
    (sample) => {
      if (!fullWindow) {
        nativeFrame.value = null
        naturalLandscape.value = null
        return
      }
      if (sample.x === 0 && sample.y === 0 && sample.z === 0) return
      const sideways = sample.interfaceOrientation === 90 || sample.interfaceOrientation === 270
      if (naturalLandscape.value === null) {
        const frame = measure(frameRef)
        if (!frame || frame.width > frame.height !== screenLandscape) return
        naturalLandscape.value = android && screenLandscape !== sideways
      }
      const rotation = nativeGameBoardRotation(sample.interfaceOrientation, naturalLandscape.value)
      if (
        nativeFrame.value?.rotation === rotation &&
        measuredWindow.value.width === board.width &&
        measuredWindow.value.height === board.height
      )
        return
      const frame = measure(frameRef)
      if (!frame || frame.width > frame.height !== (rotation !== 0)) return
      nativeFrame.value = { width: frame.width, height: frame.height, rotation }
      measuredWindow.value = { width: board.width, height: board.height }
    },
  )

  useEffect(() => {
    let active = true
    let revision = 0
    let orientation = ScreenOrientation.Orientation.UNKNOWN
    let androidRotationDegrees: number | undefined
    let frame: number | undefined
    function publish() {
      const dimensions = Dimensions.get("window")
      const landscape = dimensions.width > dimensions.height
      const screen = Dimensions.get("screen")
      const screenLandscape = screen.width > screen.height
      const landscapeOrientation =
        orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      if (
        Platform.OS !== "web" &&
        androidRotationDegrees === undefined &&
        (orientation === ScreenOrientation.Orientation.UNKNOWN ||
          screenLandscape !== landscapeOrientation)
      )
        return
      if (!active) return
      const landscapeRotation =
        androidRotationDegrees === undefined
          ? orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
            ? 90
            : -90
          : androidRotationDegrees === 0 || androidRotationDegrees === -90
            ? 90
            : -90
      const rotation = landscape && screenLandscape ? landscapeRotation : 0
      setBoard({ ...dimensions, screen, rotation })
    }
    async function refreshOrientation() {
      const requestedRevision = ++revision
      try {
        const current = await ScreenOrientation.getOrientationAsync()
        if (active && revision === requestedRevision) {
          orientation = current
          publish()
        }
      } catch {
        return
      }
    }
    const subscription =
      Platform.OS === "android"
        ? undefined
        : ScreenOrientation.addOrientationChangeListener(({ orientationInfo }) => {
            revision += 1
            orientation = orientationInfo.orientation
            publish()
          })
    const dimensionsSubscription = Dimensions.addEventListener("change", () => {
      publish()
      if (androidRotationDegrees === undefined) void refreshOrientation()
    })
    const androidSubscription =
      Platform.OS === "android"
        ? DeviceEventEmitter.addListener(
            "namedOrientationDidChange",
            ({ rotationDegrees }: { rotationDegrees: number }) => {
              revision += 1
              androidRotationDegrees = rotationDegrees
              if (frame !== undefined) cancelAnimationFrame(frame)
              frame = requestAnimationFrame(publish)
            },
          )
        : undefined
    void refreshOrientation()
    return () => {
      active = false
      subscription?.remove()
      if (frame !== undefined) cancelAnimationFrame(frame)
      dimensionsSubscription.remove()
      androidSubscription?.remove()
    }
  }, [])

  return {
    width: Math.min(board.width, board.height),
    height: Math.max(board.width, board.height),
    screenWidth: board.width,
    screenHeight: board.height,
    fontScale: board.fontScale,
    frameRef,
    nativeFrame: fullWindow ? nativeFrame : undefined,
    rotation: board.rotation,
  }
}

export function rotateGameBoardAnchor(anchor: { x: number; y: number }, rotation: number) {
  "worklet"
  if (rotation === 90) return { x: 1 - anchor.y, y: anchor.x }
  if (rotation === -90) return { x: anchor.y, y: 1 - anchor.x }
  return anchor
}

export function nativeGameBoardRotation(interfaceOrientation: number, naturalLandscape: boolean) {
  "worklet"
  const sideways = interfaceOrientation === 90 || interfaceOrientation === 270
  if (sideways === naturalLandscape) return 0
  return interfaceOrientation === 0 || interfaceOrientation === 90 ? 90 : -90
}
