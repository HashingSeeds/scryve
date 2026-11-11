import { HOUR, RateLimiter } from "@convex-dev/rate-limiter"
import { ConvexError } from "convex/values"

import { components } from "../_generated/api"
import type { ActionCtx } from "../_generated/server"

const billingRateLimiter = new RateLimiter(components.rateLimiter, {
  // why: each sync spends a RevenueCat API request on the secret key. Apps sync on launch, foreground, purchase and restore, a few a session, and retry `rate_limited` with backoff; the webhook still delivers a purchase meanwhile.
  revenueCatSync: { kind: "token bucket", rate: 60, period: HOUR, capacity: 20 },
})

export async function limitRevenueCatSync(ctx: ActionCtx, tokenIdentifier: string) {
  const result = await billingRateLimiter.limit(ctx, "revenueCatSync", { key: tokenIdentifier })
  if (!result.ok)
    throw new ConvexError({
      code: "rate_limited",
      message: `Try again in ${Math.ceil(result.retryAfter / 1000)} seconds.`,
      retryAfterMs: result.retryAfter,
    })
}
