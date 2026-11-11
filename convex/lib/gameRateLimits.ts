import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { ConvexError } from "convex/values"

import { guestDeviceKey } from "./deckRateLimits"
import { components } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

export const gameRateLimiter = new RateLimiter(components.rateLimiter, {
  gameWrite: { kind: "token bucket", rate: 5 * 60, period: MINUTE, capacity: 60 },
  lobbyCreate: { kind: "token bucket", rate: 20, period: HOUR, capacity: 5 },
  eventCreate: { kind: "token bucket", rate: 10, period: HOUR, capacity: 10 },
  eventJoin: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 10 },
  eventLookup: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 10 },
  guestEventLookup: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },
  joinCodeMiss: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 120 },
})

type CodeSpace = "games" | "events"

function rateLimited(retryAfter: number) {
  return new ConvexError({
    code: "rate_limited",
    message: `Too many requests at once. Try again in ${Math.ceil(retryAfter / 1000)} seconds.`,
    retryAfterMs: retryAfter,
  })
}

/** why: `rate_limited` is not a permanent write code, so installed clients' outboxes retry with backoff instead of dropping the change. */
export async function limitGameRate(
  ctx: MutationCtx,
  name: "gameWrite" | "lobbyCreate" | "eventCreate" | "eventJoin",
  userId: Id<"users">,
) {
  const result = await gameRateLimiter.limit(ctx, name, { key: userId })
  if (!result.ok) throw rateLimited(result.retryAfter)
}

export async function limitEventLookup(ctx: MutationCtx, deviceId?: string) {
  const identity = await ctx.auth.getUserIdentity()
  const key = identity ? `user:${identity.tokenIdentifier}` : guestDeviceKey(deviceId)
  if (key) {
    const own = await gameRateLimiter.limit(ctx, "eventLookup", { key })
    if (!own.ok) throw rateLimited(own.retryAfter)
  }
  if (identity) return
  const shared = await gameRateLimiter.limit(ctx, "guestEventLookup")
  if (!shared.ok) throw rateLimited(shared.retryAfter)
}

export async function codeGuessWait(ctx: MutationCtx, space: CodeSpace) {
  const status = await gameRateLimiter.check(ctx, "joinCodeMiss", { key: space })
  return status.ok ? undefined : status.retryAfter
}

/** why: callers must return rather than throw after this, or the spent token rolls back. */
export async function countCodeMiss(ctx: MutationCtx, space: CodeSpace) {
  await gameRateLimiter.limit(ctx, "joinCodeMiss", { key: space })
}

export async function assertCodeGuessesOpen(ctx: MutationCtx, space: CodeSpace) {
  const wait = await codeGuessWait(ctx, space)
  if (wait !== undefined) throw rateLimited(wait)
}
