import { useEffect, useState } from "react"
import { Platform } from "react-native"

import { storage } from "@/utils/storage"

import { searchIndexSteps, type ComprehensiveRules } from "./comprehensiveRules"
import type { TextRules } from "./gameRules"
import { finish, runInSlices, type Sliced } from "./slices"

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

function* storedRules(source: TextRules, store: RulesStore): Sliced<Loaded | undefined> {
  const url = storedUrl(source, store)
  const cache = entries(loaded, store)
  const cached = cache.get(source.cacheKey)
  if (cached?.url === url) return cached
  try {
    const text = store.getString(`${source.cacheKey}.text.v1`)
    yield
    const rules = url && text ? yield* source.parse(text) : undefined
    if (!url || !rules) return undefined
    // why: Rules may have read its own copy while a board was still parsing in slices.
    const meanwhile = cache.get(source.cacheKey)
    if (meanwhile?.url === url) return meanwhile
    cache.set(source.cacheKey, { url, rules })
    return { url, rules }
  } catch {
    return undefined
  }
}

export function loadStoredRules(source: TextRules, store: RulesStore = storage) {
  return finish(storedRules(source, store))
}

function validators(source: TextRules, store: RulesStore) {
  const etag = read(store, `${source.cacheKey}.etag.v1`)
  const modified = read(store, `${source.cacheKey}.modified.v1`)
  if (!etag && !modified) return undefined
  return {
    headers: {
      ...(etag ? { "If-None-Match": etag } : {}),
      ...(modified ? { "If-Modified-Since": modified } : {}),
    },
  }
}

async function fetchRules(source: TextRules, store: RulesStore, fetcher: Fetcher) {
  const stored = source.revalidate ? await runInSlices(storedRules(source, store)) : undefined
  const conditional = stored?.url === source.url ? validators(source, store) : undefined
  const response = await (conditional ? fetcher(source.url, conditional) : fetcher(source.url))
  if (response.status === 304 && conditional && stored) {
    entries(checked, store).set(source.cacheKey, true)
    return stored.rules
  }
  if (!response.ok) throw new Error(`Rules download failed with ${response.status}`)
  const text = await response.text()
  const rules = await runInSlices(source.parse(text))
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
const BOARD_SETTLE_MS = 1000

// why: parsing and indexing stalled the first Rules open of each launch by over 100 ms, so a board does both ahead of time, after its own first frames, a few ms per frame.
export function prefetchRules(
  source: TextRules,
  store: RulesStore = storage,
  fetcher: Fetcher = fetch,
) {
  if (!canDownload) return
  setTimeout(() => {
    const rules = isCurrent(source, store)
      ? runInSlices(storedRules(source, store)).then((stored) => stored?.rules)
      : downloadRules(source, store, fetcher)
    rules.then((next) => next && runInSlices(searchIndexSteps(next))).catch(() => {})
  }, BOARD_SETTLE_MS)
}

export function useComprehensiveRules(source: TextRules) {
  const [rules, setRules] = useState(() => loadStoredRules(source)?.rules)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!canDownload) return
    const stored = isCurrent(source, storage) ? loadStoredRules(source)?.rules : undefined
    if (stored) {
      setRules(stored)
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
  }, [source, attempt])
  // why: when no board prepared the index, it builds while the rules show instead of on the first keystroke.
  useEffect(() => {
    if (rules) void runInSlices(searchIndexSteps(rules))
  }, [rules])
  return {
    rules,
    failed,
    retry: () => {
      setFailed(false)
      setAttempt((count) => count + 1)
    },
  }
}
