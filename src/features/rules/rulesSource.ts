import { useEffect, useState } from "react"
import { Platform } from "react-native"

import { storage } from "@/utils/storage"

import type { ComprehensiveRules } from "./comprehensiveRules"
import type { TextRules } from "./gameRules"

type RulesStore = {
  getString(key: string): string | undefined
  set(key: string, value: string): void
}
type Fetcher = (url: string) => Promise<Pick<Response, "ok" | "status" | "text">>
type Loaded = { url: string; rules: ComprehensiveRules }

const loaded = new WeakMap<RulesStore, Map<string, Loaded>>()
const downloads = new WeakMap<RulesStore, Map<string, Promise<ComprehensiveRules>>>()

function entries<T>(map: WeakMap<RulesStore, Map<string, T>>, store: RulesStore) {
  const existing = map.get(store)
  if (existing) return existing
  const created = new Map<string, T>()
  map.set(store, created)
  return created
}

function storedUrl(source: TextRules, store: RulesStore) {
  try {
    return store.getString(`${source.cacheKey}.url.v1`)
  } catch {
    return undefined
  }
}

export function loadStoredRules(source: TextRules, store: RulesStore = storage) {
  const url = storedUrl(source, store)
  const cache = entries(loaded, store)
  const cached = cache.get(source.cacheKey)
  if (cached?.url === url) return cached
  try {
    const text = store.getString(`${source.cacheKey}.text.v1`)
    const rules = url && text ? source.parse(text) : undefined
    if (!url || !rules) return undefined
    cache.set(source.cacheKey, { url, rules })
    return { url, rules }
  } catch {
    return undefined
  }
}

async function fetchRules(source: TextRules, store: RulesStore, fetcher: Fetcher) {
  const response = await fetcher(source.url)
  if (!response.ok) throw new Error(`Rules download failed with ${response.status}`)
  const text = await response.text()
  const rules = source.parse(text)
  if (!rules) throw new Error("Rules download was not the official rules")
  try {
    store.set(`${source.cacheKey}.text.v1`, text)
    store.set(`${source.cacheKey}.url.v1`, source.url)
  } catch (error) {
    console.error("[rules] failed to cache the rules", error)
  }
  entries(loaded, store).set(source.cacheKey, { url: source.url, rules })
  return rules
}

export function downloadRules(
  source: TextRules,
  store: RulesStore = storage,
  fetcher: Fetcher = fetch,
) {
  const pending = entries(downloads, store)
  const existing = pending.get(source.cacheKey)
  if (existing) return existing
  const next = fetchRules(source, store, fetcher).finally(() => pending.delete(source.cacheKey))
  pending.set(source.cacheKey, next)
  return next
}

// why: media.wizards.com sends no CORS header, so web links to the official page instead.
const canDownload = Platform.OS !== "web"

export function prefetchRules(
  source: TextRules,
  store: RulesStore = storage,
  fetcher: Fetcher = fetch,
) {
  if (!canDownload || storedUrl(source, store) === source.url) return
  downloadRules(source, store, fetcher).catch(() => {})
}

export function useComprehensiveRules(source: TextRules) {
  const [stored] = useState(() => loadStoredRules(source))
  const [rules, setRules] = useState(stored?.rules)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!canDownload || stored?.url === source.url) return
    let active = true
    downloadRules(source)
      .then((next) => {
        if (active) setRules(next)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [source, stored, attempt])
  return {
    rules,
    failed,
    retry: () => {
      setFailed(false)
      setAttempt((count) => count + 1)
    },
  }
}
