import { ConvexError } from "convex/values"

import type { MutationCtx, QueryCtx } from "../_generated/server"

export const GAME_SYSTEM_IDS = ["mtg", "ygo", "pokemon"] as const
export type GameSystemId = (typeof GAME_SYSTEM_IDS)[number]

export const CAPABILITY_KEYS = [
  "integration",
  "cardCatalog",
  "deckImport",
  "exampleDecks",
  "images",
  "playTracking",
  "aggregateMetagameStats",
] as const
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]
export type CapabilityRelease = "enabled" | "permission_required" | "disabled"

type Capability = {
  technical: "available" | "unavailable"
  release: CapabilityRelease
  provider?: string
  note?: string
}

type Integration = {
  id: GameSystemId
  displayName: string
  identityNamespace: string
  capabilities: Record<CapabilityKey, Capability>
  rights: {
    review: "reviewed" | "permission_pending" | "blocked"
    basis: "fan_policy" | "fair_use" | "explicit_license" | "publisher_api" | "unknown"
    imageUse: "licensed" | "functional_card_context" | "text_only" | "none"
    requiredNotices: readonly string[]
  }
}

const available = (provider?: string, note?: string): Capability => ({
  technical: "available",
  release: "enabled",
  ...(provider ? { provider } : {}),
  ...(note ? { note } : {}),
})

export const INTEGRATIONS = {
  mtg: {
    id: "mtg",
    displayName: "Magic: The Gathering",
    identityNamespace: "scryfall-oracle",
    capabilities: {
      integration: available("scryve"),
      cardCatalog: available("scryfall"),
      deckImport: available("scryfall"),
      exampleDecks: available("mtgjson"),
      images: available("scryfall", "Functional card context only."),
      playTracking: available("scryve"),
      aggregateMetagameStats: available("scryve"),
    },
    rights: {
      review: "reviewed",
      basis: "fan_policy",
      imageUse: "functional_card_context",
      requiredNotices: ["Magic: The Gathering is property of Wizards of the Coast."],
    },
  },
  ygo: {
    id: "ygo",
    displayName: "Yu-Gi-Oh!",
    identityNamespace: "ygoprodeck-card",
    capabilities: {
      integration: available("scryve"),
      cardCatalog: available("ygoprodeck", "Card metadata is cached in Convex."),
      deckImport: available("ygoprodeck"),
      exampleDecks: available("ygoprodeck-decks", "Cleaned Top Decks only."),
      images: available("cloudflare-r2", "Functional card context through Scryve's mirror."),
      playTracking: available("scryve"),
      aggregateMetagameStats: available("scryve"),
    },
    rights: {
      review: "reviewed",
      basis: "fair_use",
      imageUse: "functional_card_context",
      requiredNotices: [
        "Yu-Gi-Oh! and related card content remain property of their respective owners.",
      ],
    },
  },
  pokemon: {
    id: "pokemon",
    displayName: "Pokemon TCG",
    identityNamespace: "tcgdex-card",
    capabilities: {
      integration: available("scryve"),
      cardCatalog: available("tcgdex"),
      deckImport: available("tcgdex"),
      exampleDecks: available("limitless", "Cleaned tournament deck data only."),
      images: available("tcgdex", "Functional card context only."),
      playTracking: available("scryve"),
      aggregateMetagameStats: available("scryve"),
    },
    rights: {
      review: "reviewed",
      basis: "fair_use",
      imageUse: "functional_card_context",
      requiredNotices: [
        "Pokemon, card artwork, and related marks remain property of their respective owners.",
      ],
    },
  },
} as const satisfies Record<GameSystemId, Integration>

export function integration(game: string): Integration | undefined {
  return GAME_SYSTEM_IDS.includes(game as GameSystemId)
    ? (INTEGRATIONS[game as GameSystemId] as Integration)
    : undefined
}

export function assertGameSystem(game: string): GameSystemId {
  if (!integration(game))
    throw new ConvexError({ code: "unknown_game", message: "Unknown game system" })
  return game as GameSystemId
}

type DatabaseCtx = QueryCtx | MutationCtx

export async function capabilityState(ctx: DatabaseCtx, game: string, capability: CapabilityKey) {
  const known = integration(game)
  if (!known) throw new ConvexError({ code: "unknown_game", message: "Unknown game system" })
  const override = await ctx.db
    .query("integrationOverrides")
    .withIndex("by_game_and_capability", (query) =>
      query.eq("game", game).eq("capability", capability),
    )
    .unique()
  return {
    ...known.capabilities[capability],
    ...(override ? { release: override.release, note: override.note } : {}),
  }
}

export async function requireReleasedCapability(
  ctx: DatabaseCtx,
  game: string,
  capability: CapabilityKey,
) {
  if (!(await capabilityReleased(ctx, game, capability)))
    throw new ConvexError({
      code: "capability_unavailable",
      message: `${integration(game)?.displayName ?? game} ${capability} is not released`,
    })
  return await capabilityState(ctx, game, capability)
}

export async function capabilityReleased(
  ctx: DatabaseCtx,
  game: string,
  capability: CapabilityKey,
) {
  const integrationState = await capabilityState(ctx, game, "integration")
  const state = await capabilityState(ctx, game, capability)
  return (
    integrationState.technical === "available" &&
    integrationState.release === "enabled" &&
    state.technical === "available" &&
    state.release === "enabled"
  )
}
