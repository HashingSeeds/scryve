import type { LocalGameMatch, LocalGameSummary } from "./types"

export interface ClaimDecision {
  id: string
  claim: boolean
  meSeat?: number
}

export interface ClaimUnit {
  id: string
  games: LocalGameSummary[]
  match?: LocalGameMatch
}

export function claimUnitId(game: LocalGameSummary) {
  return game.match?.id ?? game.id
}

export function claimableLocalGames(
  games: readonly LocalGameSummary[],
  ownerId: string,
): LocalGameSummary[] {
  return games.filter(
    (game) =>
      game.status === "finished" &&
      game.account === undefined &&
      !game.skippedBy?.includes(ownerId),
  )
}

export function claimableLocalUnits(
  games: readonly LocalGameSummary[],
  ownerId: string,
  deferred: ReadonlySet<string> = new Set(),
): ClaimUnit[] {
  const units = new Map<string, LocalGameSummary[]>()
  for (const game of claimableLocalGames(games, ownerId)) {
    const id = claimUnitId(game)
    units.set(id, [...(units.get(id) ?? []), game])
  }
  // why: a match with a new game since "Not now" comes back whole, or its earlier games would be left out.
  const undecided = [...units].filter(([, members]) => members.some(({ id }) => !deferred.has(id)))
  return undecided.map(([id, members]) => {
    const ordered = [...members].sort((left, right) => left.finishedAt - right.finishedAt)
    const latest = ordered[ordered.length - 1]
    return { id, games: ordered, ...(latest.match ? { match: latest.match } : {}) }
  })
}

export function localGameVisibleTo(game: LocalGameSummary, viewerId?: string): boolean {
  if (game.account) return game.account.ownerId === viewerId
  return viewerId === undefined || !game.skippedBy?.includes(viewerId)
}

export function applyClaimDecisions(
  games: readonly LocalGameSummary[],
  ownerId: string,
  decisions: readonly ClaimDecision[],
): LocalGameSummary[] {
  const byId = new Map(decisions.map((decision) => [decision.id, decision]))
  return games.map((game) => {
    const decision = byId.get(claimUnitId(game))
    // why: a game another account claimed meanwhile stays theirs even if this picker still listed it.
    if (!decision || game.account || game.status !== "finished") return game
    if (!decision.claim)
      return game.skippedBy?.includes(ownerId)
        ? game
        : { ...game, skippedBy: [...(game.skippedBy ?? []), ownerId] }
    const me = decision.meSeat === undefined ? undefined : game.players[decision.meSeat]
    return {
      ...game,
      account: { ownerId, ...(me ? { mePlayerId: me.id } : {}) },
      publish: "pending",
      ...(game.match?.result ? { matchPublish: "pending" } : {}),
    }
  })
}
