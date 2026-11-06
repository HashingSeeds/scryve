import { load, save } from "@/utils/storage"

import { customCounterName } from "../../../convex/lib/table"

const RECENT_COUNTER_NAMES_KEY = "count.local.recentCounterNames.v1"
const MAX_RECENT_COUNTER_NAMES = 6

export function recentCounterNames(): string[] {
  const stored = load(RECENT_COUNTER_NAMES_KEY)
  if (!Array.isArray(stored)) return []
  return stored
    .flatMap((value) =>
      typeof value === "string" && customCounterName(value) === value ? [value] : [],
    )
    .slice(0, MAX_RECENT_COUNTER_NAMES)
}

export function rememberCounterName(name: string) {
  const key = name.toLocaleLowerCase()
  save(
    RECENT_COUNTER_NAMES_KEY,
    [name, ...recentCounterNames().filter((recent) => recent.toLocaleLowerCase() !== key)].slice(
      0,
      MAX_RECENT_COUNTER_NAMES,
    ),
  )
}
