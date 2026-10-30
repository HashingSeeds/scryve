import {
  SYSTEM_IDS,
  SYSTEMS,
  type Capability,
  type CounterDefinition,
  type DeckSection,
  type FormatDefinition,
  type SystemDefinition,
  type SystemId,
  type TableDefinition,
} from "./definitions"

export * from "./definitions"

export function isSystemId(value: unknown): value is SystemId {
  return typeof value === "string" && SYSTEM_IDS.some((id) => id === value)
}

export function systemDefinition(system: unknown): SystemDefinition | undefined {
  return isSystemId(system) ? SYSTEMS[system] : undefined
}

export const isReleased = (...states: readonly Pick<Capability, "technical" | "release">[]) =>
  states.every(({ technical, release }) => technical === "available" && release === "enabled")

export function tracksResults(system: unknown): boolean {
  return systemDefinition(system)?.resultTracking ?? true
}

export function formatDefinition(system: unknown, format: unknown): FormatDefinition | undefined {
  return systemDefinition(system)?.formats.find((candidate) => candidate.id === format)
}

export const NO_TABLE: TableDefinition = { counters: [], designations: [] }

const tableRulesCache = new Map<string, TableDefinition>()

export function tableRules(system: unknown, format: string | undefined): TableDefinition {
  const definition = systemDefinition(system)
  if (!definition) return NO_TABLE
  const key = `${String(system)}:${format ?? ""}`
  const cached = tableRulesCache.get(key)
  if (cached) return cached
  const commandZone = hasCommandZone(system, format)
  const { counters, designations, pokemon } = definition.table
  const rules: TableDefinition = {
    counters: counters.filter((counter) => commandZone || !counter.commandZoneOnly),
    designations,
    ...(pokemon ? { pokemon } : {}),
  }
  tableRulesCache.set(key, rules)
  return rules
}

export function identitySection(system: unknown, format: unknown): DeckSection | undefined {
  return formatDefinition(system, format)?.sections.find((section) => section.identity)
}

export function picksCommander(system: unknown, format: unknown): boolean {
  return identitySection(system, format)?.id === "commander"
}

export function identityStartingValue(
  system: unknown,
  format: unknown,
  facets: readonly { key: string; value: string }[] | undefined,
): number | undefined {
  const facet = identitySection(system, format)?.startingValueFacet
  const value = Number(facets?.find(({ key }) => key === facet)?.value)
  const max = systemDefinition(system)?.counter.maxStartingValue ?? 0
  return Number.isInteger(value) && value >= 1 && value <= max ? value : undefined
}

export function hasCommandZone(system: unknown, format: string | undefined): boolean {
  return (
    formatDefinition(system, format)?.sections.some((section) => section.id === "commander") ??
    false
  )
}

/** why: a race counts toward its goal from the default value, so Prize cards lead by falling to 0 while lore leads by climbing to 20. */
export function lowerLeads({ goal, defaultValue }: CounterDefinition) {
  return goal.kind === "race" && goal.to < defaultValue
}

export function startingValueRange(system: unknown) {
  const counter = systemDefinition(system)?.counter
  if (!counter) return { min: 1, max: 999 }
  const countsUp = counter.goal.kind === "race" && !lowerLeads(counter)
  return { min: countsUp ? 0 : 1, max: counter.maxStartingValue }
}

/** why: one ordering for every goal, where a higher standing always leads. */
export function counterStanding(counter: CounterDefinition, value: number) {
  return lowerLeads(counter) ? -value : value
}

export function isCounterOut(
  counter: CounterDefinition,
  value: number,
  others: readonly number[],
): boolean {
  const { goal } = counter
  if (goal.kind === "survive") return value <= 0
  const finish = counterStanding(counter, goal.to)
  return others.some((other) => counterStanding(counter, other) >= finish)
}

export function flooredLifeDelta(system: unknown, life: number, delta: number): number {
  if (!systemDefinition(system)?.counter.flooredAtZero) return delta
  return Math.max(delta, Math.min(0, -life))
}
