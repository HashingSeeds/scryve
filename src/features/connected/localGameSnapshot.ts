import type { FunctionArgs } from "convex/server"

import {
  commanderDamageBetween,
  COMMANDER_SLOTS,
  localTableRules,
  matchScoreAfter,
} from "@/features/game/domain"
import { NO_PLAY_SYSTEM, supportsCommanderDamage } from "@/features/game/playSystems"
import type { LocalGame, LocalGameSummary, PlayerId } from "@/features/game/types"

import type { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { MAX_SNAPSHOT_LIFE } from "../../../convex/lib/gameRules"
import { isSystemId } from "../../../convex/lib/systems"
import { isValidTableSnapshot, type TableState } from "../../../convex/lib/table"

type FinishedGameArgs = FunctionArgs<typeof api.games.publishFinishedLocalGame>
type MatchFinishArgs = FunctionArgs<typeof api.matches.finishScryveMatch>

// why: seats rebase to 1..n like `buildLocalGameSnapshot`, and local ids double as winner references so the server needs no id translation.
export function buildFinishedLocalGameSnapshot(game: LocalGameSummary): FinishedGameArgs {
  const ordered = [...game.players].sort((left, right) => left.seat - right.seat)
  const me = game.account?.mePlayerId
  const deckVersionId = game.account?.deckVersionId
  const result = game.result
  const match = game.match
  return {
    match: match
      ? { publicId: match.id, bestOf: match.bestOf, gameNumber: match.gameNumber }
      : undefined,
    publicId: game.id,
    retriesThrottled: true,
    ruleset: game.format ?? NO_PLAY_SYSTEM,
    startingLife: game.startingLife,
    system: isSystemId(game.system) ? game.system : undefined,
    format: game.format || undefined,
    startedAt: game.createdAt,
    finishedAt: game.finishedAt,
    eventCount: game.eventCount,
    firstPlayerLocalId: game.firstPlayerId || undefined,
    players: ordered.map((player, index): FinishedGameArgs["players"][number] => {
      const mine = player.id === me
      return {
        localId: player.id,
        seat: index + 1,
        displayName: player.name,
        color: player.color,
        shape: player.shape || undefined,
        currentLife: Math.max(-MAX_SNAPSHOT_LIFE, Math.min(MAX_SNAPSHOT_LIFE, player.life)),
        me: mine || undefined,
        deckVersionId: mine && deckVersionId ? (deckVersionId as Id<"deckVersions">) : undefined,
        deckKey: (mine && game.account?.deckKey) || undefined,
        deckFingerprint: (mine && game.account?.deckFingerprint) || undefined,
        deckName: (mine && game.account?.deckName) || undefined,
        seatPassHash: (!mine && game.seatPassHashes?.[player.id]) || undefined,
      }
    }),
    result:
      result?.kind === "win"
        ? { kind: "win", winnerLocalIds: result.winnerPlayerIds.map(String) }
        : result?.kind === "draw"
          ? { kind: "draw" }
          : { kind: "unknown" },
  }
}

export function buildMatchFinishSnapshot(game: LocalGameSummary): MatchFinishArgs {
  const match = game.match
  if (!match?.result) throw new Error("This game did not end a match")
  const score = matchScoreAfter(game)
  const ordered = game.players
    .map((player, seat) => ({ player, seat }))
    .sort((left, right) => left.player.seat - right.player.seat)
  return {
    publicId: match.id,
    finishedAt: game.finishedAt,
    gameCount: match.gameNumber,
    seats: ordered.map(({ seat }, index): MatchFinishArgs["seats"][number] => ({
      seat: index + 1,
      gamesWon: score.wins[seat],
      gamesDrawn: score.draws,
      outcome: match.result!.outcomes[seat],
    })),
  }
}

/**
 * The `publishLocalGame` payload, built entirely from local state.
 *
 * Seats are the awkward part: a local game numbers seats from zero (they come
 * from the player array index) while the server requires 1..playerCount, so every
 * seat crosses this boundary rebased.
 */
export type LocalGameSnapshot = FunctionArgs<typeof api.games.publishLocalGame>

export interface LocalGameSnapshotInput {
  game: LocalGame
  /** Which seat belongs to the publishing account. */
  hostPlayerId: PlayerId
  operationId: string
  publicId: string
  inviteToken: string
  manualCodeCandidates: string[]
  deviceId?: string
}

/** Commander totals are only accepted for Commander games, matching the server. */
function commanderTotalsFor(
  game: LocalGame,
  seatsByPlayerId: Map<PlayerId, number>,
): LocalGameSnapshot["commanderTotals"] {
  if (!game.commanderDamage || !supportsCommanderDamage(game.system, game.format)) return undefined
  const seats = [...seatsByPlayerId]
  const totals = seats.flatMap(([fromPlayerId, fromSeat]) =>
    seats.flatMap(([toPlayerId, toSeat]) =>
      COMMANDER_SLOTS.flatMap((commander): NonNullable<LocalGameSnapshot["commanderTotals"]> => {
        const total = commanderDamageBetween(game, fromPlayerId, toPlayerId, commander)
        return fromSeat === toSeat || total <= 0 ? [] : [{ fromSeat, toSeat, commander, total }]
      }),
    ),
  )
  return totals.length > 0 ? totals : undefined
}

/**
 * Maps a running local game onto the publish mutation's arguments.
 *
 * `operationId` must stay stable across retries of one publish attempt: the
 * server's receipt rejects a reused id whose payload differs.
 */
export function buildLocalGameSnapshot({
  game,
  hostPlayerId,
  operationId,
  publicId,
  inviteToken,
  manualCodeCandidates,
  deviceId,
}: LocalGameSnapshotInput): LocalGameSnapshot {
  const ordered = [...game.players].sort((left, right) => left.seat - right.seat)
  if (!ordered.some((player) => player.id === hostPlayerId))
    throw new Error("The host seat must be one of this game's players")
  const seatsByPlayerId = new Map<PlayerId, number>(
    ordered.map((player, index) => [player.id, index + 1]),
  )
  const commanderTotals = commanderTotalsFor(game, seatsByPlayerId)
  const table = tableFor(game)
  return {
    operationId,
    publicId,
    inviteToken,
    manualCodeCandidates,
    ruleset: game.format ?? NO_PLAY_SYSTEM,
    startingLife: game.startingLife,
    hostLocalId: hostPlayerId,
    system: game.system || undefined,
    format: game.format || undefined,
    lifeStep: game.lifeStep,
    deviceId: deviceId || undefined,
    players: ordered.map((player, index): LocalGameSnapshot["players"][number] => ({
      localId: player.id,
      seat: index + 1,
      displayName: player.name,
      color: player.color,
      shape: player.shape || undefined,
      currentLife: player.life,
    })),
    commanderTotals,
    table,
    layout: game.layout || undefined,
    editsAnySeat: true,
  }
}

// why: the server rejects a table its own reducer could not have produced, so a table that would fail the whole publish is left behind instead.
function tableFor(game: LocalGame) {
  const turns = {
    ...(game.turn ? { turn: game.turn } : {}),
    ...(game.turnGroups ? { turnGroups: game.turnGroups } : {}),
  }
  const playerIds = new Set<string>(game.players.map(({ id }) => id))
  const valid = (table: TableState) =>
    isValidTableSnapshot(table, localTableRules(game), playerIds) ? table : undefined
  const turnsOnly =
    game.turn || game.turnGroups ? { designations: {}, players: {}, ...turns } : undefined
  return (game.table && valid({ ...game.table, ...turns })) ?? (turnsOnly && valid(turnsOnly))
}
