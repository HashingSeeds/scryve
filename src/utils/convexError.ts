import { ConvexError } from "convex/values"

function convexErrorField(cause: unknown, field: "code" | "message") {
  if (!(cause instanceof ConvexError)) return undefined
  const data: unknown = cause.data
  if (typeof data !== "object" || data === null) return undefined
  const value = (data as Record<string, unknown>)[field]
  return typeof value === "string" ? value : undefined
}

export function convexErrorMessage(cause: unknown, fallback: string) {
  return convexErrorField(cause, "message") ?? fallback
}

export function convexErrorCode(cause: unknown) {
  return convexErrorField(cause, "code")
}
