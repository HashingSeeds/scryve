import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { requireIdentity } from "./lib/auth"

const consentDocument = v.union(v.literal("terms"), v.literal("privacy"))

export const currentAcceptances = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const acceptances = await ctx.db
      .query("legalAcceptances")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
      .collect()
    return acceptances.map(({ document, version, acceptedAt }) => ({
      document,
      version,
      acceptedAt,
    }))
  },
})

export const recordAcceptance = mutation({
  args: {
    document: consentDocument,
    version: v.string(),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const version = args.version.trim()
    if (!version) throw new Error("A document version is required")
    const existing = await ctx.db
      .query("legalAcceptances")
      .withIndex("by_clerk_user_and_document", (q) =>
        q.eq("clerkUserId", identity.subject).eq("document", args.document),
      )
      .unique()
    const acceptedAt = Date.now()
    if (existing) {
      if (existing.version === version) return { acceptedAt: existing.acceptedAt }
      await ctx.db.patch(existing._id, { version, platform: args.platform, acceptedAt })
      return { acceptedAt }
    }
    await ctx.db.insert("legalAcceptances", {
      clerkUserId: identity.subject,
      document: args.document,
      version,
      platform: args.platform,
      acceptedAt,
    })
    return { acceptedAt }
  },
})
