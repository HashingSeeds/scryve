import { useSyncExternalStore } from "react"

import { loadString, saveString } from "@/utils/storage"

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

const PASS_LABEL_KEY = "turns.passLabelPasses"
const PASS_LABEL_LESSONS = 3

export const passLabelShown = () => Number(loadString(PASS_LABEL_KEY) ?? 0) < PASS_LABEL_LESSONS

export function notePass() {
  saveString(PASS_LABEL_KEY, String(Number(loadString(PASS_LABEL_KEY) ?? 0) + 1))
}
