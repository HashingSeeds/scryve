import systems from "@/i18n/en/systems"
import { translate } from "@/i18n/translate"

import { deckFormatLabel, deckFormats, deckSections } from "../../../convex/lib/deckGames"
import {
  formatDefinition,
  isSystemId,
  lowerLeads,
  NO_TABLE,
  SYSTEM_IDS,
  SYSTEMS,
  tableRules,
  type CounterDefinition,
  type DeckSection,
  type SystemId,
  type TableDefinition,
} from "../../../convex/lib/systems"

export const PLAY_SYSTEM_IDS = SYSTEM_IDS
export type PlaySystemId = SystemId
export const NO_PLAY_SYSTEM = "none"

export type CounterRules = CounterDefinition
export type TableRules = TableDefinition

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
  lorcana: playRulesFor("lorcana"),
  fab: playRulesFor("fab"),
}

const GENERIC_COUNTER: CounterRules = {
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
  goal: { kind: "survive" },
  maxStartingValue: 999,
}

const GENERIC_PLAY_RULES = {
  id: NO_PLAY_SYSTEM,
  defaultFormat: "",
  counter: GENERIC_COUNTER,
} as const

export const isPlaySystemId = isSystemId

export function playSystemId(value: unknown): PlaySystemId {
  return isPlaySystemId(value) ? value : "mtg"
}

/** why: games saved before `system` existed are Magic, but a system this build doesn't know must show as No system rather than pass for Magic. */
export function storedPlaySystem(value: unknown): PlaySystemId | undefined {
  if (value === undefined) return "mtg"
  return isPlaySystemId(value) ? value : undefined
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

export function playTableRules(value: unknown, format?: string): TableRules {
  return isPlaySystemId(value) ? tableRules(value, playSystemFormat(value, format)) : NO_TABLE
}

export function playFormatLabel(value: unknown, format?: string): string {
  const system = playSystemId(value)
  return deckFormatLabel(system, playSystemFormat(system, format))
}

export function counterValueLabel(value: unknown, count: number): string {
  return translate(`systems:counterValue.${playSystemRules(value).id}`, { count })
}

export function counterChangeLabel(value: unknown, count: number): string {
  return translate(`systems:counterChange.${playSystemRules(value).id}`, { count })
}

export function counterDeltaFromStartLabel(
  value: unknown,
  current: number,
  startingValue: number,
): string {
  const delta = current - startingValue
  if (lowerLeads(playSystemRules(value).counter)) {
    const taken = startingValue - current
    return taken === 0
      ? translate("systems:noneTaken")
      : translate("systems:taken", { amount: taken })
  }
  return delta === 0
    ? translate("systems:even")
    : translate("systems:fromStart", { delta: `${delta > 0 ? "+" : ""}${delta}` })
}

function hasOwnKey<Table extends object>(
  table: Table,
  key: string,
): key is Extract<keyof Table, string> {
  return Object.hasOwn(table, key)
}

export function playSystemShortLabel(value: unknown): string {
  return isPlaySystemId(value) ? SYSTEMS[value].shortLabel : translate("systems:noSystem")
}

export function counterHeading(value: unknown): string {
  return translate(`systems:counterHeading.${playSystemRules(value).id}`)
}

export function counterLabel(value: unknown): string {
  return translate(`systems:counterLabel.${playSystemRules(value).id}`)
}

export function startingValueRangeMessage(value: unknown): string {
  const { id, counter } = playSystemRules(value)
  return translate(`systems:startingValueRange.${id}`, { max: counter.maxStartingValue })
}

export function tableItemLabel({ id, label }: { id: string; label: string }): string {
  return hasOwnKey(systems.tableItem, id) ? translate(`systems:tableItem.${id}`) : label
}

export function tableItemShortLabel(item: { id: string; label: string }): string {
  return hasOwnKey(systems.tableItemShort, item.id)
    ? translate(`systems:tableItemShort.${item.id}`)
    : tableItemLabel(item)
}

export function deckSectionLabel(game: string, { id, label }: DeckSection): string {
  if (id === "main") return isPlaySystemId(game) ? translate(`systems:section.main.${game}`) : label
  return hasOwnKey(systems.section, id) ? translate(`systems:section.${id}`) : label
}

const localizedSectionsCache = new Map<string, readonly DeckSection[]>()

export function localizedDeckSections(game: string, format: string): readonly DeckSection[] {
  const key = `${game}:${format}`
  const cached = localizedSectionsCache.get(key)
  if (cached) return cached
  const sections = deckSections(game, format).map((section) => ({
    ...section,
    label: deckSectionLabel(game, section),
  }))
  localizedSectionsCache.set(key, sections)
  return sections
}

function formatBlurb(system: PlaySystemId, id: string, blurb: string): string {
  return hasOwnKey(systems.formatBlurb, system) && hasOwnKey(systems.formatBlurb[system], id)
    ? translate(`systems:formatBlurb.${system}.${id}`)
    : blurb
}

export function playFormatOptions(value: unknown) {
  const system = playSystemId(value)
  return deckFormats(system).map(({ id, label, blurb }) => ({
    id,
    label,
    ...(blurb ? { detail: formatBlurb(system, id, blurb) } : {}),
  }))
}
