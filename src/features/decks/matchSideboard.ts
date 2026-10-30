import { useMemo, useSyncExternalStore } from "react"

import { hasLocalGameStarted } from "@/features/game/domain"
import type { LocalGame } from "@/features/game/types"
import { pinnedListCards } from "@/features/stats/listSnapshots"
import { storage } from "@/utils/storage"

import { cardSection, printingKey, type DeckCard } from "./deckCards"
import { sideboardSection } from "./deckDraft"
import { useSeatDeckCards, type SeatDeck } from "./useSeatDeckCards"

const KEY = "count.local.matchSideboard.v1"

export type SwapLine = { key: string; name: string; quantity: number }
export type MatchSwaps = { in: readonly SwapLine[]; out: readonly SwapLine[] }
export type SwapPool = { main: readonly SwapLine[]; side: readonly SwapLine[] }
export type SwapDraft = { in: Record<string, number>; out: Record<string, number> }

const NO_SWAPS: MatchSwaps = { in: [], out: [] }
const listeners = new Set<() => void>()
let cached: { raw: string | undefined; stored: Stored | undefined } | undefined
type Stored = { matchId: string; swaps: MatchSwaps }

function readStored(): Stored | undefined {
  const raw = storage.getString(KEY)
  if (cached && cached.raw === raw) return cached.stored
  let stored: Stored | undefined
  try {
    const value: unknown = raw ? JSON.parse(raw) : undefined
    if (
      isRecord(value) &&
      typeof value.matchId === "string" &&
      isLines(value.in) &&
      isLines(value.out)
    )
      stored = { matchId: value.matchId, swaps: { in: value.in, out: value.out } }
  } catch {}
  cached = { raw, stored }
  return stored
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isLines(value: unknown): value is SwapLine[] {
  return (
    Array.isArray(value) &&
    value.every(
      (line: unknown) =>
        isRecord(line) &&
        typeof line.key === "string" &&
        typeof line.name === "string" &&
        typeof line.quantity === "number" &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0,
    )
  )
}

export function saveMatchSwaps(matchId: string, swaps: MatchSwaps) {
  if (swaps.in.length || swaps.out.length)
    storage.set(KEY, JSON.stringify({ matchId, in: swaps.in, out: swaps.out }))
  else storage.delete(KEY)
  listeners.forEach((listener) => listener())
}

export function loadMatchSwaps(matchId: string | undefined): MatchSwaps {
  const stored = readStored()
  return matchId && stored?.matchId === matchId ? stored.swaps : NO_SWAPS
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useMatchSwaps(matchId: string | undefined) {
  return useSyncExternalStore(subscribe, () => loadMatchSwaps(matchId))
}

export function betweenGames(game: LocalGame | null | undefined) {
  const match = game?.match
  if (!game || !match || match.result || game.status !== "active") return undefined
  return match.gameNumber > 1 && !hasLocalGameStarted(game) ? match : undefined
}

export function matchSeatDeck(account: LocalGame["account"]): SeatDeck | undefined {
  if (!account?.mePlayerId) return undefined
  const { ownerId, deckVersionId, deckKey, deckFingerprint } = account
  if (deckKey && deckFingerprint && (!deckVersionId || pinnedListCards(deckKey, deckFingerprint)))
    return { deckKey, fingerprint: deckFingerprint }
  return deckVersionId ? { ownerId, versionId: deckVersionId } : undefined
}

export function swapPool(
  cards: readonly DeckCard[],
  deck: { game: string; format: string },
): SwapPool | undefined {
  const side = sideboardSection(deck)?.id
  if (!side) return undefined
  const linesIn = (section: string) => {
    const lines = new Map<string, SwapLine>()
    for (const card of cards) {
      if (cardSection(card) !== section) continue
      const key = printingKey(card)
      const quantity = (lines.get(key)?.quantity ?? 0) + card.quantity
      lines.set(key, { key, name: card.name, quantity })
    }
    return [...lines.values()]
  }
  return { main: linesIn("main"), side: linesIn(side) }
}

export function swapCount(lines: readonly SwapLine[]) {
  return lines.reduce((total, line) => total + line.quantity, 0)
}

export function draftOf(swaps: MatchSwaps): SwapDraft {
  const counts = (lines: readonly SwapLine[]) =>
    Object.fromEntries(lines.map((line) => [line.key, line.quantity]))
  return { in: counts(swaps.in), out: counts(swaps.out) }
}

export function swapsOf(draft: SwapDraft, pool: SwapPool): MatchSwaps {
  const moved = (from: readonly SwapLine[], counts: Record<string, number>) =>
    from.flatMap((line) => {
      const quantity = Math.min(counts[line.key] ?? 0, line.quantity)
      return quantity > 0 ? [{ ...line, quantity }] : []
    })
  return { in: moved(pool.side, draft.in), out: moved(pool.main, draft.out) }
}

export function useMatchSideboard(
  game: LocalGame | null | undefined,
  deck: { game: string | undefined; format: string | undefined },
) {
  const match = game?.status === "active" && !game.match?.result ? game.match : undefined
  const account = match ? game?.account : undefined
  const seatDeck = useMemo(() => matchSeatDeck(account), [account])
  const cards = useSeatDeckCards(seatDeck)
  const swaps = useMatchSwaps(match?.id)
  const { game: system, format } = deck
  const pool = useMemo(
    () => (match && system && format ? swapPool(cards, { game: system, format }) : undefined),
    [cards, format, match, system],
  )
  if (!match || !pool?.side.length) return undefined
  return {
    pool,
    swaps,
    canSwap: betweenGames(game) !== undefined,
    apply: (next: MatchSwaps) => saveMatchSwaps(match.id, next),
  }
}
