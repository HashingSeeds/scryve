import { useEffect, useState } from "react"
import { Platform } from "react-native"

import { storage } from "@/utils/storage"

import { parseComprehensiveRules, type ComprehensiveRules } from "./comprehensiveRules"

export const RULES_URL = "https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt"
export const RULES_PAGE_URL = "https://magic.wizards.com/en/rules"
const RULES_KEY = "scryve.rules.comprehensive.v1"

type RulesStore = {
  getString(key: string): string | undefined
  set(key: string, value: string): void
}

let parsed: { source: string; rules: ComprehensiveRules } | undefined

function parse(source: string) {
  if (parsed?.source === source) return parsed.rules
  const rules = parseComprehensiveRules(source)
  if (rules) parsed = { source, rules }
  return rules
}

export function loadStoredRules(store: RulesStore = storage) {
  try {
    const stored: unknown = JSON.parse(store.getString(RULES_KEY) ?? "null")
    if (typeof stored !== "object" || stored === null) return undefined
    if (!("url" in stored) || typeof stored.url !== "string") return undefined
    if (!("text" in stored) || typeof stored.text !== "string") return undefined
    const rules = parse(stored.text)
    return rules ? { url: stored.url, rules } : undefined
  } catch {
    return undefined
  }
}

export async function downloadRules(
  store: RulesStore = storage,
  fetcher: (url: string) => Promise<Pick<Response, "ok" | "status" | "text">> = fetch,
) {
  const response = await fetcher(RULES_URL)
  if (!response.ok) throw new Error(`Rules download failed with ${response.status}`)
  const text = await response.text()
  const rules = parse(text)
  if (!rules) throw new Error("Rules download was not the Comprehensive Rules")
  store.set(RULES_KEY, JSON.stringify({ url: RULES_URL, text }))
  return rules
}

export function useComprehensiveRules() {
  const [stored] = useState(loadStoredRules)
  const [rules, setRules] = useState(stored?.rules)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    // why: media.wizards.com sends no CORS header, so web links to the official page instead.
    if (Platform.OS === "web" || stored?.url === RULES_URL) return
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
