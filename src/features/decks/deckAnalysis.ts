import type { FocusedCardDetails } from "@/components/CardFocusDialog"

import { readCardFaces } from "./cardFaces"
import { cardSection, type DeckCard } from "./deckCards"
import { formatDefinition } from "../../../convex/lib/systems"

export const MANA_COLORS = ["W", "U", "B", "R", "G"] as const
export type ManaColor = (typeof MANA_COLORS)[number]

type AnalysisDetails = Pick<
  FocusedCardDetails,
  "manaCost" | "typeLine" | "oracleText" | "faceDetails"
>

export const CURVE_BUCKETS = 8
const CURVE_TURNS = 5
const SUGGESTION_SIZES = { min: 40, max: 100 }
const BASIC_TYPES: Record<string, ManaColor> = {
  Plains: "W",
  Island: "U",
  Swamp: "B",
  Mountain: "R",
  Forest: "G",
}

function symbols(cost: string) {
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((match) => match[1].toUpperCase())
}

function costValue(cost: string) {
  return symbols(cost).reduce((total, symbol) => {
    if (/^\d+$/.test(symbol)) return total + Number(symbol)
    if (/^[XYZ]$/.test(symbol)) return total
    return (
      total + Math.max(...symbol.split("/").map((part) => (/^\d+$/.test(part) ? Number(part) : 1)))
    )
  }, 0)
}

function colorsIn(text: string) {
  return MANA_COLORS.filter((color) => new RegExp(`\\{[^}]*${color}[^}]*\\}`).test(text))
}

export function manaValue(details: AnalysisDetails) {
  const faces = readCardFaces(details.faceDetails)
  if (faces.length === 2) return costValue(faces[0].manaCost ?? "")
  const halves = (details.manaCost ?? "").split(" // ")
  const secondType = details.typeLine?.split(" // ")[1] ?? ""
  if (halves.length > 1 && /\b(Adventure|Omen)\b/.test(secondType)) return costValue(halves[0])
  return halves.reduce((total, half) => total + costValue(half), 0)
}

export function isLand(details: AnalysisDetails) {
  return /\bLand\b/.test(details.typeLine?.split(" // ")[0] ?? "")
}

const MANA_ABILITY =
  /\badd (\{[WUBRGC0-9X]|(one|two|three|four|five|x|that much) mana|an amount of)/i
const LAND_SEARCH =
  /search your library for [^.]*\b(lands?|plains|island|swamp|mountain|forest) cards?[^.]*onto the battlefield/i

function frontText(details: AnalysisDetails) {
  const faces = readCardFaces(details.faceDetails)
  return (faces.length === 2 ? faces[0].oracleText : details.oracleText) ?? ""
}

function isModalLand(details: AnalysisDetails) {
  return (
    !isLand(details) &&
    /\bLand\b/.test(details.typeLine?.split(" // ")[1] ?? "") &&
    // why: the cache has no layout; every transforming card with a land back says "transform" on its front, and no modal one does.
    !/transform/i.test(frontText(details))
  )
}

export function isRamp(details: AnalysisDetails) {
  const text = frontText(details)
  return (
    !isLand(details) &&
    (MANA_ABILITY.test(text) || LAND_SEARCH.test(text) || /play an additional land/i.test(text))
  )
}

const has = (text: string, ...parts: string[]) => parts.every((part) => text.includes(part))
const hasAny = (text: string, ...parts: string[]) => parts.some((part) => text.includes(part))

export function karstenCheapSpell(details: AnalysisDetails) {
  if (isLand(details)) return undefined
  const text = frontText(details).toLowerCase()
  const creature = /\bCreature\b/.test(details.typeLine?.split(" // ")[0] ?? "")
  if (/cycling \{(1|[wubrgc])\}/.test(text)) return "draw" as const
  if (manaValue(details) > 2) return undefined
  const draws =
    hasAny(text, "draw a card", "draw two cards", "draw three cards") ||
    hasAny(text, "draws cards", "draws two cards", "draws three cards")
  if (
    (draws &&
      !hasAny(text, "{4}", "blood token", "investigate") &&
      (!creature || has(text, "when", "enters"))) ||
    (!creature && has(text, "look", "library", "put", "your hand") && !hasAny(text, "pay ", "pays"))
  )
    return "draw" as const
  if (
    (text.includes("add ") &&
      !hasAny(text, "add its ability", "add a lore counter") &&
      !(creature && text.includes("dies"))) ||
    (has(text, "search", "your library") &&
      hasAny(text, "land", "basic") &&
      !text.includes("sacrifice")) ||
    has(text, "enchanted land is tapped", "adds an additional") ||
    has(text, "put a creature card with", "from your hand onto the battlefield")
  )
    return "ramp" as const
  return undefined
}

function typeColors(text: string) {
  return Object.entries(BASIC_TYPES).flatMap(([type, color]) =>
    new RegExp(`\\b${type}\\b`).test(text) ? [color] : [],
  )
}

export function landColors(
  details: AnalysisDetails,
  fetchable: { basic: ReadonlySet<ManaColor>; typed: ReadonlySet<ManaColor> },
) {
  const text = details.oracleText ?? ""
  if (/mana of any (color|type)|any one color/i.test(text)) return new Set(MANA_COLORS)
  const found = new Set(typeColors(details.typeLine ?? ""))
  for (const clause of text.matchAll(/\badd ([^.]*)/gi))
    for (const color of colorsIn(clause[1])) found.add(color)
  for (const clause of text.matchAll(/search your library for ([^.]*)/gi)) {
    for (const color of typeColors(clause[1])) if (fetchable.typed.has(color)) found.add(color)
    if (/\bbasic land\b/i.test(clause[1])) for (const color of fetchable.basic) found.add(color)
  }
  return found
}

function choose(n: number, k: number) {
  if (k < 0 || k > n) return 0
  const smaller = Math.min(k, n - k)
  let result = 1
  for (let i = 1; i <= smaller; i++) result = (result * (n - smaller + i)) / i
  return result
}

export function chanceOfLands(
  library: number,
  lands: number,
  seen: number,
  atLeast: number,
  atMost = seen,
) {
  const draws = Math.min(seen, library)
  let chance = 0
  for (let hit = atLeast; hit <= Math.min(lands, draws, atMost); hit++)
    chance += (choose(lands, hit) * choose(library - lands, draws - hit)) / choose(library, draws)
  return Math.min(1, chance)
}

function formatDeckSize(format: string) {
  if (!formatDefinition("mtg", format)) return undefined
  if (format === "commander") return 100
  if (format === "limited") return 40
  return 60
}

export type DeckAnalysis = {
  incomplete?: { count: number; size: number }
  needsCommander: boolean
  missing: number
  curve: number[]
  averageManaValue: number
  lands: number
  modalLands: number
  ramp: number
  cheapDraw: number
  colors: { color: ManaColor; pips: number; sources: number }[]
  suggestedLands?: { low: number; high: number }
  landDrops: { turn: number; chance: number }[]
  onThePlay: boolean
  mulligans?: { keep: number; once: number; twice: number }
  freeMulligan: boolean
}

export function analyzeDeck({
  cards,
  format,
  details,
}: {
  cards: readonly DeckCard[]
  format: string
  details: (card: DeckCard) => AnalysisDetails | undefined
}): DeckAnalysis {
  const commander = format === "commander"
  const played = cards.flatMap((card) => {
    const section = cardSection(card)
    if (section !== "main" && section !== "commander") return []
    return [{ card, section, info: details(card) }]
  })
  const known = played.flatMap(({ card, section, info }) =>
    info?.typeLine ? [{ quantity: card.quantity, section, info }] : [],
  )
  const missing = played.reduce(
    (total, entry) => total + (entry.info?.typeLine ? 0 : entry.card.quantity),
    0,
  )

  const curve = Array.from({ length: CURVE_BUCKETS }, () => 0)
  const pips = new Map<ManaColor, number>()
  let spells = 0
  let totalValue = 0
  let lands = 0
  let modalLands = 0
  let ramp = 0
  let cheapDraw = 0
  let cheapSpells = 0
  for (const { quantity, info } of known) {
    for (const symbol of symbols(info.manaCost ?? ""))
      for (const color of colorsIn(`{${symbol}}`))
        pips.set(color, (pips.get(color) ?? 0) + quantity)
    if (isLand(info)) {
      lands += quantity
      continue
    }
    if (isModalLand(info)) modalLands += quantity
    const value = manaValue(info)
    spells += quantity
    totalValue += value * quantity
    curve[Math.min(Math.floor(value), CURVE_BUCKETS - 1)] += quantity
    if (isRamp(info)) ramp += quantity
    const cheap = karstenCheapSpell(info)
    if (cheap) cheapSpells += quantity
    if (cheap === "draw") cheapDraw += quantity
  }

  const landFaces = known.flatMap(({ quantity, info }) =>
    isLand(info)
      ? [{ quantity, face: info }]
      : isModalLand(info)
        ? [{ quantity, face: readCardFaces(info.faceDetails)[1] ?? info }]
        : [],
  )
  const fetchable = {
    basic: new Set(
      landFaces.flatMap(({ face }) =>
        /\bBasic\b/.test(face.typeLine ?? "") ? typeColors(face.typeLine ?? "") : [],
      ),
    ),
    typed: new Set(landFaces.flatMap(({ face }) => typeColors(face.typeLine ?? ""))),
  }
  const sources = new Map<ManaColor, number>()
  for (const { quantity, face } of landFaces)
    for (const color of landColors(face, fetchable))
      sources.set(color, (sources.get(color) ?? 0) + quantity)

  const averageManaValue = spells > 0 ? totalValue / spells : 0
  const library = played.reduce(
    (total, entry) => total + (entry.section === "main" ? entry.card.quantity : 0),
    0,
  )
  const deckSize = played.reduce((total, entry) => total + entry.card.quantity, 0)
  const hasCommanderZone = played.some((entry) => entry.section === "commander")
  const estimate =
    spells === 0
      ? undefined
      : commander
        ? 31.42 + 3.13 * averageManaValue - 0.28 * cheapSpells
        : deckSize >= SUGGESTION_SIZES.min && deckSize <= SUGGESTION_SIZES.max
          ? // why: Karsten ports his 60-card fit to other sizes by scaling all but the cheap-spell term, with a commander counted like a companion.
            (deckSize / 60) * (19.59 + 1.9 * averageManaValue + (hasCommanderZone ? 0.27 : 0)) -
            0.28 * cheapSpells
          : undefined
  const landDropCards = lands + modalLands
  const keep = library >= 7 ? chanceOfLands(library, landDropCards, 7, 2, 5) : undefined
  const size = formatDeckSize(format)
  return {
    ...(size !== undefined && deckSize < size ? { incomplete: { count: deckSize, size } } : {}),
    needsCommander:
      !hasCommanderZone &&
      (formatDefinition("mtg", format)?.sections.some((section) => section.id === "commander") ??
        false),
    missing,
    curve,
    averageManaValue,
    lands,
    modalLands,
    ramp,
    cheapDraw,
    colors: MANA_COLORS.filter((color) => (pips.get(color) ?? 0) > 0).map((color) => ({
      color,
      pips: pips.get(color) ?? 0,
      sources: sources.get(color) ?? 0,
    })),
    ...(estimate !== undefined
      ? // why: Karsten's regression misses by about 2.75 lands, so one number reads as a verdict.
        { suggestedLands: { low: Math.round(estimate - 2), high: Math.round(estimate + 2) } }
      : {}),
    landDrops:
      library > 0
        ? Array.from({ length: CURVE_TURNS }, (_, index) => {
            const turn = index + 1
            // why: two-player games skip the first draw (CR 103.8a); multiplayer Commander does not (103.8c).
            const seen = 7 + turn - (commander ? 0 : 1)
            return { turn, chance: chanceOfLands(library, landDropCards, seen, turn) }
          })
        : [],
    onThePlay: !commander,
    ...(keep !== undefined ? { mulligans: { keep, once: 1 - keep, twice: (1 - keep) ** 2 } } : {}),
    // why: CR 103.5c makes the first mulligan free in multiplayer and in any Brawl game.
    freeMulligan: commander || format === "brawl",
  }
}
