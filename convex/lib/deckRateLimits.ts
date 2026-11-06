import { DAY, MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { ConvexError } from "convex/values"

import { components } from "../_generated/api"
import type { Doc } from "../_generated/dataModel"
import type { ActionCtx, MutationCtx } from "../_generated/server"

export const deckRateLimiter = new RateLimiter(components.rateLimiter, {
  manualResult: { kind: "fixed window", rate: 50, period: DAY },
  localGamePublish: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  catalogRefresh: { kind: "token bucket", rate: 1, period: 5 * MINUTE, capacity: 1 },
  deckImport: { kind: "token bucket", rate: 6, period: MINUTE, capacity: 3 },
  cardLookup: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  guestCardLookup: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  // why: all guests draw from this one budget, so minting device ids cannot multiply guest provider work; most guest calls make one Scryfall request, and its slowest endpoints allow ~110 a minute.
  guestShare: { kind: "token bucket", rate: 50, period: MINUTE, capacity: 20 },
})

const DEVICE_ID = /^[A-Za-z0-9_-]{8,128}$/

async function limitGuest(ctx: ActionCtx, perDevice?: "guestCardLookup", deviceId?: string) {
  if (perDevice && deviceId !== undefined && DEVICE_ID.test(deviceId)) {
    const device = await deckRateLimiter.limit(ctx, perDevice, { key: `device:${deviceId}` })
    if (!device.ok) return device
  }
  return await deckRateLimiter.limit(ctx, "guestShare")
}

async function limitCaller(
  ctx: ActionCtx,
  limits: { signedIn: "deckImport" | "cardLookup"; perGuestDevice?: "guestCardLookup" },
  retryVerb: string,
  deviceId?: string,
) {
  const identity = await ctx.auth.getUserIdentity()
  const result = identity
    ? await deckRateLimiter.limit(ctx, limits.signedIn, { key: identity.tokenIdentifier })
    : await limitGuest(ctx, limits.perGuestDevice, deviceId)
  if (!result.ok)
    throw new ConvexError({
      code: "rate_limited",
      message: `Try ${retryVerb} again in ${Math.ceil(result.retryAfter / 1000)} seconds.`,
      retryAfterMs: result.retryAfter,
    })
}

export async function limitDeckImport(ctx: ActionCtx) {
  await limitCaller(ctx, { signedIn: "deckImport" }, "importing")
}

/** why: `deviceId` is client-supplied and spoofable, so it only splits guest budgets; `guestShare` caps all guests together. */
export async function limitCardLookup(ctx: ActionCtx, deviceId?: string) {
  await limitCaller(
    ctx,
    { signedIn: "cardLookup", perGuestDevice: "guestCardLookup" },
    "searching",
    deviceId,
  )
}

export async function limitResultRate(
  ctx: MutationCtx,
  name: "manualResult" | "localGamePublish",
  userId: Doc<"users">["_id"],
) {
  const result = await deckRateLimiter.limit(ctx, name, { key: userId })
  if (!result.ok)
    throw new ConvexError({
      code: "rate_limited",
      message: "Too many results. Try again later.",
      retryAfterMs: result.retryAfter,
    })
}
