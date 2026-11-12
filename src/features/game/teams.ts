import { translate } from "@/i18n/translate"

import { PLAYER_COLOR_CHOICES } from "../../../convex/lib/appearance"
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

export function opposingTeamTotals<Id extends string>(
  teams: readonly (readonly Id[])[],
  own: Id,
  first: Record<Id, number>,
  partner: Record<Id, number>,
  armedId?: Id,
): { first: Record<Id, number>; partner: Record<Id, number> } {
  const stronger = (id: Id) => Math.max(first[id] ?? 0, partner[id] ?? 0)
  const shown = { first: {} as Record<Id, number>, partner: {} as Record<Id, number> }
  for (const team of teams) {
    if (team.includes(own) || !team[0]) continue
    const armed = team.find((id) => id === armedId)
    const source = armed ?? team.reduce((best, id) => (stronger(id) > stronger(best) ? id : best))
    const pip = armed ?? team[0]
    shown.first[pip] = first[source] ?? 0
    if (partner[source] !== undefined) shown.partner[pip] = partner[source]
  }
  return shown
}

export function teamColors(
  leads: readonly string[],
  chosen: readonly (string | undefined)[],
): string[] {
  const used = new Set(leads.flatMap((_, team) => chosen[team]?.toUpperCase() ?? []))
  return leads.map((lead, team) => {
    const picked = chosen[team]
    if (picked) return picked
    const color = [lead, ...PLAYER_COLOR_CHOICES].find((c) => !used.has(c.toUpperCase())) ?? lead
    used.add(color.toUpperCase())
    return color
  })
}
