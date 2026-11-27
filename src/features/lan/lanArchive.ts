import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto"

import type { ConnectedGameResult } from "@/features/connected/OutboxSyncController"
import { isSharedDeckKey } from "@/features/decks/sharedDecks"
import {
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  asPlayerId,
  commanderDamageKey,
  completedMatchResult,
} from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import type { GameEvent, LocalGame, LocalGameMatch, SeatPassHashes } from "@/features/game/types"

import {
  lanProjection,
  lanRoundId,
  lanSeatAppearance,
  startingLifeFor,
  type LanGame,
} from "./lanGame"
import { commanderTotals } from "../../../convex/lib/gameEngineMemory"
import { commanderField } from "../../../convex/lib/gameRules"

/** why: must match `convex/lib/seatPass.ts`, which checks each guest's claim; no test runs both sides. */
export const hashSeatPassToken = async (token: string) =>
  (await digestStringAsync(CryptoDigestAlgorithm.SHA256, token)).toLowerCase()

/** why: History and the cloud read a match from each game's own copy of it, without the seat keys only the host needs. */
function archivedMatch(game: LanGame, finished: LocalGame): LocalGameMatch | undefined {
  if (!game.match) return undefined
  const { seatKeys: _seatKeys, ...match } = game.match
  const result = completedMatchResult({ ...finished, match })
  return result ? { ...match, result } : match
}

export function lanLocalGame(
  game: LanGame,
  {
    result,
    ownerId,
    seatPassHashes,
  }: { result?: ConnectedGameResult; ownerId?: string; seatPassHashes?: SeatPassHashes },
): LocalGame {
  const { setup, memory } = game
  const id = asGameId(lanRoundId(game))
  const recorded = [...(memory?.events.values() ?? [])]
  const undoneClaims = new Map(
    recorded.flatMap((event) =>
      event.kind === "commanderDamage.claimed" && event.undoOfOperationId
        ? [[event.operationId, event.undoOfOperationId] as const]
        : [],
    ),
  )
  const confirmedByClaim = new Map(
    recorded.flatMap((event) =>
      event.kind === "commanderDamage.confirmed" && event.claimOperationId
        ? [[event.claimOperationId, event.operationId] as const]
        : [],
    ),
  )
  const events = recorded.flatMap((event): GameEvent[] => {
    const { delta, fromPlayerId, toPlayerId } = event
    if (delta === undefined) return []
    const base = {
      operationId: asOperationId(event.operationId),
      gameId: id,
      actorId: asActorId(event.actorUserId ?? event.playerId),
      deviceId: asDeviceId(event.deviceId ?? event.playerId),
      clientCreatedAt: event.clientCreatedAt,
    }
    if (event.kind === "life.changed")
      return [
        {
          type: "life.changed",
          ...base,
          playerId: asPlayerId(event.playerId),
          delta,
          ...(event.undoOfOperationId
            ? { compensatesOperationId: asOperationId(event.undoOfOperationId) }
            : {}),
        },
      ]
    if (event.kind === "commanderDamage.confirmed" && fromPlayerId && toPlayerId) {
      const undone = event.claimOperationId && undoneClaims.get(event.claimOperationId)
      const compensates = undone && confirmedByClaim.get(undone)
      return [
        {
          type: "commanderDamage.assigned",
          ...base,
          fromPlayerId: asPlayerId(fromPlayerId),
          toPlayerId: asPlayerId(toPlayerId),
          ...commanderField(event.commander),
          delta,
          ...(compensates ? { compensatesOperationId: asOperationId(compensates) } : {}),
        },
      ]
    }
    return []
  })
  const commanderDamage = Object.fromEntries(
    (memory ? commanderTotals(memory) : [])
      .filter(({ total }) => total > 0)
      .map(({ fromPlayerId, toPlayerId, commander, total }) => [
        commanderDamageKey(asPlayerId(fromPlayerId), asPlayerId(toPlayerId), commander),
        total,
      ]),
  )
  const { table } = lanProjection(game, game.hostKey)
  const hostDeck = game.seats.find((seat) => seat.key === game.hostKey)?.deck
  const free = setup.freeMulligans
  const counts = game.pregame?.mulligans ?? {}
  const hostMulligans = counts[game.hostKey]
  const guestCounts = Object.entries(counts).flatMap(([key, count]) =>
    key === game.hostKey ? [] : [[asPlayerId(key), count] as const],
  )
  const firstPlayerId = game.pregame?.firstPlayer?.playerId
  const finished: LocalGame = {
    schemaVersion: 1,
    id,
    status: "finished",
    ...(setup.system ? { system: setup.system } : {}),
    ...(setup.format ? { format: setup.format } : {}),
    ...(memory?.variant && memory.turnGroups
      ? { variant: memory.variant, turnGroups: memory.turnGroups }
      : {}),
    lifeStep: setup.lifeStep,
    startingLife: setup.startingLife,
    players: game.seats.map((seat) => {
      const startingLife = startingLifeFor(setup, seat.deck)
      return {
        id: asPlayerId(seat.key),
        name: seat.name,
        ...lanSeatAppearance(seat.seat, setup.playerCount),
        life: memory?.seats.get(seat.key)?.currentLife ?? startingLife,
        seat: seat.seat - 1,
        ...(startingLife === setup.startingLife ? {} : { startingLife }),
      }
    }),
    events,
    ...(Object.keys(commanderDamage).length > 0 ? { commanderDamage } : {}),
    ...(table ? { table } : {}),
    createdAt: game.startedAt ?? game.updatedAt,
    updatedAt: game.updatedAt,
    finishedAt: game.updatedAt,
    ...(result?.kind === "win"
      ? { result: { kind: "win", winnerPlayerIds: result.winnerPlayerIds.map(asPlayerId) } }
      : result?.kind === "draw"
        ? { result: { kind: "draw" } }
        : {}),
    ...(firstPlayerId ? { firstPlayerId: asPlayerId(firstPlayerId) } : {}),
    ...(free && guestCounts.length > 0
      ? { nearbyMulligans: { free, counts: Object.fromEntries(guestCounts) } }
      : {}),
    ...(ownerId
      ? {
          account: {
            ownerId,
            mePlayerId: asPlayerId(game.hostKey),
            ...(free && hostDeck ? { freeMulligans: free } : {}),
            ...(free && hostDeck && hostMulligans !== undefined
              ? { mulligans: hostMulligans }
              : {}),
            ...(hostDeck && isSharedDeckKey(hostDeck.versionId)
              ? {
                  deckKey: hostDeck.versionId,
                  deckName: hostDeck.name,
                  ...(hostDeck.fingerprint ? { deckFingerprint: hostDeck.fingerprint } : {}),
                }
              : hostDeck
                ? { deckVersionId: hostDeck.versionId, deckName: hostDeck.name }
                : {}),
          },
        }
      : {}),
    ...(seatPassHashes ? { seatPassHashes } : {}),
  }
  const match = archivedMatch(game, finished)
  return match ? { ...finished, match } : finished
}

export function archiveLanGame(
  game: LanGame,
  result: ConnectedGameResult | undefined,
  passHashes: ReadonlyMap<string, string>,
  ownerId: string | undefined,
) {
  const seatPassHashes: SeatPassHashes = {}
  for (const { key } of game.seats) {
    const hash = passHashes.get(key)
    if (hash && key !== game.hostKey) seatPassHashes[asPlayerId(key)] = hash
  }
  const finished = lanLocalGame(game, { result, ownerId, seatPassHashes })
  localGameRepository.archiveGame(finished)
  return finished
}
