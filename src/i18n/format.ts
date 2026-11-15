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
// why: players write life totals such as 8000 without a separator in every language.
const GROUPING_FROM = 10_000

const numberFormats = new Map<string, Intl.NumberFormat>()
const dateFormats = new Map<string, Intl.DateTimeFormat>()

const locale = () => i18n.language || "en-US"

// why: in the pseudo-locale a formatted number shows in other digits on every platform (Hermes on iOS ignores -u-nu), so an ASCII digit on screen marks a number that skipped this file.
function pseudoDigits(text: string) {
  if (locale() !== PSEUDO_LOCALE) return text
  return text.replace(/[0-9]/g, (digit) => String.fromCharCode(0x0660 + Number(digit)))
}

// why: month and weekday names come from Intl, not a translation, so the pseudo-locale brackets them like translated text.
function pseudoDate(text: string) {
  return locale() === PSEUDO_LOCALE ? `\u27e6${pseudoDigits(text)}\u27e7` : text
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
function dateLocale() {
  const calendar = Localization.getCalendars()[0]?.calendar
  return calendar && !locale().includes("-u-") ? `${locale()}-u-ca-${calendar}` : locale()
}

function dateFormat(options: Intl.DateTimeFormatOptions) {
  const tag = dateLocale()
  const key = `${tag}\u0000${JSON.stringify(options)}`
  let format = dateFormats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(tag, options)
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

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}) {
  const useGrouping = options.useGrouping ?? Math.abs(value) >= GROUPING_FROM
  return pseudoDigits(withMinusSign(numberFormat({ ...options, useGrouping }).format(value)))
}

export function formatSigned(value: number) {
  if (value > 0) return formatNumber(-value).replace(MINUS, "+")
  return formatNumber(value)
}

export function formatPercent(ratio: number) {
  return pseudoDigits(numberFormat({ style: "percent", maximumFractionDigits: 0 }).format(ratio))
}

export function formatRecord(...counts: readonly number[]) {
  return leftToRight(counts.map((count) => formatNumber(count)).join("-"))
}

export function formatRatio(part: number, whole: number) {
  return leftToRight(`${formatNumber(part)}/${formatNumber(whole)}`)
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

export function joinParts(parts: readonly Part[]) {
  return present(parts).join(i18n.t("common:separator"))
}

export function formatList(parts: readonly Part[]) {
  return present(parts).join(i18n.t("common:listSeparator"))
}

export function formatConjunction(parts: readonly Part[]) {
  const items = present(parts)
  if (items.length < 2) return items.join("")
  return `${items.slice(0, -1).join(i18n.t("common:listSeparator"))}${i18n.t("common:listAnd")}${items.at(-1)}`
}

function present(parts: readonly Part[]) {
  return parts.flatMap((part) => {
    if (part === false || part === null || part === undefined || part === "") return []
    return [isolate(typeof part === "number" ? formatNumber(part) : part)]
  })
}

/** why: i18next runs every interpolated value through this, so no string can print a raw number. `{{delta, signed}}` and `{{share, percent}}` pick those formats. */
export const formatInterpolation: FormatFunction = (value, format) => {
  if (typeof value === "number") {
    if (format === "signed") return isolate(formatSigned(value))
    if (format === "percent") return isolate(formatPercent(value))
    return isolate(formatNumber(value))
  }
  if (typeof value === "string") return isolate(value)
  return value
}
