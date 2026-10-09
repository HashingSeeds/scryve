import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { ConvexError } from "convex/values"

import { components } from "../_generated/api"
import type { ActionCtx } from "../_generated/server"

export const deckRateLimiter = new RateLimiter(components.rateLimiter, {
  catalogRefresh: { kind: "token bucket", rate: 1, period: 5 * MINUTE, capacity: 1 },
  deckImport: { kind: "token bucket", rate: 6, period: MINUTE, capacity: 3 },
  guestDeckImport: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  cardLookup: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  guestCardLookup: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
})

async function limitCaller(
  ctx: ActionCtx,
  limits: { signedIn: "deckImport" | "cardLookup"; guest: "guestDeckImport" | "guestCardLookup" },
  retryVerb: string,
) {
  const identity = await ctx.auth.getUserIdentity()
  // eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code -- Records the shared anonymous quota scaling limit.
  // ponytail: guests share a provider-work budget; use edge IP limits if traffic needs fairer quotas.
  const result = identity
    ? await deckRateLimiter.limit(ctx, limits.signedIn, { key: identity.tokenIdentifier })
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

export async function limitCardLookup(ctx: ActionCtx) {
  await limitCaller(ctx, { signedIn: "cardLookup", guest: "guestCardLookup" }, "searching")
}
