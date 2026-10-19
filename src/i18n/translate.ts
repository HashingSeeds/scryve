import type { TOptions } from "i18next"

import { i18n, type TxKeyPath } from "."

const MAX_CACHED = 1000

/** why: every i18n.t() calls Intl.getCanonicalLocales, slow on Hermes, and game screens re-render the same keys on each broadcast. */
const cache = new Map<string, string>()
const clearCache = () => cache.clear()

i18n.on("languageChanged", clearCache)
i18n.store.on("added", clearCache)
i18n.store.on("removed", clearCache)

function cacheKey(key: string, options: TOptions | undefined) {
  if (!options) return key
  let result = key
  for (const name in options) {
    const value: unknown = options[name]
    // why: objects and functions (`replace`, `interpolation`, `lngs`) can change without a new key.
    if (value !== null && (typeof value === "object" || typeof value === "function")) return
    result += `\u0000${name}\u0001${typeof value}\u0001${String(value)}`
  }
  return result
}

export function translate(key: TxKeyPath, options?: TOptions): string {
  const id = cacheKey(key, options)
  if (id === undefined) return i18n.t(key, options)

  const cached = cache.get(id)
  if (cached !== undefined) return cached

  const result = i18n.t(key, options)
  // why: returnObjects can yield a mutable object, which must not be shared between callers.
  if (typeof result === "string") {
    // why: per-tick values such as clock times would otherwise grow the cache for a whole game.
    if (cache.size >= MAX_CACHED) cache.clear()
    cache.set(id, result)
  }
  return result
}
