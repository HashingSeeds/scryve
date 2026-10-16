import { ConvexError } from "convex/values"

import errors from "@/i18n/en/errors"
import { translate } from "@/i18n/translate"

function convexErrorField(cause: unknown, field: "code" | "message") {
  if (!(cause instanceof ConvexError)) return undefined
  const data: unknown = cause.data
  if (typeof data !== "object" || data === null) return undefined
  const value = (data as Record<string, unknown>)[field]
  return typeof value === "string" ? value : undefined
}

type ErrorKey = keyof typeof errors

function isErrorKey(key: string): key is ErrorKey {
  return Object.hasOwn(errors, key)
}

export function convexErrorMessage(cause: unknown, fallback: string) {
  const message = convexErrorField(cause, "message")
  const key = convexErrorField(cause, "code")?.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  )
  if (key && isErrorKey(key) && message === errors[key]) return translate(`errors:${key}`)
  return message ?? fallback
}

export function convexErrorCode(cause: unknown) {
  return convexErrorField(cause, "code")
}

export function convexRetryAfterMs(cause: unknown) {
  if (!(cause instanceof ConvexError)) return undefined
  const data: unknown = cause.data
  if (typeof data !== "object" || data === null) return undefined
  const value = (data as Record<string, unknown>).retryAfterMs
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined
}

export function convexErrorRetryAfterMs(cause: unknown, fallbackMs = 0) {
  if (!(cause instanceof ConvexError)) return fallbackMs
  const data: unknown = cause.data
  if (typeof data !== "object" || data === null) return fallbackMs
  const value = (data as Record<string, unknown>).retryAfterMs
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallbackMs
}

/** why: deployed backends say ArgumentValidationError and convex-test says "Validator error".
 *  Production deployments redact it to "Server Error", so this only catches it where the message survives. */
export function isArgumentValidationError(cause: unknown) {
  return (
    cause instanceof Error &&
    !(cause instanceof ConvexError) &&
    /ArgumentValidationError|Validator error:/.test(cause.message)
  )
}

export function isGameUnavailableError(cause: unknown) {
  return cause instanceof Error && cause.message.includes("Game unavailable")
}
