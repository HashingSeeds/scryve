import { load, save } from "@/utils/storage"

const LIMIT = 8

const recentKey = (cacheKey: string) => `${cacheKey}.recent.v1`

export function recentRules(cacheKey: string): string[] {
  const stored = load(recentKey(cacheKey))
  return Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : []
}

export function rememberRule(cacheKey: string, id: string) {
  save(
    recentKey(cacheKey),
    [id, ...recentRules(cacheKey).filter((seen) => seen !== id)].slice(0, LIMIT),
  )
}
