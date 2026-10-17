import { useEffect, useState } from "react"
import { Platform } from "react-native"

import { storage } from "@/utils/storage"

import { parseComprehensiveRules, type ComprehensiveRules } from "./comprehensiveRules"

export const RULES_URL = "https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt"
export const RULES_PAGE_URL = "https://magic.wizards.com/en/rules"
const URL_KEY = "scryve.rules.url.v1"
const TEXT_KEY = "scryve.rules.text.v1"

type RulesStore = {
  getString(key: string): string | undefined
  set(key: string, value: string): void
}
type Fetcher = (url: string) => Promise<Pick<Response, "ok" | "status" | "text">>

const loaded = new WeakMap<RulesStore, { url: string; rules: ComprehensiveRules }>()
const downloads = new WeakMap<RulesStore, Promise<ComprehensiveRules>>()

function storedUrl(store: RulesStore) {
  try {
    return store.getString(URL_KEY)
  } catch {
    return undefined
  }
}

export function loadStoredRules(store: RulesStore = storage) {
  const url = storedUrl(store)
  const cached = loaded.get(store)
  if (cached?.url === url) return cached
  try {
    const text = store.getString(TEXT_KEY)
    const rules = url && text ? parseComprehensiveRules(text) : undefined
    if (!url || !rules) return undefined
    loaded.set(store, { url, rules })
    return { url, rules }
  } catch {
    return undefined
  }
}

async function fetchRules(store: RulesStore, fetcher: Fetcher) {
  const response = await fetcher(RULES_URL)
  if (!response.ok) throw new Error(`Rules download failed with ${response.status}`)
  const text = await response.text()
  const rules = parseComprehensiveRules(text)
  if (!rules) throw new Error("Rules download was not the Comprehensive Rules")
  try {
    store.set(TEXT_KEY, text)
    store.set(URL_KEY, RULES_URL)
  } catch (error) {
    console.error("[rules] failed to cache the rules", error)
  }
  loaded.set(store, { url: RULES_URL, rules })
  return rules
}

export function downloadRules(store: RulesStore = storage, fetcher: Fetcher = fetch) {
  const pending = downloads.get(store)
  if (pending) return pending
  const next = fetchRules(store, fetcher).finally(() => downloads.delete(store))
  downloads.set(store, next)
  return next
}

// why: media.wizards.com sends no CORS header, so web links to the official page instead.
const canDownload = Platform.OS !== "web"

export function prefetchRules(store: RulesStore = storage, fetcher: Fetcher = fetch) {
  if (!canDownload || storedUrl(store) === RULES_URL) return
  downloadRules(store, fetcher).catch(() => {})
}

export function useComprehensiveRules() {
  const [stored] = useState(loadStoredRules)
  const [rules, setRules] = useState(stored?.rules)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!canDownload || stored?.url === RULES_URL) return
    let active = true
    downloadRules()
      .then((next) => {
        if (active) setRules(next)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [stored, attempt])
  return {
    rules,
    failed,
    retry: () => {
      setFailed(false)
      setAttempt((count) => count + 1)
    },
  }
}
