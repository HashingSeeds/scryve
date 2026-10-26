import { useSyncExternalStore } from "react"
import type { Hinge } from "expo-hinge"
import { makeMutable } from "react-native-reanimated"

/** why: no one on the team has an iPhone Duo, so dev builds can treat any device as one and drive its hinge from a slider. */
export const pretendHingeAngle = makeMutable(0)

// why: a real Duo moves its window to the inner display at about 20 degrees, so below that the pretend one counts as closed.
export const PRETEND_OPENS_AT_DEG = 20

const state = { pretending: false, open: false }
let snapshot = state
const listeners = new Set<() => void>()

function update(next: Partial<typeof state>) {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((listener) => listener())
}

export function setPretendDuo(on: boolean) {
  if (!__DEV__ || snapshot.pretending === on) return
  pretendHingeAngle.set(0)
  update({ pretending: on, open: false })
}

export function setPretendDuoOpen(open: boolean) {
  if (snapshot.open !== open) update({ open })
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}
const read = () => snapshot

export const usePretendDuo = () => useSyncExternalStore(subscribe, read, read)

export function pretendHinge(angle: number): Hinge {
  "worklet"
  return { angle, status: angle >= 180 ? "fullyOpen" : "partiallyOpen" }
}
