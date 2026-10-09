import { isRecord, type Report } from "./design"
import type { LaneName } from "./lanes"

export type CorruptionKind =
  "truncated" | "empty" | "renamed" | "retyped" | "missing-nested" | "extra-field" | "huge-value"

export const CORRUPTIONS: readonly CorruptionKind[] = [
  "truncated",
  "empty",
  "renamed",
  "retyped",
  "missing-nested",
  "extra-field",
  "huge-value",
]

export const TARGETS: Record<
  LaneName,
  { rename: [string, string]; retype: string; missing: string; huge: string }
> = {
  connected: {
    rename: ["event.deviceId", "event.device"],
    retype: "event.clientCreatedAt",
    missing: "event.gameId",
    huge: "event.playerId",
  },
  deckMetadata: {
    rename: ["name", "title"],
    retype: "expectedRevision",
    missing: "ownerId",
    huge: "note",
  },
  deckVersions: {
    rename: ["cards", "cardList"],
    retype: "attempts",
    missing: "cards.0.quantity",
    huge: "cards.0.name",
  },
}

type Path = Array<string | number>

const split = (path: string): Path =>
  path.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part))

function container(root: unknown, path: Path): Record<string, unknown> | unknown[] | undefined {
  let current = root
  for (const part of path.slice(0, -1)) {
    if (Array.isArray(current) && typeof part === "number") current = current[part]
    else if (isRecord(current) && typeof part === "string") current = current[part]
    else return undefined
  }
  return isRecord(current) || Array.isArray(current) ? current : undefined
}

export function getPath(root: unknown, path: string): unknown {
  const parts = split(path)
  const parent = container(root, parts)
  const last = parts[parts.length - 1]
  if (Array.isArray(parent)) return typeof last === "number" ? parent[last] : undefined
  return parent && typeof last === "string" ? parent[last] : undefined
}

export function setPath(root: unknown, path: string, value: unknown) {
  const parts = split(path)
  const parent = container(root, parts)
  const last = parts[parts.length - 1]
  if (Array.isArray(parent) && typeof last === "number") parent[last] = value
  else if (isRecord(parent) && typeof last === "string") parent[last] = value
}

export function deletePath(root: unknown, path: string) {
  const parts = split(path)
  const parent = container(root, parts)
  const last = parts[parts.length - 1]
  if (isRecord(parent) && typeof last === "string") delete parent[last]
}

export function renamePath(root: unknown, from: string, to: string) {
  const value = getPath(root, from)
  deletePath(root, from)
  setPath(root, to, value)
}

/** why: applies one corruption to a stored record. `prefix` is "" for pending records and "action." for failed ones. */
export function corrupt(
  value: string,
  kind: CorruptionKind,
  lane: LaneName,
  prefix: string,
): string {
  if (kind === "truncated") return value.slice(0, Math.floor(value.length / 2))
  if (kind === "empty") return ""
  const root: unknown = JSON.parse(value)
  const target = TARGETS[lane]
  if (kind === "renamed") renamePath(root, prefix + target.rename[0], prefix + target.rename[1])
  if (kind === "retyped") {
    const path = prefix + target.retype
    setPath(root, path, String(getPath(root, path)))
  }
  if (kind === "missing-nested") deletePath(root, prefix + target.missing)
  if (kind === "extra-field") setPath(root, `${prefix}zzExtra`, "SENTINEL-extra-field")
  if (kind === "huge-value")
    setPath(root, prefix + target.huge, `SENTINEL-huge-${"x".repeat(256 * 1024)}`)
  return JSON.stringify(root)
}

const typeLabel = (value: unknown) =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value

export function flatShape(value: unknown, depth = 4, prefix = ""): Map<string, string> {
  const shape = new Map<string, string>()
  const entries = Array.isArray(value)
    ? value.slice(0, 3).map((item, index): [string, unknown] => [String(index), item])
    : isRecord(value)
      ? Object.entries(value)
      : []
  for (const [key, child] of entries) {
    shape.set(prefix + key, typeLabel(child))
    if (depth > 1)
      for (const entry of flatShape(child, depth - 1, `${prefix}${key}.`)) shape.set(...entry)
  }
  return shape
}

/** why: normalizes a reported shape (nested object of type labels, or flat dotted paths) into the same path -> type map. */
export function reportedShape(shape: unknown, prefix = ""): Map<string, string> {
  const flat = new Map<string, string>()
  if (!isRecord(shape)) return flat
  for (const [key, child] of Object.entries(shape)) {
    if (typeof child === "string") flat.set(prefix + key, child)
    else if (isRecord(child)) {
      flat.set(prefix + key, "object")
      for (const entry of reportedShape(child, `${prefix}${key}.`)) flat.set(...entry)
    }
  }
  return flat
}

export function reportRecords(report: Report): Record<string, unknown>[] {
  const records = report.records
  return Array.isArray(records) ? records.filter(isRecord) : []
}

const deepFind = (value: unknown, key: string): unknown => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFind(item, key)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (!isRecord(value)) return undefined
  if (key in value) return value[key]
  for (const child of Object.values(value)) {
    const found = deepFind(child, key)
    if (found !== undefined) return found
  }
  return undefined
}

export const reportField = (report: Report, key: string) => deepFind(report, key)

/** why: every string a report carries, keys included, so planted values can't hide anywhere. */
export function reportStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value)
  else if (Array.isArray(value)) for (const item of value) reportStrings(item, out)
  else if (isRecord(value))
    for (const [key, child] of Object.entries(value)) {
      out.push(key)
      reportStrings(child, out)
    }
  return out
}

export function privateValues(value: unknown, allow: ReadonlySet<string>, out = new Set<string>()) {
  if (typeof value === "string" && value.length >= 8 && !allow.has(value)) out.add(value)
  else if (Array.isArray(value)) for (const item of value) privateValues(item, allow, out)
  else if (isRecord(value))
    for (const child of Object.values(value)) privateValues(child, allow, out)
  return out
}

const MASKED_KEY = /^<key\d+>$/
const parentOf = (path: string) => path.slice(0, path.lastIndexOf(".") + 1)
const isMaskedSibling = (path: string, of: string) =>
  path.startsWith(parentOf(of)) && MASKED_KEY.test(path.slice(parentOf(of).length))

/** why: a report may mask keys its codec doesn't know, so a rename shows as the known key gone beside a placeholder at the same level. */
export function showsRename(reported: Map<string, string>, from: string, to: string): boolean {
  if (reported.has(from)) return false
  return reported.has(to) || [...reported.keys()].some((path) => isMaskedSibling(path, to))
}

export function matchesMaskedRename(derived: Fix | undefined, truth: Fix): boolean {
  return (
    derived?.kind === "rename" &&
    truth.kind === "rename" &&
    derived.to === truth.to &&
    isMaskedSibling(derived.from, truth.from)
  )
}

export type Fix =
  { kind: "rename"; from: string; to: string } | { kind: "retype"; path: string; to: string }

const ignored = (path: string) => path === "writtenBy" || path.startsWith("writtenBy.")

/**
 * why: what a developer could conclude from the report alone, given the shape the current codec expects.
 * Returns undefined when the report doesn't narrow it to one rename or one retype.
 */
export function deriveFix(
  reported: Map<string, string>,
  expected: Map<string, string>,
): Fix | undefined {
  if (!reported.size) return undefined
  const missing = [...expected.keys()].filter((path) => !reported.has(path) && !ignored(path))
  const extra = [...reported.keys()].filter((path) => !expected.has(path) && !ignored(path))
  const retyped = [...expected].filter(
    ([path, type]) => reported.has(path) && reported.get(path) !== type && !ignored(path),
  )
  const roots = (paths: string[]) =>
    paths.filter((path) => !paths.some((other) => path.startsWith(`${other}.`)))
  const [from] = roots(extra)
  const [to] = roots(missing)
  if (!retyped.length && roots(extra).length === 1 && roots(missing).length === 1 && from && to)
    return reported.get(from) === expected.get(to) ? { kind: "rename", from, to } : undefined
  const [first] = retyped
  if (retyped.length === 1 && !extra.length && !missing.length && first)
    return { kind: "retype", path: first[0], to: first[1] }
  return undefined
}
