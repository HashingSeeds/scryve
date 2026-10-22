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
  guestDeckImport: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  cardLookup: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  guestCardLookup: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
})

const DEVICE_ID = /^[A-Za-z0-9_-]{8,128}$/

async function limitCaller(
  ctx: ActionCtx,
  limits: { signedIn: "deckImport" | "cardLookup"; guest: "guestDeckImport" | "guestCardLookup" },
  retryVerb: string,
  deviceId?: string,
) {
  const identity = await ctx.auth.getUserIdentity()
  // eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code -- Records the shared anonymous quota scaling limit.
  // ponytail: guests without a device id share a provider-work budget; use edge IP limits if traffic needs fairer quotas.
  const result = identity
    ? await deckRateLimiter.limit(ctx, limits.signedIn, { key: identity.tokenIdentifier })
    : deviceId !== undefined && DEVICE_ID.test(deviceId)
      ? await deckRateLimiter.limit(ctx, limits.guest, { key: `device:${deviceId}` })
      : await deckRateLimiter.limit(ctx, limits.guest)
  if (!result.ok)
    throw new ConvexError({
      code: "rate_limited",
      message: `Try ${retryVerb} again in ${Math.ceil(result.retryAfter / 1000)} seconds.`,
      retryAfterMs: result.retryAfter,
    })
}

export async function limitDeckImport(ctx: ActionCtx) {
  await limitCaller(ctx, { signedIn: "deckImport", guest: "guestDeckImport" }, "importing")
}

/** why: `deviceId` is client-supplied and spoofable, so it only splits guest budgets; the provider pacers in `externalApiRateLimits` still cap the total upstream rate. */
export async function limitCardLookup(ctx: ActionCtx, deviceId?: string) {
  await limitCaller(
    ctx,
    { signedIn: "cardLookup", guest: "guestCardLookup" },
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
