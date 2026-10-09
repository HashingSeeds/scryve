import { ConvexError } from "convex/values"

import {
  isSystemId,
  SYSTEMS,
  type CapabilityKey,
  type IntegrationDefinition,
  type SystemId,
} from "./systems"
import type { MutationCtx, QueryCtx } from "../_generated/server"

export { CAPABILITY_KEYS, SYSTEM_IDS as GAME_SYSTEM_IDS } from "./systems"
export type { CapabilityKey, CapabilityRelease, SystemId as GameSystemId } from "./systems"

export type Integration = IntegrationDefinition & { id: SystemId; displayName: string }

export function integrationFor<Id extends SystemId>(id: Id) {
  const { label, integration } = SYSTEMS[id]
  return { id, displayName: label, ...integration } satisfies Integration
}

export function integration(game: string): Integration | undefined {
  return isSystemId(game) ? integrationFor(game) : undefined
}

export function assertGameSystem(game: string): SystemId {
  if (!isSystemId(game))
    throw new ConvexError({ code: "unknown_game", message: "Unknown game system" })
  return game
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
    ...(override
      ? {
          release: override.release,
          ...(override.note === undefined ? {} : { note: override.note }),
        }
      : {}),
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
