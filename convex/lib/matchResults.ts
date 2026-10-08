export const MATCH_BEST_OF = [1, 3, 5] as const
export type MatchBestOf = (typeof MATCH_BEST_OF)[number]
export type MatchOutcome = "win" | "loss" | "draw" | "unknown"

// why: drawn games don't count toward bestOf, so a match can hold more games than its bestOf.
export const MAX_GAMES_PER_MATCH = 10

export function isMatchBestOf(value: unknown): value is MatchBestOf {
  return MATCH_BEST_OF.some((bestOf) => bestOf === value)
}

export function winsNeeded(bestOf: MatchBestOf) {
  return Math.ceil(bestOf / 2)
}

/** why: one rule for manual entry, Scryve matches, and the end-match form, so no surface accepts a result another rejects. */
export function assertGameScores(
  seats: readonly { gamesWon?: number; gamesDrawn?: number; outcome: MatchOutcome }[],
  bestOf: MatchBestOf,
) {
  const maxWins = winsNeeded(bestOf)
  let totalWins = 0
  for (const seat of seats) {
    if (seat.gamesWon !== undefined) {
      if (!Number.isInteger(seat.gamesWon) || seat.gamesWon < 0 || seat.gamesWon > maxWins)
        throw new Error(`Games won must be 0–${maxWins} in a best of ${bestOf}`)
      totalWins += seat.gamesWon
    }
    if (
      seat.gamesDrawn !== undefined &&
      (!Number.isInteger(seat.gamesDrawn) ||
        seat.gamesDrawn < 0 ||
        seat.gamesDrawn > MAX_GAMES_PER_MATCH)
    )
      throw new Error(`Games drawn must be 0–${MAX_GAMES_PER_MATCH}`)
  }
  // why: two seats split at most bestOf games, but a pod spreads wins across seats (2-1-1 in a best of 3).
  if (totalWins > (seats.length > 2 ? MAX_GAMES_PER_MATCH : bestOf))
    throw new Error(`A best of ${bestOf} cannot have ${totalWins} wins`)
  // why: a score is all or nothing, so a partial one is never guessed into game counters.
  const scored = seats.filter((seat) => seat.gamesWon !== undefined)
  if (scored.length !== 0 && scored.length !== seats.length)
    throw new Error("Enter games won for every seat or leave the score blank")
  const winners = seats.filter((seat) => seat.outcome === "win")
  if (winners.length > 1) throw new Error("A match can only have one winner")
  // why: a called round draws the seats still playing, so a drawn match is the only winner-less one.
  if (winners.length === 0 && !seats.some((seat) => seat.outcome === "draw"))
    throw new Error("A match needs a winner unless it was drawn")
  if (scored.length === seats.length) {
    const most = Math.max(...seats.map((seat) => seat.gamesWon ?? 0))
    const ahead = seats.filter((seat) => seat.gamesWon === most)
    if (winners.length === 1 && (winners[0].gamesWon !== most || ahead.length > 1))
      throw new Error("The winner must have the most game wins")
    if (winners.length === 0 && ahead.length === 1)
      throw new Error("The seat with the most game wins must be the winner")
  }
}
