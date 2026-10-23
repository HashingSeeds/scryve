import { useQuery } from "convex/react"

import { keyStatsRecord } from "./deckStatLines"
import { api } from "../../../convex/_generated/api"

export function useDeckKeyStats(deckKey: string | undefined, ready: boolean) {
  const result = useQuery(api.decks.statsForKey, ready && deckKey ? { deckKey } : "skip")
  if (result === undefined) return undefined
  return keyStatsRecord(result.all)
}
