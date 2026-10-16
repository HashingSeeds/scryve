import { useEffect, useLayoutEffect, useReducer, useRef } from "react"
import { AccessibilityInfo } from "react-native"

import type { GameMenuSignal } from "@/components/GameRadialMenu"
import type { TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"

import type { ConnectionStatus } from "./model"

export const SLOW_AFTER_MS = 3_000
export const OFFLINE_AFTER_MS = 2_000
export const CAUGHT_UP_FLASH_MS = 700

export type BoardSyncSignal =
  | { kind: "live" }
  | { kind: "slow"; unsent: number }
  | { kind: "offline"; unsent: number; since: number }
  | { kind: "catchingUp"; unsent: number }
  | { kind: "caughtUp" }
  | { kind: "attention"; rejected: number }

export type BoardSyncTone = Exclude<BoardSyncSignal["kind"], "live">

export interface BoardSyncInput {
  connectionStatus: ConnectionStatus
  unsent: number
  oldestUnsentAt?: number
  rejected: number
  needsAttention: boolean
}

export interface BoardSyncMemory {
  offlineAt?: number
  offlineShown: boolean
  catchingUp: boolean
  caughtUpUntil?: number
}

export const INITIAL_BOARD_SYNC_MEMORY: BoardSyncMemory = { offlineShown: false, catchingUp: false }

export function nextBoardSyncSignal(
  input: BoardSyncInput,
  previous: BoardSyncMemory,
  now: number,
): {
  signal: BoardSyncSignal
  memory: BoardSyncMemory
  offlineSince?: number
  wakeAt?: number
} {
  const offline = input.connectionStatus === "offline"
  const offlineAt = offline ? (previous.offlineAt ?? now) : undefined
  const offlineVisible = offlineAt !== undefined && now - offlineAt >= OFFLINE_AFTER_MS
  const reconnectedWithUnsent = !offline && previous.offlineShown && input.unsent > 0
  const wasCatchingUp = previous.catchingUp || reconnectedWithUnsent
  const finishedCatchingUp = wasCatchingUp && !offline && input.unsent === 0
  const memory: BoardSyncMemory = {
    offlineAt,
    offlineShown: offline ? previous.offlineShown || offlineVisible : false,
    catchingUp: wasCatchingUp && !finishedCatchingUp,
    caughtUpUntil: finishedCatchingUp ? now + CAUGHT_UP_FLASH_MS : previous.caughtUpUntil,
  }
  const slowAt =
    input.oldestUnsentAt === undefined ? undefined : input.oldestUnsentAt + SLOW_AFTER_MS

  const signal: BoardSyncSignal =
    input.rejected > 0 || input.needsAttention
      ? { kind: "attention", rejected: input.rejected }
      : offlineVisible
        ? { kind: "offline", unsent: input.unsent, since: offlineAt }
        : !offline && memory.catchingUp
          ? { kind: "catchingUp", unsent: input.unsent }
          : !offline && slowAt !== undefined && now >= slowAt
            ? { kind: "slow", unsent: input.unsent }
            : memory.caughtUpUntil !== undefined && now < memory.caughtUpUntil
              ? { kind: "caughtUp" }
              : { kind: "live" }

  const upcoming = [
    offlineAt !== undefined && !offlineVisible ? offlineAt + OFFLINE_AFTER_MS : undefined,
    !offline && slowAt !== undefined && now < slowAt ? slowAt : undefined,
    memory.caughtUpUntil !== undefined && now < memory.caughtUpUntil
      ? memory.caughtUpUntil
      : undefined,
  ].filter((time): time is number => time !== undefined)

  return {
    signal,
    memory,
    offlineSince: offlineVisible ? offlineAt : undefined,
    wakeAt: upcoming.length > 0 ? Math.min(...upcoming) : undefined,
  }
}

export function boardSyncStatusText(signal: BoardSyncSignal): string | undefined {
  switch (signal.kind) {
    case "slow":
      return translate("connected:sync.status.slow", { unsent: signal.unsent })
    case "offline":
      return signal.unsent > 0
        ? translate("connected:sync.status.offlineSaved", { count: signal.unsent })
        : translate("connected:sync.offline")
    case "catchingUp":
      return translate("connected:sync.status.catchingUp", { unsent: signal.unsent })
    case "attention":
      return signal.rejected > 0
        ? translate("connected:sync.status.notAccepted", { count: signal.rejected })
        : translate("connected:sync.status.needsAttention")
    default:
      return undefined
  }
}

export function boardSyncAccessibilityText(signal: BoardSyncSignal): string | undefined {
  switch (signal.kind) {
    case "slow":
      return translate("connected:sync.accessibility.slow", { count: signal.unsent })
    case "offline":
      return signal.unsent > 0
        ? translate("connected:sync.accessibility.offlineSaved", { count: signal.unsent })
        : translate("connected:sync.offline")
    case "catchingUp":
      return translate("connected:sync.accessibility.catchingUp", { count: signal.unsent })
    default:
      return boardSyncStatusText(signal)
  }
}

export function boardSyncMenuSignal(signal: BoardSyncSignal): GameMenuSignal | undefined {
  if (signal.kind === "live") return undefined
  const badge =
    signal.kind === "attention"
      ? "!"
      : (signal.kind === "offline" || signal.kind === "catchingUp") && signal.unsent > 0
        ? String(signal.unsent)
        : undefined
  return { tone: signal.kind, badge, accessibilityText: boardSyncAccessibilityText(signal) }
}

const ANNOUNCEMENTS: Partial<Record<BoardSyncSignal["kind"], TxKeyPath>> = {
  offline: "connected:sync.announcement.offline",
  attention: "connected:sync.announcement.attention",
}

export function useBoardSyncSignal(input: BoardSyncInput): {
  signal: BoardSyncSignal
  offlineSince?: number
} {
  const committedMemory = useRef(INITIAL_BOARD_SYNC_MEMORY)
  const [wakeCount, wake] = useReducer((count: number) => count + 1, 0)
  const result = nextBoardSyncSignal(input, committedMemory.current, Date.now())

  useLayoutEffect(() => {
    committedMemory.current = result.memory
  })

  useEffect(() => {
    if (result.wakeAt === undefined) return
    const timer = setTimeout(wake, Math.max(0, result.wakeAt - Date.now()))
    return () => clearTimeout(timer)
  }, [result.wakeAt, wakeCount])

  const announcementKey = ANNOUNCEMENTS[result.signal.kind]
  const announcement = announcementKey && translate(announcementKey)
  useEffect(() => {
    if (announcement) AccessibilityInfo.announceForAccessibility(announcement)
  }, [announcement])

  return { signal: result.signal, offlineSince: result.offlineSince }
}
