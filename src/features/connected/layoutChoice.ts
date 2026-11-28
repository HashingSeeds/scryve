import { load, save } from "@/utils/storage"

import { RESUME_INDEX_LIMIT } from "./persistence"
import {
  isPlayerGridLayoutVariant,
  type PlayerGridLayoutVariant,
} from "../../../convex/lib/layouts"

export interface LayoutChoice {
  playerCount: number
  layout: PlayerGridLayoutVariant
  slotPlayerIds?: readonly string[]
}

type StoredChoice = LayoutChoice & { gameId: string }

const LAYOUT_CHOICES_KEY = "count.connected.layouts.v1"

function storedChoices(): StoredChoice[] {
  const stored = load(LAYOUT_CHOICES_KEY)
  return Array.isArray(stored) ? stored.filter(isStoredChoice) : []
}

function isStoredChoice(value: unknown): value is StoredChoice {
  if (typeof value !== "object" || value === null) return false
  const { gameId, playerCount, layout, slotPlayerIds } = value as Record<string, unknown>
  return (
    typeof gameId === "string" &&
    typeof playerCount === "number" &&
    isPlayerGridLayoutVariant(layout) &&
    (slotPlayerIds === undefined ||
      (Array.isArray(slotPlayerIds) && slotPlayerIds.every((id) => typeof id === "string")))
  )
}

export function loadLayoutChoice(gameId: string): LayoutChoice | undefined {
  const stored = storedChoices().find((choice) => choice.gameId === gameId)
  if (!stored) return undefined
  const { gameId: _, ...choice } = stored
  return choice
}

export function saveLayoutChoice(gameId: string, choice: LayoutChoice): void {
  save(
    LAYOUT_CHOICES_KEY,
    [{ gameId, ...choice }, ...storedChoices().filter((stored) => stored.gameId !== gameId)].slice(
      0,
      RESUME_INDEX_LIMIT,
    ),
  )
}
