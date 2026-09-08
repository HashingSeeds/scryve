import rateLimiter from "@convex-dev/rate-limiter/convex.config.js"
import { defineApp } from "convex/server"
import { v } from "convex/values"

const app = defineApp({
  env: {
    CLERK_SECRET_KEY: v.optional(v.string()),
    CLERK_WEBHOOK_SIGNING_SECRET: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
    MODERATION_ALERT_TO: v.optional(v.string()),
    MODERATION_ALERT_FROM: v.optional(v.string()),
    WAITLIST_INGEST_SECRET: v.optional(v.string()),
    YGO_IMAGE_BASE_URL: v.optional(v.string()),
  },
})

app.use(rateLimiter)

export default app
