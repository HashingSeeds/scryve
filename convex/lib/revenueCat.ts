import { PREMIUM_FEATURES } from "./entitlements"
import type { Doc } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

export const COUNT_PRO_ENTITLEMENT_ID = "Count Pro"
/** why: Foil sells the same entitlement as Pro, so only its product tells a Foil supporter apart. */
export const FOIL_PRODUCT_ID = "foil_yearly"
export const REVENUECAT_SOURCE = "revenuecat"
export const REVENUECAT_ENVIRONMENTS = ["PRODUCTION", "SANDBOX"] as const

export type RevenueCatEnvironment = (typeof REVENUECAT_ENVIRONMENTS)[number]

type RevenueCatSnapshot = {
  enabled: boolean
  foil: boolean
  observedAt: number
  renewsAt?: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function revenueCatEnvironment(value: string | undefined): RevenueCatEnvironment | null {
  if (value === undefined || value === "PRODUCTION") return "PRODUCTION"
  return value === "SANDBOX" ? value : null
}

function isActiveDate(value: unknown, observedAt: number) {
  if (value === null) return true
  return typeof value === "string" && Date.parse(value) > observedAt
}

function subscriptionFor(subscriber: Record<string, unknown>, productIdentifier: unknown) {
  const subscriptions = asRecord(subscriber.subscriptions)
  return subscriptions && typeof productIdentifier === "string"
    ? asRecord(subscriptions[productIdentifier])
    : null
}

function renewalTime(subscription: Record<string, unknown>, expiresDate: unknown) {
  if (typeof expiresDate !== "string" || subscription.store === "promotional") return undefined
  if (subscription.unsubscribe_detected_at || subscription.billing_issues_detected_at)
    return undefined
  const renewsAt = Date.parse(expiresDate)
  return Number.isFinite(renewsAt) ? renewsAt : undefined
}

export function readRevenueCatSnapshot(
  value: unknown,
  environment: RevenueCatEnvironment,
): RevenueCatSnapshot | null {
  const body = asRecord(value)
  const subscriber = body ? asRecord(body.subscriber) : null
  const observedAt = body?.request_date_ms
  const entitlements = subscriber ? asRecord(subscriber.entitlements) : null
  if (
    !subscriber ||
    typeof observedAt !== "number" ||
    !Number.isFinite(observedAt) ||
    !entitlements
  )
    return null
  const countPro = asRecord(entitlements[COUNT_PRO_ENTITLEMENT_ID])
  if (!countPro) return { enabled: false, foil: false, observedAt }
  const productIdentifier = countPro.product_identifier
  const active =
    isActiveDate(countPro.expires_date, observedAt) ||
    (countPro.grace_period_expires_date !== null &&
      isActiveDate(countPro.grace_period_expires_date, observedAt))
  const subscription = subscriptionFor(subscriber, productIdentifier)
  const enabled = active && subscription?.is_sandbox === (environment === "SANDBOX")
  return {
    enabled,
    foil: enabled && productIdentifier === FOIL_PRODUCT_ID,
    observedAt,
    renewsAt:
      enabled && subscription ? renewalTime(subscription, countPro.expires_date) : undefined,
  }
}

export async function fetchRevenueCatSnapshot(
  appUserId: string,
  apiKey: string,
  environment: RevenueCatEnvironment,
) {
  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!response.ok) throw new Error(`RevenueCat subscriber fetch failed with ${response.status}`)
  const snapshot = readRevenueCatSnapshot(await response.json(), environment)
  if (!snapshot) throw new Error("RevenueCat returned an invalid subscriber response")
  return snapshot
}

export async function applyRevenueCatState(
  ctx: MutationCtx,
  user: Doc<"users">,
  state: Pick<Doc<"revenueCatCustomerStates">, "enabled" | "foil" | "observedAt">,
) {
  const features = Object.values(PREMIUM_FEATURES)
  await Promise.all(
    features.map(async (feature) => {
      const existing = await ctx.db
        .query("userEntitlements")
        .withIndex("by_user_and_feature", (q) => q.eq("userId", user._id).eq("feature", feature))
        .unique()
      const value = {
        enabled: state.enabled && (feature !== PREMIUM_FEATURES.foil || state.foil === true),
        source: REVENUECAT_SOURCE,
        updatedAt: state.observedAt,
      }
      if (
        existing?.enabled === value.enabled &&
        existing.source === value.source &&
        existing.updatedAt === value.updatedAt
      )
        return existing._id
      if (existing) return await ctx.db.patch(existing._id, value)
      return await ctx.db.insert("userEntitlements", { userId: user._id, feature, ...value })
    }),
  )
}

export async function applyStoredRevenueCatState(ctx: MutationCtx, user: Doc<"users">) {
  const state = await ctx.db
    .query("revenueCatCustomerStates")
    .withIndex("by_app_user_id", (q) => q.eq("appUserId", user.clerkUserId))
    .unique()
  if (state) await applyRevenueCatState(ctx, user, state)
}
