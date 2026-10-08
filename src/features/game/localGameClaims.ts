import type { LocalGameMatch, LocalGameSummary } from "./types"

export interface ClaimDecision {
  /** why: a match's games are claimed or skipped together, so the id is the match id when the game has one. */
  id: string
  claim: boolean
  /** why: a seat index, because every game of a match seats the same players but with new player ids. */
  meSeat?: number
}

/** why: what the picker offers as one row: a single game, or every game of one match. */
export interface ClaimUnit {
  id: string
  games: LocalGameSummary[]
  match?: LocalGameMatch
}

export function claimUnitId(game: LocalGameSummary) {
  return game.match?.id ?? game.id
}

// why: only a finished game can upload, and an account that already declined it is not asked again; another account on the device still can be.
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

/** why: one decision covers a whole match, with one me seat for all of its games. Units keep History's newest-first order; games inside a unit run oldest first. */
export function claimableLocalUnits(
  games: readonly LocalGameSummary[],
  ownerId: string,
): ClaimUnit[] {
  const units = new Map<string, LocalGameSummary[]>()
  for (const game of claimableLocalGames(games, ownerId)) {
    const id = claimUnitId(game)
    units.set(id, [...(units.get(id) ?? []), game])
  }
  return [...units].map(([id, members]) => {
    const ordered = [...members].sort((left, right) => left.finishedAt - right.finishedAt)
    const latest = ordered[ordered.length - 1]
    return { id, games: ordered, ...(latest.match ? { match: latest.match } : {}) }
  })
}

// why: a claimed game belongs to one account; an unclaimed game is everyone's except the accounts that skipped it.
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
      // why: the game that ended a match carries its result upload, which the account now owns too.
      ...(game.match?.result ? { matchPublish: "pending" } : {}),
    }
  })
}
