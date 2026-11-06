import { translate } from "@/i18n/translate"

import { turnGroupOf, type TurnGroups } from "../../../convex/lib/turns"

export function teamName(
  players: readonly { id: string; name: string }[],
  teams: TurnGroups | undefined,
  playerId: string,
): string | undefined {
  const names = turnGroupOf(teams, playerId).flatMap(
    (id) => players.find((player) => player.id === id)?.name ?? [],
  )
  if (names.length === 2)
    return translate("board:teams.name", { first: names[0], second: names[1] })
  return names[0]
}
