import type { LocalGameSummary, PlayerId } from "./types"

export interface ClaimDecision {
  id: string
  claim: boolean
  mePlayerId?: PlayerId
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
    const decision = byId.get(game.id)
    // why: a game another account claimed meanwhile stays theirs even if this picker still listed it.
    if (!decision || game.account || game.status !== "finished") return game
    if (!decision.claim)
      return game.skippedBy?.includes(ownerId)
        ? game
        : { ...game, skippedBy: [...(game.skippedBy ?? []), ownerId] }
    const me = game.players.find((player) => player.id === decision.mePlayerId)
    return {
      ...game,
      account: { ownerId, ...(me ? { mePlayerId: me.id } : {}) },
      publish: "pending",
    }
  })
}
