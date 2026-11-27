import { asPlayerId } from "@/features/game/domain"
import type { PlayerId } from "@/features/game/types"

type Tile = readonly { playerId: string }[]
type DamageRow = { fromPlayerId: string; toPlayerId: string; commander?: number; total: number }

/** why: each other tile's square holds what it dealt this tile's seats, per commander; like the phone's team zone, a team's square shows its harder-hitting head's total, unsplit. */
export function incomingFor(tiles: readonly Tile[], own: Tile, totals: readonly DamageRow[]) {
  const hit = new Set(own.map(({ playerId }) => playerId))
  const dealt = (from: string, commander: number) =>
    totals
      .filter(
        (row) =>
          row.fromPlayerId === from &&
          (row.commander ?? 0) === commander &&
          hit.has(row.toPlayerId),
      )
      .reduce((sum, row) => sum + row.total, 0)
  const incoming: Record<PlayerId, number> = {}
  const split: Record<PlayerId, readonly number[]> = {}
  for (const members of tiles) {
    if (members === own || !members[0]) continue
    const [first, partner] = members
      .map(({ playerId }) => [dealt(playerId, 0), dealt(playerId, 1)] as const)
      .reduce((best, next) => (Math.max(...next) > Math.max(...best) ? next : best))
    const id = asPlayerId(members[0].playerId)
    incoming[id] = Math.max(first, partner)
    if (partner > 0 && members.length === 1) split[id] = [first, partner]
  }
  return { incoming, split }
}
