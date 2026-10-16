import { v, type Infer } from "convex/values"

// why: these rules follow the creator's Comprehensive Rules, so changes start there: https://mtgtreachery.net/rules/cr/
export const gameVariantValidator = v.literal("treachery")
export type GameVariant = Infer<typeof gameVariantValidator>

export const treacheryRoleValidator = v.union(
  v.literal("leader"),
  v.literal("guardian"),
  v.literal("assassin"),
  v.literal("traitor"),
)
export type TreacheryRole = Infer<typeof treacheryRoleValidator>

// why: the creator's role table, cut to the seat counts a Scryve game allows.
const ROLE_DECKS: Partial<Record<number, readonly TreacheryRole[]>> = {
  4: ["leader", "traitor", "assassin", "assassin"],
  5: ["leader", "traitor", "assassin", "assassin", "guardian"],
  6: ["leader", "traitor", "assassin", "assassin", "assassin", "guardian"],
}

export const TREACHERY_SEATS_MESSAGE = "Treachery needs 4–6 seats"

export const isTreacheryPlayerCount = (count: number) => ROLE_DECKS[count] !== undefined

export function dealTreacheryRoles(count: number, random = Math.random): TreacheryRole[] {
  const deck = ROLE_DECKS[count]
  if (!deck) throw new Error(TREACHERY_SEATS_MESSAGE)
  const roles = [...deck]
  for (let index = roles.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[roles[index], roles[other]] = [roles[other]!, roles[index]!]
  }
  return roles
}

export type TreacheryOutcome<PlayerId> =
  { kind: "win"; winnerPlayerIds: PlayerId[] } | { kind: "draw" }

/* why: CR 907.8 teams are the Leader with the Guardians, all Assassins, and each Traitor alone.
   A team wins together, so members who already lost still win. */
export function treacheryOutcome<PlayerId>(
  seats: readonly { playerId: PlayerId; role: TreacheryRole; inGame: boolean }[],
): TreacheryOutcome<PlayerId> | undefined {
  const remaining = seats.filter((seat) => seat.inGame)
  const win = (winners: readonly { playerId: PlayerId }[]) => ({
    kind: "win" as const,
    winnerPlayerIds: winners.map((seat) => seat.playerId),
  })
  if (remaining.some((seat) => seat.role === "leader"))
    return remaining.every((seat) => seat.role === "leader" || seat.role === "guardian")
      ? win(seats.filter((seat) => seat.role === "leader" || seat.role === "guardian"))
      : undefined
  if (remaining.some((seat) => seat.role === "assassin"))
    return win(seats.filter((seat) => seat.role === "assassin"))
  // why: the Guardians lose with the Leader, and every deck here has one Traitor.
  const traitor = remaining.find((seat) => seat.role === "traitor")
  return traitor ? win([traitor]) : { kind: "draw" }
}
