import { useEffect, useState } from "react"
import { Platform } from "react-native"

import { storage } from "@/utils/storage"

import type { ComprehensiveRules } from "./comprehensiveRules"
import type { TextRules } from "./gameRules"

type RulesStore = {
  getString(key: string): string | undefined
  set(key: string, value: string): void
}
type Fetcher = (
  url: string,
  init?: { headers: Record<string, string> },
) => Promise<Pick<Response, "ok" | "status" | "text"> & { headers?: Pick<Headers, "get"> }>
type Loaded = { url: string; rules: ComprehensiveRules }

const loaded = new WeakMap<RulesStore, Map<string, Loaded>>()
const downloads = new WeakMap<RulesStore, Map<string, Promise<ComprehensiveRules>>>()
const checked = new WeakMap<RulesStore, Map<string, true>>()

function entries<T>(map: WeakMap<RulesStore, Map<string, T>>, store: RulesStore) {
  const existing = map.get(store)
  if (existing) return existing
  const created = new Map<string, T>()
  map.set(store, created)
  return created
}

function read(store: RulesStore, key: string) {
  try {
    return store.getString(key)
  } catch {
    return undefined
  }
}

function storedUrl(source: TextRules, store: RulesStore) {
  return read(store, `${source.cacheKey}.url.v1`)
}

function isCurrent(source: TextRules, store: RulesStore) {
  return (
    storedUrl(source, store) === source.url &&
    (!source.revalidate || entries(checked, store).has(source.cacheKey))
  )
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

function validators(source: TextRules, store: RulesStore) {
  const etag = read(store, `${source.cacheKey}.etag.v1`)
  const modified = read(store, `${source.cacheKey}.modified.v1`)
  const headers: Record<string, string> = {
    ...(etag ? { "If-None-Match": etag } : {}),
    ...(modified ? { "If-Modified-Since": modified } : {}),
  }
  return Object.keys(headers).length > 0 ? { headers } : undefined
}

async function fetchRules(source: TextRules, store: RulesStore, fetcher: Fetcher) {
  const stored = source.revalidate ? loadStoredRules(source, store) : undefined
  const conditional = stored?.url === source.url ? validators(source, store) : undefined
  const response = await (conditional ? fetcher(source.url, conditional) : fetcher(source.url))
  if (response.status === 304 && conditional && stored) {
    entries(checked, store).set(source.cacheKey, true)
    return stored.rules
  }
  if (!response.ok) throw new Error(`Rules download failed with ${response.status}`)
  const text = await response.text()
  const rules = source.parse(text)
  if (!rules) throw new Error("Rules download was not the official rules")
  try {
    store.set(`${source.cacheKey}.text.v1`, text)
    store.set(`${source.cacheKey}.url.v1`, source.url)
    if (source.revalidate) {
      store.set(`${source.cacheKey}.etag.v1`, response.headers?.get("ETag") ?? "")
      store.set(`${source.cacheKey}.modified.v1`, response.headers?.get("Last-Modified") ?? "")
    }
  } catch (error) {
    console.error("[rules] failed to cache the rules", error)
  }
  entries(loaded, store).set(source.cacheKey, { url: source.url, rules })
  entries(checked, store).set(source.cacheKey, true)
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

// why: media.wizards.com and rules.fabtcg.com send no CORS header, so web links to the official page instead.
const canDownload = Platform.OS !== "web"

export function prefetchRules(
  source: TextRules,
  store: RulesStore = storage,
  fetcher: Fetcher = fetch,
) {
  if (!canDownload || isCurrent(source, store)) return
  downloadRules(source, store, fetcher).catch(() => {})
}

export function useComprehensiveRules(source: TextRules) {
  const [stored] = useState(() => loadStoredRules(source))
  const [rules, setRules] = useState(stored?.rules)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!canDownload) return
    if (isCurrent(source, storage)) {
      const latest = loadStoredRules(source)?.rules
      if (latest) setRules(latest)
      return
    }
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
