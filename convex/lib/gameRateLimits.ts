import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { ConvexError } from "convex/values"

import { components } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

// why: the outbox sends one tap per round trip, so a fast player peaks near 5-10/s for a few seconds; 60 absorbs that and 5/s sustained still fits a host running several seats.
export const gameRateLimiter = new RateLimiter(components.rateLimiter, {
  gameWrite: { kind: "token bucket", rate: 5 * 60, period: MINUTE, capacity: 60 },
  lobbyCreate: { kind: "token bucket", rate: 20, period: HOUR, capacity: 5 },
})

/** why: `rate_limited` is not a permanent write code, so installed clients' outboxes retry with backoff instead of dropping the change. */
export async function limitGameRate(
  ctx: MutationCtx,
  name: "gameWrite" | "lobbyCreate",
  userId: Id<"users">,
) {
  const result = await gameRateLimiter.limit(ctx, name, { key: userId })
  if (!result.ok)
    throw new ConvexError({
      code: "rate_limited",
      message: `Too many requests at once. Try again in ${Math.ceil(result.retryAfter / 1000)} seconds.`,
      retryAfterMs: result.retryAfter,
    })
}
