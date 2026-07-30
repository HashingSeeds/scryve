import { normalizeHttpsOrigin } from "@/utils/httpsOrigin"

export interface PublicCloudConfig {
  clerkPublishableKey: string
  convexUrl: string
  inviteOrigin: string
}

export type CloudConfigResult =
  { configured: true; value: PublicCloudConfig } | { configured: false; message: string }

function isHttpsUrl(value: string | undefined): value is string {
  if (!value) return false
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

function isClerkPublishableKey(value: string | undefined): value is string {
  if (!value || value.includes("replace_me")) return false
  const parts = value.split("_")
  if (parts.length !== 3 || parts[0] !== "pk" || !["test", "live"].includes(parts[1])) return false
  try {
    const encoded = parts[2].replace(/-/g, "+").replace(/_/g, "/")
    const decoded = globalThis.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="))
    const frontendApi = decoded.slice(0, -1)
    return decoded.endsWith("$") && !frontendApi.includes("$") && frontendApi.includes(".")
  } catch {
    return false
  }
}

export function validatePublicCloudConfig(
  env: Record<string, string | undefined>,
): CloudConfigResult {
  const CLERK_KEY = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()
  const CONVEX_URL = env.EXPO_PUBLIC_CONVEX_URL?.trim()
  const INVITE_ORIGIN = normalizeHttpsOrigin(env.EXPO_PUBLIC_INVITE_ORIGIN)
  const missing: string[] = []
  if (!isClerkPublishableKey(CLERK_KEY)) missing.push("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY")
  if (!isHttpsUrl(CONVEX_URL)) missing.push("EXPO_PUBLIC_CONVEX_URL")
  if (!INVITE_ORIGIN) missing.push("EXPO_PUBLIC_INVITE_ORIGIN")

  if (missing.length > 0) {
    return {
      configured: false,
      message: `Connected play needs valid public configuration: ${missing.join(", ")}. Local play remains available.`,
    }
  }

  return {
    configured: true,
    value: {
      clerkPublishableKey: CLERK_KEY!,
      convexUrl: CONVEX_URL!,
      inviteOrigin: INVITE_ORIGIN!,
    },
  }
}

export function readPublicCloudConfig(): CloudConfigResult {
  // Expo only inlines EXPO_PUBLIC values when each member access is statically analyzable.
  return validatePublicCloudConfig({
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    EXPO_PUBLIC_CONVEX_URL: process.env.EXPO_PUBLIC_CONVEX_URL,
    EXPO_PUBLIC_INVITE_ORIGIN: process.env.EXPO_PUBLIC_INVITE_ORIGIN,
  })
}
