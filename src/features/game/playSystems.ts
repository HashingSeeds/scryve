import { deckFormatLabel, deckFormats } from "../../../convex/lib/deckGames"
import {
  formatDefinition,
  isSystemId,
  SYSTEM_IDS,
  SYSTEMS,
  type CounterDefinition,
  type SystemId,
} from "../../../convex/lib/systems"

export const PLAY_SYSTEM_IDS = SYSTEM_IDS
export type PlaySystemId = SystemId
export const NO_PLAY_SYSTEM = "none"

export type CounterRules = CounterDefinition

export type PlaySystemRules = {
  id: PlaySystemId
  label: string
  shortLabel: string
  defaultFormat: string
  counter: CounterRules
}

function playRulesFor(id: PlaySystemId): PlaySystemRules {
  const { label, shortLabel, defaultFormat, counter } = SYSTEMS[id]
  return { id, label, shortLabel, defaultFormat: defaultFormat.play, counter }
}

// why: rules feed render paths, so each system keeps one stable object.
const PLAY_SYSTEMS: Record<PlaySystemId, PlaySystemRules> = {
  mtg: playRulesFor("mtg"),
  ygo: playRulesFor("ygo"),
  pokemon: playRulesFor("pokemon"),
}

const GENERIC_PLAY_RULES = {
  id: NO_PLAY_SYSTEM,
  label: "No system",
  shortLabel: "No system",
  defaultFormat: "",
  counter: {
    label: "life",
    heading: "Life",
    singular: "life",
    plural: "life",
    defaultValue: 20,
    presets: [],
    tapStep: 1,
    quickAdjustments: [10, 5],
    scrubStep: 1,
    scrubSteps: 20,
    longPressStep: undefined,
    direction: "open",
    maxStartingValue: 999,
  },
} as const

export const PLAY_SYSTEM_LIST = PLAY_SYSTEM_IDS.map((id) => PLAY_SYSTEMS[id])

export const isPlaySystemId = isSystemId

export function playSystemId(value: unknown): PlaySystemId {
  return isPlaySystemId(value) ? value : "mtg"
}

export function playSystemRules(value?: unknown) {
  return isPlaySystemId(value) ? PLAY_SYSTEMS[value] : GENERIC_PLAY_RULES
}

export function playSystemFormats(value?: unknown) {
  return deckFormats(playSystemId(value))
}

export function playSystemFormat(value?: unknown, format?: string): string {
  const system = playSystemId(value)
  if (format && deckFormats(system).some((candidate) => candidate.id === format)) return format
  return SYSTEMS[system].defaultFormat.play
}

function playFormatDefinition(system: unknown, format?: string) {
  return formatDefinition(system, playSystemFormat(system, format))
}

export function defaultStartingLife(system?: unknown, format?: string, playerCount = 2): number {
  const counter = playSystemRules(system).counter
  if (!isPlaySystemId(system)) return counter.defaultValue
  const definition = playFormatDefinition(system, format)
  return (
    (playerCount > 2 ? definition?.multiplayerStartingValue : undefined) ??
    definition?.startingValue ??
    counter.defaultValue
  )
}

export function supportsCommanderDamage(value: unknown, format?: string): boolean {
  return playFormatDefinition(playSystemId(value), format)?.hasCommanderDamage ?? false
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
  const delta = current - startingValue
  if (playSystemRules(value).counter.direction === "down") {
    const taken = startingValue - current
    return taken === 0 ? "none taken" : `${taken} taken`
  }
  return delta === 0 ? "even" : `${delta > 0 ? "+" : ""}${delta} from start`
}
