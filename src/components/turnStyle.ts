import { useSyncExternalStore } from "react"

export const TURN_STYLES = ["frames", "dim", "row"] as const
export type TurnStyle = (typeof TURN_STYLES)[number]

let current: TurnStyle = "row"
const listeners = new Set<() => void>()

export function setTurnStyle(style: TurnStyle) {
  current = style
  listeners.forEach((listener) => listener())
}

export function useTurnStyle() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}
