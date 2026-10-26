import { useSyncExternalStore } from "react"
import type { Hinge } from "expo-hinge"
import { makeMutable } from "react-native-reanimated"

/** why: no one on the team has an iPhone Duo, so dev builds can treat any device as an open one and drive its hinge from a slider. */
export const pretendHingeAngle = makeMutable(180)

let pretending = false
const listeners = new Set<() => void>()

export function setPretendDuo(on: boolean) {
  if (!__DEV__ || pretending === on) return
  pretending = on
  pretendHingeAngle.set(180)
  listeners.forEach((listener) => listener())
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}
const snapshot = () => pretending

export const usePretendDuo = () => useSyncExternalStore(subscribe, snapshot, snapshot)

export function pretendHinge(angle: number): Hinge {
  "worklet"
  return { angle, status: angle >= 180 ? "fullyOpen" : "partiallyOpen" }
}
