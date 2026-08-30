import { ConvexError } from "convex/values"

import { integration, type CapabilityKey, type GameSystemId } from "./integrations"
import { internal } from "../_generated/api"
import type { ActionCtx } from "../_generated/server"

export async function actionCapabilityEnabled(
  ctx: ActionCtx,
  game: GameSystemId,
  capability: CapabilityKey,
) {
  const [integrationState, state] = await Promise.all([
    ctx.runQuery(internal.integrationManifest.getCapabilityState, {
      game,
      capability: "integration",
    }),
    ctx.runQuery(internal.integrationManifest.getCapabilityState, { game, capability }),
  ])
  return (
    integrationState.technical === "available" &&
    integrationState.release === "enabled" &&
    state.technical === "available" &&
    state.release === "enabled"
  )
}

export async function requireActionCapability(
  ctx: ActionCtx,
  game: GameSystemId,
  capability: CapabilityKey,
) {
  if (!(await actionCapabilityEnabled(ctx, game, capability)))
    throw new ConvexError({
      code: "capability_unavailable",
      message: `${integration(game)?.displayName ?? game} ${capability} is not released`,
    })
}
