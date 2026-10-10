import {
  SYSTEM_IDS,
  SYSTEMS,
  type FormatDefinition,
  type SystemDefinition,
  type SystemId,
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

export function hasCommandZone(system: unknown, format: string | undefined): boolean {
  return (
    formatDefinition(system, format)?.sections.some((section) => section.id === "commander") ??
    false
  )
}
