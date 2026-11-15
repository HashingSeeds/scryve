import { ConvexError } from "convex/values"

import { MAX_CARD_COPIES } from "@/features/decks/deckCards"
import errors from "@/i18n/en/errors"
import { translate } from "@/i18n/translate"

import { MAX_LIFE_DELTA } from "../../convex/lib/gameRules"

function convexErrorField(cause: unknown, field: "code" | "message") {
  if (!(cause instanceof ConvexError)) return undefined
  const data: unknown = cause.data
  if (typeof data !== "object" || data === null) return undefined
  const value = (data as Record<string, unknown>)[field]
  return typeof value === "string" ? value : undefined
}

type ErrorKey = keyof typeof errors

const ERROR_VALUES: Partial<Record<ErrorKey, Record<string, number>>> = {
  invalidCardQuantity: { min: 1, max: MAX_CARD_COPIES },
  invalidLifeDelta: { min: -MAX_LIFE_DELTA, max: MAX_LIFE_DELTA },
}

function isErrorKey(key: string): key is ErrorKey {
  return Object.hasOwn(errors, key)
}

function serverMessage(key: ErrorKey) {
  const values = ERROR_VALUES[key]
  return errors[key].replace(/{{(\w+)}}/g, (token, name: string) =>
    values && name in values ? String(values[name]) : token,
  )
}

export function convexErrorMessage(cause: unknown, fallback: string) {
  const message = convexErrorField(cause, "message")
  const key = convexErrorField(cause, "code")?.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  )
  if (key && isErrorKey(key) && message === serverMessage(key))
    return translate(`errors:${key}`, ERROR_VALUES[key])
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

/** why: deployed backends say ArgumentValidationError, convex-test says "Validator error"; production redacts to "Server Error". */
export function isArgumentValidationError(cause: unknown) {
  return (
    cause instanceof Error &&
    !(cause instanceof ConvexError) &&
    /ArgumentValidationError|Validator error:/.test(cause.message)
  )
}

const gameGoneCodes = new Set(["forbidden", "game_not_found", "game_membership_required"])

/** why: production redacts the message and keeps only ConvexError data; the message check covers backends from before coded game errors. */
export function isGameUnavailableError(cause: unknown) {
  const code = convexErrorCode(cause)
  if (code !== undefined) return gameGoneCodes.has(code)
  return cause instanceof Error && cause.message.includes("Game unavailable")
}
