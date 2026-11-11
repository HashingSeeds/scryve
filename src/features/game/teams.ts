import { translate } from "@/i18n/translate"

import { turnGroupOf, type TurnGroups } from "../../../convex/lib/turns"

type Named = { id: string; name: string }

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

export function teamChoices<Player extends { id: string }>(
  players: readonly Player[],
  groups: TurnGroups | undefined,
): Player[] {
  return players.filter((player) => teamMembers(players, groups, player.id)[0] === player)
}

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

/** why: in Two-Headed Giant a commander's damage to either head counts toward the team's one 21, so a team reads (and an attack builds on) the sum across its heads. */
export function teamIncoming<Id extends string, Commander>(
  teams: readonly (readonly string[])[] | undefined,
  incoming: (to: Id, commander?: Commander) => Record<Id, number>,
): (to: Id, commander?: Commander) => Record<Id, number> {
  if (!teams) return incoming
  return (to, commander) => {
    const team = teams.find((members) => members.includes(to)) ?? [to]
    const sum = {} as Record<Id, number>
    for (const head of team as readonly Id[])
      for (const [from, total] of Object.entries(incoming(head, commander)) as [Id, number][])
        if (!team.includes(from)) sum[from] = (sum[from] ?? 0) + total
    return sum
  }
}
