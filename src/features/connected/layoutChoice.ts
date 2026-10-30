import { load, save } from "@/utils/storage"

import { RESUME_INDEX_LIMIT } from "./persistence"
import {
  isPlayerGridLayoutVariant,
  type PlayerGridLayoutVariant,
} from "../../../convex/lib/layouts"

export interface LayoutChoice {
  playerCount: number
  layout: PlayerGridLayoutVariant
}

type StoredChoice = LayoutChoice & { gameId: string }

const LAYOUT_CHOICES_KEY = "count.connected.layouts.v1"

function storedChoices(): StoredChoice[] {
  const stored = load(LAYOUT_CHOICES_KEY)
  return Array.isArray(stored) ? stored.filter(isStoredChoice) : []
}

function isStoredChoice(value: unknown): value is StoredChoice {
  if (typeof value !== "object" || value === null) return false
  const { gameId, playerCount, layout } = value as Record<string, unknown>
  return (
    typeof gameId === "string" &&
    typeof playerCount === "number" &&
    isPlayerGridLayoutVariant(layout)
  )
}

export function loadLayoutChoice(gameId: string): LayoutChoice | undefined {
  const stored = storedChoices().find((choice) => choice.gameId === gameId)
  return stored && { playerCount: stored.playerCount, layout: stored.layout }
}

/** why: one entry per game would pile up in storage forever, so the oldest fall off past the resume list's size. */
export function saveLayoutChoice(gameId: string, choice: LayoutChoice): void {
  save(
    LAYOUT_CHOICES_KEY,
    [{ gameId, ...choice }, ...storedChoices().filter((stored) => stored.gameId !== gameId)].slice(
      0,
      RESUME_INDEX_LIMIT,
    ),
  )
}
