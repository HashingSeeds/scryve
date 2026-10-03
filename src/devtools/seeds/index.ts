import type { Href } from "expo-router"

import { seedGame } from "./gameSeed"
import { SeedError, type SeedParams } from "./seedTypes"

/**
 * why: `/dev/seed/<kind>` resolves kinds here, so a new kind (decks next) needs only
 * a seed function that writes its state and returns where to open it.
 */
const SEEDS = {
  game: seedGame,
} satisfies Record<string, (params: SeedParams) => Href | Promise<Href>>

type SeedKind = keyof typeof SEEDS

function isSeedKind(value: string): value is SeedKind {
  return Object.keys(SEEDS).includes(value)
}

export async function runSeed(
  kind: string,
  params: Readonly<Record<string, string | string[] | undefined>>,
): Promise<Href> {
  if (!isSeedKind(kind))
    throw new SeedError(`Unknown seed "${kind}". Try one of ${Object.keys(SEEDS).join(", ")}.`)
  const flattened: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const last = Array.isArray(value) ? value.at(-1) : value
    if (last !== undefined) flattened[key] = last
  }
  return SEEDS[kind](flattened)
}
