import { useQuery } from "convex/react"

import { api } from "../../../convex/_generated/api"

export function useDeckKeyStats(deckKey: string | undefined, ready: boolean) {
  const result = useQuery(api.decks.statsForKey, ready && deckKey ? { deckKey } : "skip")
  if (result === undefined) return undefined
  const stats = result.all
  return {
    games: stats?.games ?? 0,
    wins: stats?.wins ?? 0,
    losses: stats?.losses ?? 0,
    draws: stats?.draws ?? 0,
    unknown: stats?.unknown ?? 0,
    connected: {
      games: {
        total: stats?.games ?? 0,
        wins: stats?.wins ?? 0,
        losses: stats?.losses ?? 0,
        draws: stats?.draws ?? 0,
      },
      ...(stats?.connectedMatches ? { matches: stats.connectedMatches } : {}),
    },
    manual: {
      ...(stats?.manualMatches ? { matches: stats.manualMatches } : {}),
      ...(stats?.manualGames ? { games: stats.manualGames } : {}),
    },
  }
}
