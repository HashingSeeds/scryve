import type { TableDefinition } from "./systems"
import { isValidTurnGroups, turnGroupOf, type TurnGroups } from "./turns"

// why: these follow Comprehensive Rules 810, so changes start there.
export const TWO_HEADED_GIANT = "twoHeadedGiant" as const

/** why: CR 810.4 sets 30. 2HG Commander has no official rules, and Wizards' events play 60. */
export const TEAM_LIFE = 30
export const COMMANDER_TEAM_LIFE = 60
export const TEAM_POISON = 15

export const TWO_HEADED_GIANT_SEATS_MESSAGE =
  "Two-Headed Giant needs an even number of seats, 4 or more"

export const isTwoHeadedGiantPlayerCount = (count: number) =>
  Number.isInteger(count) && count >= 4 && count % 2 === 0

export const defaultTeamLife = (format: string | undefined) =>
  format === "commander" ? COMMANDER_TEAM_LIFE : TEAM_LIFE

export const teamLifePresets = (format: string | undefined): readonly number[] =>
  format === "commander" ? [40, 50, COMMANDER_TEAM_LIFE] : [TEAM_LIFE, 40]

export function pairedTeams<Id>(playerIds: readonly Id[]): Id[][] {
  const teams: Id[][] = []
  for (let index = 0; index + 1 < playerIds.length; index += 2)
    teams.push([playerIds[index], playerIds[index + 1]])
  return teams
}

export function isValidTeams(value: unknown, playerIds: ReadonlySet<string>): value is string[][] {
  return (
    isValidTurnGroups(value, playerIds) &&
    value.length >= 2 &&
    value.every((team) => team.length === 2) &&
    value.length * 2 === playerIds.size
  )
}

export const teammatesOf = (teams: TurnGroups | undefined, playerId: string) =>
  teams ? turnGroupOf(teams, playerId).filter((id) => id !== playerId) : []

export function teamTableRules(rules: TableDefinition): TableDefinition {
  return {
    ...rules,
    counters: rules.counters.map((counter) =>
      counter.id === "poison" ? { ...counter, losesAt: TEAM_POISON, shared: true } : counter,
    ),
  }
}
