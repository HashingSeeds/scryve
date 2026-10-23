import type { EventTableState, PairingInput, RoundPairings } from "./model"
import { tableOutcomes } from "./standings"

/** why: when a rematch is unavoidable the search tries every pairing, which grows factorially with the field. */
const MAX_SEARCH_STEPS = 20_000

export function suggestedSwissRounds(playerCount: number) {
  if (playerCount < 2) return 0
  return Math.max(3, Math.ceil(Math.log2(playerCount)))
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
  }
  return shuffled
}

export function pairingOrder({ players, tables, settings, random }: PairingInput) {
  const points = new Map<string, number>()
  for (const table of tables)
    for (const seat of tableOutcomes(table, settings.points))
      points.set(seat.playerId, (points.get(seat.playerId) ?? 0) + seat.points)
  const active = players.filter((player) => !player.dropped).map((player) => player.id)
  return shuffle(active, random).sort((a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0))
}

export function metBefore(tables: readonly EventTableState[]) {
  const met = new Map<string, Set<string>>()
  for (const { playerIds } of tables)
    for (const playerId of playerIds) {
      const seen = met.get(playerId) ?? new Set()
      for (const other of playerIds) if (other !== playerId) seen.add(other)
      met.set(playerId, seen)
    }
  return met
}

export function pairSwissRound(input: PairingInput): RoundPairings {
  const order = pairingOrder(input)
  const met = metBefore(input.tables)
  if (order.length % 2 === 0)
    return pairWithoutRematches(order, met, { steps: MAX_SEARCH_STEPS }) ?? pairGreedily(order, met)

  const hadBye = new Set(
    input.tables.filter((table) => table.playerIds.length === 1).map((table) => table.playerIds[0]),
  )
  const lowestFirst = [...order].reverse()
  const withoutBye = lowestFirst.filter((id) => !hadBye.has(id))
  const candidates = withoutBye.length > 0 ? withoutBye : lowestFirst
  const budget = { steps: MAX_SEARCH_STEPS }
  for (const bye of candidates) {
    const pairs = pairWithoutRematches(
      order.filter((id) => id !== bye),
      met,
      budget,
    )
    if (pairs) return [...pairs, [bye]]
    if (budget.steps <= 0) break
  }
  const [bye] = candidates
  return [
    ...pairGreedily(
      order.filter((id) => id !== bye),
      met,
    ),
    [bye],
  ]
}

function pairWithoutRematches(
  order: readonly string[],
  met: ReadonlyMap<string, ReadonlySet<string>>,
  budget: { steps: number },
) {
  const used = order.map(() => false)
  const pairs: string[][] = []
  const pairFrom = (start: number): boolean => {
    let first = start
    while (first < order.length && used[first]) first++
    if (first === order.length) return true
    used[first] = true
    for (let next = first + 1; next < order.length; next++) {
      if (used[next] || met.get(order[first])?.has(order[next])) continue
      if (--budget.steps < 0) break
      used[next] = true
      pairs.push([order[first], order[next]])
      if (pairFrom(first + 1)) return true
      pairs.pop()
      used[next] = false
    }
    used[first] = false
    return false
  }
  return pairFrom(0) ? pairs : undefined
}

function pairGreedily(order: readonly string[], met: ReadonlyMap<string, ReadonlySet<string>>) {
  const left = [...order]
  const pairs: string[][] = []
  while (left.length > 1) {
    const [first] = left.splice(0, 1)
    const fresh = left.findIndex((id) => !met.get(first)?.has(id))
    pairs.push([first, ...left.splice(Math.max(fresh, 0), 1)])
  }
  return pairs
}
