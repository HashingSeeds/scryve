import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { ConvexError } from "convex/values"

import { components } from "../_generated/api"
import type { ActionCtx } from "../_generated/server"

export const deckRateLimiter = new RateLimiter(components.rateLimiter, {
  catalogRefresh: { kind: "token bucket", rate: 1, period: 5 * MINUTE, capacity: 1 },
  deckImport: { kind: "token bucket", rate: 6, period: MINUTE, capacity: 3 },
  guestDeckImport: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
})

export async function limitDeckImport(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity()
  // eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code -- Records the shared anonymous quota scaling limit.
  // ponytail: guests share a provider-work budget; use edge IP limits if traffic needs fairer quotas.
  const result = identity
    ? await deckRateLimiter.limit(ctx, "deckImport", { key: identity.tokenIdentifier })
    : await deckRateLimiter.limit(ctx, "guestDeckImport")
  if (!result.ok)
    throw new ConvexError({
      code: "rate_limited",
      message: `Try importing again in ${Math.ceil(result.retryAfter / 1000)} seconds.`,
      retryAfterMs: result.retryAfter,
    })
}
