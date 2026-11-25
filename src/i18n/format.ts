import * as Localization from "expo-localization"
import i18n, { type FormatFunction } from "i18next"

/**
 * why: every number, date, and list a person reads goes through here, so digits, separators,
 * calendars, and bidi order follow the app's language in one place. Hermes lacks
 * Intl.ListFormat, Intl.RelativeTimeFormat, and formatToParts, and on iOS it ignores
 * `signDisplay`, `calendar`, and `numberingSystem` options, so this file avoids them.
 */

export const PSEUDO_LOCALE = "en-XA"

const MINUS = "\u2212"
const FIRST_STRONG_ISOLATE = "\u2068"
const LEFT_TO_RIGHT_ISOLATE = "\u2066"
const POP_DIRECTIONAL_ISOLATE = "\u2069"
const GROUPING_FROM = 10_000
const DATE_AND_TIME = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const

const numberFormats = new Map<string, Intl.NumberFormat>()
const dateFormats = new Map<string, Intl.DateTimeFormat>()

const locale = () => i18n.language || "en-US"

// why: a phone set to the en-XA system pseudolanguage would otherwise get brackets and Arabic digits in a release build.
export const isPseudoLocale = () => __DEV__ && locale() === PSEUDO_LOCALE

// why: in the pseudo-locale a formatted number shows in other digits on every platform (Hermes on iOS ignores -u-nu), so an ASCII digit on screen marks a number that skipped this file.
function pseudoDigits(text: string) {
  if (!isPseudoLocale()) return text
  return text.replace(/[0-9]/g, (digit) => String.fromCharCode(0x0660 + Number(digit)))
}

function pseudoDate(text: string) {
  return isPseudoLocale() ? `\u27e6${pseudoDigits(text)}\u27e7` : text
}
const isRightToLeft = () => i18n.dir(locale()) === "rtl"

function numberFormat(options: Intl.NumberFormatOptions) {
  const key = `${locale()}\u0000${JSON.stringify(options)}`
  let format = numberFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(locale(), options)
    numberFormats.set(key, format)
  }
  return format
}

// why: Hermes on iOS ignores the `calendar` option but honors a -u-ca- tag, and iOS and Android default Arabic to different calendars.
function dateFormat(options: Intl.DateTimeFormatOptions) {
  const { calendar, timeZone } = Localization.getCalendars()[0] ?? {}
  const tag = calendar && !locale().includes("-u-") ? `${locale()}-u-ca-${calendar}` : locale()
  // why: a formatter keeps the time zone it was built in, so a cached one would miss the phone changing zones.
  const zoned = { ...(timeZone ? { timeZone } : {}), ...options }
  const key = `${tag}\u0000${JSON.stringify(zoned)}`
  let format = dateFormats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(tag, zoned)
    dateFormats.set(key, format)
  }
  return format
}

// why: without an isolate, a number beside a Latin word joins its run in right-to-left text, so "Magic · 40 life" reads "life Magic · 40".
export function isolate(text: string) {
  return isRightToLeft() ? `${FIRST_STRONG_ISOLATE}${text}${POP_DIRECTIONAL_ISOLATE}` : text
}

// why: after an Arabic word, digits and hyphens reorder, so "3-0-1" would read "1-0-3".
function leftToRight(text: string) {
  return isRightToLeft() ? `${LEFT_TO_RIGHT_ISOLATE}${text}${POP_DIRECTIONAL_ISOLATE}` : text
}

const withMinusSign = (text: string) => text.replace("-", MINUS)

const withoutNegativeZero = (value: number) => (Object.is(value, -0) ? 0 : value)

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}) {
  const useGrouping = options.useGrouping ?? Math.abs(value) >= GROUPING_FROM
  return pseudoDigits(
    withMinusSign(numberFormat({ ...options, useGrouping }).format(withoutNegativeZero(value))),
  )
}

export function formatSigned(value: number) {
  if (value > 0) return formatNumber(-value).replace(MINUS, "+")
  return formatNumber(value)
}

export function formatPercent(ratio: number) {
  return pseudoDigits(
    withMinusSign(numberFormat({ style: "percent", maximumFractionDigits: 0 }).format(ratio)),
  )
}

export function formatCurrency(cents: number, currency: "USD" | "EUR" = "USD") {
  return pseudoDigits(
    withMinusSign(
      numberFormat({ style: "currency", currency, useGrouping: true }).format(
        withoutNegativeZero(cents / 100),
      ),
    ),
  )
}

export function formatRecord(...counts: readonly number[]) {
  return leftToRight(counts.map((count) => formatNumber(count)).join("-"))
}

export function formatRatio(part: number, whole: number) {
  return leftToRight(`${formatNumber(part)}/${formatNumber(whole)}`)
}

export function formatCopies(count: number) {
  return leftToRight(`${formatNumber(count)}\u00d7`)
}

export function formatOrMore(value: number) {
  return leftToRight(`${formatNumber(value)}+`)
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.abs(totalSeconds)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) - hours * 60
  const pad = (value: number) => formatNumber(value, { minimumIntegerDigits: 2 })
  const clock =
    hours > 0
      ? `${formatNumber(hours)}:${pad(minutes)}:${pad(seconds % 60)}`
      : `${formatNumber(minutes)}:${pad(seconds % 60)}`
  return leftToRight(totalSeconds < 0 ? `${MINUS}${clock}` : clock)
}

export function formatEquation(...parts: readonly (number | string)[]) {
  return leftToRight(
    parts.map((part) => (typeof part === "number" ? formatNumber(part) : part)).join(" "),
  )
}

export function formatDate(date: Date | number, options: Intl.DateTimeFormatOptions = {}) {
  return pseudoDate(dateFormat(options).format(date))
}

export function formatTime(date: Date | number) {
  return pseudoDate(dateFormat({ hour: "numeric", minute: "2-digit" }).format(date))
}

type Part = string | number | false | null | undefined

const separators = new Map<string, string>()
i18n.on("loaded", () => separators.clear())

// why: i18n.t is slow on Hermes and lists rebuild on every clock tick, and brackets around every separator would bury the pseudo-locale's real signal.
export function separator(key: "common:separator" | "common:listSeparator" | "common:listAnd") {
  const id = `${locale()}\u0000${key}`
  let text = separators.get(id)
  if (text === undefined) {
    text = i18n.t(key, { applyPostProcessor: false })
    separators.set(id, text)
  }
  return text
}

export function joinParts(parts: readonly Part[]) {
  return present(parts).join(separator("common:separator"))
}

export function formatList(parts: readonly Part[]) {
  return present(parts).join(separator("common:listSeparator"))
}

export function formatConjunction(parts: readonly Part[]) {
  const items = present(parts)
  if (items.length < 2) return items.join("")
  return `${items.slice(0, -1).join(separator("common:listSeparator"))}${separator("common:listAnd")}${items.at(-1)}`
}

export function formatSum(parts: readonly Part[]) {
  return present(parts).join(" + ")
}

function present(parts: readonly Part[]) {
  return parts.flatMap((part) => {
    if (part === false || part === null || part === undefined || part === "") return []
    return [isolate(typeof part === "number" ? formatNumber(part) : part)]
  })
}

function formatPlain(value: number, format?: string) {
  if (format === "signed") return value > 0 ? `+${value}` : String(value)
  if (format === "percent") return `${Math.round(value * 100)}%`
  if (format === "orMore") return `${value}+`
  return String(value)
}

function toAsciiDigits(text: string) {
  return text
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0966-\u096f]/g, (digit) => String(digit.charCodeAt(0) - 0x0966))
}

function formatPlainDate(value: Date) {
  return toAsciiDigits(dateFormat(DATE_AND_TIME).format(value)).replace(
    /[\u200e\u200f\u2066-\u2069]/g,
    "",
  )
}

export const formatInterpolation: FormatFunction = (value, format, _language, options) => {
  // why: saved text outlives the reader's language, so translateForStorage gets plain ASCII and no isolates.
  if (options?.forStorage) {
    if (typeof value === "number") return formatPlain(value, format)
    if (value instanceof Date) return formatPlainDate(value)
    return value
  }
  if (typeof value === "number") {
    if (format === "signed") return isolate(formatSigned(value))
    if (format === "percent") return isolate(formatPercent(value))
    if (format === "orMore") return isolate(formatOrMore(value))
    return isolate(formatNumber(value))
  }
  if (typeof value === "string") return isolate(value)
  if (value instanceof Date) return isolate(formatDate(value, DATE_AND_TIME))
  return value
}
