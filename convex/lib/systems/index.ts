import {
  SYSTEM_IDS,
  SYSTEMS,
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

export function formatDefinition(
  system: unknown,
  format: string | undefined,
): FormatDefinition | undefined {
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

export function hasCommandZone(system: unknown, format: string | undefined): boolean {
  return (
    formatDefinition(system, format)?.sections.some((section) => section.id === "commander") ??
    false
  )
}

const LIFE_FLOORED_AT_ZERO: ReadonlySet<unknown> = new Set<SystemId>(["ygo"])

export function flooredLifeDelta(system: unknown, life: number, delta: number): number {
  if (!LIFE_FLOORED_AT_ZERO.has(system)) return delta
  return Math.max(delta, Math.min(0, -life))
}
