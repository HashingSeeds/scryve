import {
  isTwoHeadedGiantPlayerCount,
  TWO_HEADED_GIANT,
  TWO_HEADED_GIANT_SEATS_MESSAGE,
} from "./twoHeadedGiant"

// why: Riftbound Core Rules 491 (2v2): teammates share one point total and win or lose together; XP stays per player (rule 732).
export const TWO_VS_TWO = "twoVsTwo" as const
export const TWO_VS_TWO_SEATS_MESSAGE = "2v2 needs 4 seats"

export const isTwoVsTwoPlayerCount = (count: number) => count === 4

/** why: team variants pair neighboring seats into teams kept in `turnGroups`, which share the main counter, a fate, and a turn. */
export type TeamVariant = typeof TWO_HEADED_GIANT | typeof TWO_VS_TWO

export const isTeamVariant = (variant: unknown): variant is TeamVariant =>
  variant === TWO_HEADED_GIANT || variant === TWO_VS_TWO

export const isTeamPlayerCount = (variant: TeamVariant, count: number) =>
  variant === TWO_VS_TWO ? isTwoVsTwoPlayerCount(count) : isTwoHeadedGiantPlayerCount(count)

export const teamSeatsMessage = (variant: TeamVariant) =>
  variant === TWO_VS_TWO ? TWO_VS_TWO_SEATS_MESSAGE : TWO_HEADED_GIANT_SEATS_MESSAGE
