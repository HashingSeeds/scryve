import {
  deckFormatLabel,
  deckFormats,
  defaultDeckFormat,
  DECK_GAME_LIST,
} from "../../../convex/lib/deckGames"

export const PLAY_SYSTEM_IDS = ["mtg", "ygo", "pokemon"] as const
export type PlaySystemId = (typeof PLAY_SYSTEM_IDS)[number]

export type CounterRules = {
  label: string
  heading: string
  singular: string
  plural: string
  defaultValue: number
  presets: readonly number[]
  tapStep: number
  longPressStep?: number
  direction: "open" | "down"
  maxStartingValue: number
}

export type PlaySystemRules = {
  id: PlaySystemId
  label: string
  shortLabel: string
  defaultFormat: string
  counter: CounterRules
}

const SYSTEM_LABELS = new Map(
  DECK_GAME_LIST.map((game) => [game.id, { label: game.label, shortLabel: game.shortLabel }]),
)

const PLAY_SYSTEMS: Record<PlaySystemId, PlaySystemRules> = {
  mtg: {
    id: "mtg",
    label: SYSTEM_LABELS.get("mtg")?.label ?? "Magic: The Gathering",
    shortLabel: SYSTEM_LABELS.get("mtg")?.shortLabel ?? "Magic",
    defaultFormat: "standard",
    counter: {
      label: "life",
      heading: "Life",
      singular: "life",
      plural: "life",
      defaultValue: 20,
      presets: [20, 30, 40],
      tapStep: 1,
      direction: "open",
      maxStartingValue: 999,
    },
  },
  ygo: {
    id: "ygo",
    label: SYSTEM_LABELS.get("ygo")?.label ?? "Yu-Gi-Oh!",
    shortLabel: SYSTEM_LABELS.get("ygo")?.shortLabel ?? "Yu-Gi-Oh!",
    defaultFormat: "advanced",
    counter: {
      label: "Life Points",
      heading: "Life Points",
      singular: "Life Point",
      plural: "Life Points",
      defaultValue: 8000,
      presets: [8000],
      tapStep: 100,
      longPressStep: 1000,
      direction: "open",
      maxStartingValue: 999_999,
    },
  },
  pokemon: {
    id: "pokemon",
    label: SYSTEM_LABELS.get("pokemon")?.label ?? "Pokémon TCG",
    shortLabel: SYSTEM_LABELS.get("pokemon")?.shortLabel ?? "Pokémon",
    defaultFormat: "standard",
    counter: {
      label: "Prize cards",
      heading: "Prize cards",
      singular: "Prize card",
      plural: "Prize cards",
      defaultValue: 6,
      presets: [6],
      tapStep: 1,
      direction: "down",
      maxStartingValue: 99,
    },
  },
}

export const PLAY_SYSTEM_LIST = PLAY_SYSTEM_IDS.map((id) => PLAY_SYSTEMS[id])

export function isPlaySystemId(value: unknown): value is PlaySystemId {
  return typeof value === "string" && PLAY_SYSTEM_IDS.some((system) => system === value)
}

export function playSystemId(value: unknown): PlaySystemId {
  return isPlaySystemId(value) ? value : "mtg"
}

export function playSystemRules(value?: unknown): PlaySystemRules {
  return PLAY_SYSTEMS[playSystemId(value)]
}

export function playSystemFormats(value?: unknown) {
  return deckFormats(playSystemId(value))
}

export function playSystemFormat(value?: unknown, format?: string): string {
  const system = playSystemId(value)
  if (format && deckFormats(system).some((candidate) => candidate.id === format)) return format
  return PLAY_SYSTEMS[system].defaultFormat ?? defaultDeckFormat(system)
}

export const COMMANDER_DAMAGE_FORMAT = "commander"

export function supportsCommanderDamage(value: unknown, format?: string): boolean {
  return (
    playSystemId(value) === "mtg" && playSystemFormat(value, format) === COMMANDER_DAMAGE_FORMAT
  )
}

export function playFormatLabel(value: unknown, format?: string): string {
  const system = playSystemId(value)
  return deckFormatLabel(system, playSystemFormat(system, format))
}

export function counterValueLabel(value: unknown, count: number): string {
  const { singular, plural } = playSystemRules(value).counter
  return `${count} ${Math.abs(count) === 1 ? singular : plural}`
}

export function counterChangeLabel(value: unknown, count: number): string {
  const { singular, plural } = playSystemRules(value).counter
  const one = Math.abs(count) === 1
  return `${count} ${(one ? singular : plural).toLowerCase()} ${one ? "change" : "changes"}`
}

export function counterDeltaFromStartLabel(
  value: unknown,
  current: number,
  startingValue: number,
): string {
  const system = playSystemId(value)
  const delta = current - startingValue
  if (system === "pokemon") {
    const taken = startingValue - current
    return taken === 0 ? "none taken" : `${taken} taken`
  }
  return delta === 0 ? "even" : `${delta > 0 ? "+" : ""}${delta} from start`
}
