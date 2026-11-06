import { translate } from "@/i18n/translate"

import { turnGroupOf, type TurnGroups } from "../../../convex/lib/turns"

type Named = { id: string; name: string }

/** why: a team is named by its players in seat order, so a group of one keeps its player's own name. */
export function teamName(
  players: readonly Named[],
  groups: TurnGroups | undefined,
  playerId: string,
): string | undefined {
  const names = teamMembers(players, groups, playerId).map(({ name }) => name)
  if (names.length < 2) return names[0]
  return translate("board:teams.name", {
    first: names.slice(0, -1).join(", "),
    second: names[names.length - 1],
  })
}

export function teamMembers<Player extends { id: string }>(
  players: readonly Player[],
  groups: TurnGroups | undefined,
  playerId: string,
): Player[] {
  const group = turnGroupOf(groups, playerId)
  return players.filter(({ id }) => group.includes(id))
}

/** why: a team is one winner choice, offered at its first seat; a player outside any team is their own choice. */
export function teamChoices<Player extends { id: string }>(
  players: readonly Player[],
  groups: TurnGroups | undefined,
): Player[] {
  return players.filter((player) => teamMembers(players, groups, player.id)[0] === player)
}

/** why: each team's name once, in seat order, for a result that lists its winners. */
export function winnerNames(
  players: readonly Named[],
  groups: TurnGroups | undefined,
  winnerIds: readonly string[],
): string[] {
  return teamChoices(
    players.filter(({ id }) => winnerIds.includes(id)),
    groups,
  ).flatMap(({ id }) => teamName(players, groups, id) ?? [])
}

/** why: a team's row shows its value only when the team shares one, so the team's name keeps the room; screen readers still hear each member's value. */
export function teamValueLabel(
  players: readonly { id: string; life: number }[],
  groups: TurnGroups | undefined,
  playerId: string,
  label: (life: number) => string,
): { shown?: string; spoken: string } {
  const lives = teamMembers(players, groups, playerId).map(({ life }) => life)
  if (lives.every((life) => life === lives[0])) {
    const value = label(lives[0] ?? 0)
    return { shown: value, spoken: value }
  }
  return { spoken: lives.map(label).join(", ") }
}
