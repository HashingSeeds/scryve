import { COMMANDER_COLORS } from "@/components/CardFocusDialog"

import {
  readFilterTerm,
  scryfallFilterTerms,
  termSuggestions,
  type CardFilterState,
} from "./cardFilters"
import type { ColorMatch } from "./colorMatch"
import type { CardFilterDefinition } from "../../../convex/lib/systems"

/**
 * why: the search bar holds the whole query. These are the parts the filter sheet shows; `rest`
 * is the card name and any syntax the sheet has no control for, which goes to Scryfall as typed.
 */
export type CardQuery = {
  rest: string
  filters: CardFilterState
  colors: readonly string[]
  colorMatch?: ColorMatch
}

type FilterRead = NonNullable<ReturnType<typeof readFilterTerm>>

const COLOR_MATCH_OPERATOR = {
  exact: "=",
  additional: ">=",
  within: "<=",
} as const satisfies Record<ColorMatch, string>
const IDENTITY_KEYS = ["id", "identity", "ci"]
const IDENTITY_MATCH: Partial<Record<string, ColorMatch>> = {
  "=": "exact",
  ">=": "additional",
  "<=": "within",
  ":": "within",
}
const TERM = /^([a-z]+)(>=|<=|!=|:|=|>|<)(.+)$/i

export function identityTerm(colors: readonly string[], colorMatch: ColorMatch) {
  if (colors.includes("C")) return "id:c"
  return colors.length
    ? `id${COLOR_MATCH_OPERATOR[colorMatch]}${colors.join("").toLowerCase()}`
    : ""
}

/** why: splits on spaces outside quotes and parentheses, so `kw:"first strike"` and `(a or b)` stay whole. */
function tokens(text: string) {
  const found: string[] = []
  let current = ""
  let depth = 0
  let quoted = false
  for (const char of text) {
    if (char === '"') quoted = !quoted
    else if (!quoted && char === "(") depth++
    else if (!quoted && char === ")") depth = Math.max(0, depth - 1)
    if (!quoted && depth === 0 && /\s/.test(char)) {
      if (current) found.push(current)
      current = ""
    } else current += char
  }
  if (current) found.push(current)
  return found
}

function term(token: string) {
  const [, key = "", operator = "", typed = ""] = TERM.exec(token) ?? []
  const value = /^".+"$/.test(typed) ? typed.slice(1, -1) : typed
  // why: a `/regex/` value means a pattern, not a subtype or keyword named that.
  return key && !value.includes('"') && !value.startsWith("/")
    ? { key, operator, value }
    : undefined
}

function readIdentity({ key, operator, value }: NonNullable<ReturnType<typeof term>>) {
  if (!IDENTITY_KEYS.includes(key.toLowerCase())) return undefined
  const letters = value.toUpperCase()
  if (letters === "C" || letters === "COLORLESS")
    return operator === ":" || operator === "=" ? { colors: ["C"] } : undefined
  const colorMatch = IDENTITY_MATCH[operator]
  if (!colorMatch || !/^[WUBRG]+$/.test(letters)) return undefined
  return { colors: COMMANDER_COLORS.filter((color) => letters.includes(color)), colorMatch }
}

/** why: the sheet writes a filter matching any of several picks as `(t:a or t:b)`, so that reads back too. */
function readAnyGroup(
  token: string,
  filters: readonly CardFilterDefinition[],
  cardOptionsFor: (filterId: string) => readonly string[],
): FilterRead | undefined {
  if (!/^\(.*\)$/.test(token)) return undefined
  const parts = tokens(token.slice(1, -1))
  if (parts.length < 3 || parts.some((part, index) => index % 2 === 1 && !/^or$/i.test(part)))
    return undefined
  const reads = parts.flatMap((part, index) => {
    const typed = index % 2 === 0 ? term(part) : undefined
    return typed ? [readFilterTerm(filters, typed, cardOptionsFor)] : []
  })
  const filter = reads[0]?.filter
  const fits =
    filter &&
    filter.options !== "range" &&
    filter.match === "any" &&
    reads.length * 2 - 1 === parts.length &&
    reads.every((read) => read?.filter === filter)
  return fits ? { filter, options: reads.flatMap((read) => read?.options ?? []) } : undefined
}

/** why: a term the filter can't add without changing what the search means stays as typed syntax. */
function fitsPicked({ filter, options }: FilterRead, current: readonly string[]) {
  if (filter.options === "range")
    return options.every(
      (option) => !current.some((bound) => bound.slice(0, 2) === option.slice(0, 2)),
    )
  return filter.match === "all" || current.length === 0
}

function joinsWithOr(text: string) {
  return tokens(text).some((part) => /^or$/i.test(part))
}

export function parseCardQuery(
  text: string,
  filters: readonly CardFilterDefinition[],
  cardOptionsFor: (filterId: string) => readonly string[],
): CardQuery {
  // why: a top-level `or` joins everything around it, so no term can move into the sheet without changing the search.
  if (joinsWithOr(text)) return { rest: text.trim(), filters: {}, colors: [] }
  const parts = tokens(text)
  const picked: Record<string, readonly string[]> = {}
  const rest: string[] = []
  let identity: ReturnType<typeof readIdentity>
  for (const part of parts) {
    const typed = term(part)
    const colors = typed && !identity ? readIdentity(typed) : undefined
    if (colors) {
      identity = colors
      continue
    }
    const read = typed
      ? readFilterTerm(filters, typed, cardOptionsFor)
      : readAnyGroup(part, filters, cardOptionsFor)
    const current = read ? (picked[read.filter.id] ?? []) : []
    if (read && fitsPicked(read, current)) {
      picked[read.filter.id] = [...new Set([...current, ...read.options])]
      continue
    }
    rest.push(part)
  }
  return {
    rest: rest.join(" "),
    filters: picked,
    colors: identity?.colors ?? [],
    colorMatch: identity?.colorMatch,
  }
}

/** why: filter terms lead and the name follows, so the player types a name straight after them. */
export function formatCardQuery(
  { rest, filters, colors }: CardQuery,
  colorMatch: ColorMatch,
  definitions: readonly CardFilterDefinition[],
) {
  const terms = [...scryfallFilterTerms(definitions, filters), identityTerm(colors, colorMatch)]
    .filter(Boolean)
    .join(" ")
  // why: a top-level `or` would split the filters from the rest of the query, so the typed part keeps its own group.
  const grouped = terms && joinsWithOr(rest) ? `(${rest})` : rest
  return terms ? `${terms} ${grouped}` : rest
}

/**
 * why: while the bar's last word is a term the sheet reads, such as `t:liz`, the bar offers the
 * options it could finish as. Each suggestion carries the bar's text with that word completed.
 */
export function querySuggestions(
  text: string,
  filters: readonly CardFilterDefinition[],
  cardOptionsFor: (filterId: string) => readonly string[],
  limit = 6,
) {
  const last = /\s$/.test(text) ? undefined : tokens(text).at(-1)
  const [, key = "", typed = ""] = (last && /^([a-z]+):"?([^"]*)$/i.exec(last)) || []
  if (!last || !key) return []
  return termSuggestions(filters, key.toLowerCase(), typed, cardOptionsFor, limit).map(
    (suggestion) => ({
      ...suggestion,
      text: `${text.slice(0, text.length - last.length)}${suggestion.term} `,
    }),
  )
}
