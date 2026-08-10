import { v } from "convex/values"

import { internal } from "./_generated/api"
import { env, internalAction } from "./_generated/server"

function retryDelayMs(attempts: number) {
  return Math.min(60 * 2 ** attempts, 3600) * 1000
}

export const deleteClerkIdentity = internalAction({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.accountDeletion.identityTarget, args)
    if (!target) return null
    try {
      if (!env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY is not configured")
      const response = await fetch(
        `https://api.clerk.com/v1/users/${encodeURIComponent(target.clerkUserId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
        },
      )
      if (response.ok || response.status === 404) {
        await ctx.runMutation(internal.accountDeletion.complete, args)
        return null
      }
      throw new Error(`Clerk deletion failed with status ${response.status}`)
    } catch (cause) {
      const result = await ctx.runMutation(internal.accountDeletion.recordIdentityFailure, {
        ...args,
        message: cause instanceof Error ? cause.message : "Clerk identity deletion failed",
      })
      if (result?.shouldRetry)
        await ctx.scheduler.runAfter(
          retryDelayMs(result.attempts),
          internal.accountDeletionActions.deleteClerkIdentity,
          args,
        )
      return null
    }
  },
})
