import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto"

import type { ConnectedGameResult } from "@/features/connected/OutboxSyncController"
import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import type { GameEvent, LocalGame, SeatPassHashes } from "@/features/game/types"

import {
  lanProjection,
  lanRoundId,
  lanSeatAppearance,
  startingLifeFor,
  type LanGame,
} from "./lanGame"
import { commanderTotals } from "../../../convex/lib/gameEngineMemory"

/** why: must match `convex/lib/seatPass.ts`, which checks each guest's claim; no test runs both sides. */
export const hashSeatPassToken = async (token: string) =>
  (await digestStringAsync(CryptoDigestAlgorithm.SHA256, token)).toLowerCase()

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
  const events = [...(memory?.events.values() ?? [])].flatMap((event): GameEvent[] => {
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
      return [{ type: "life.changed", ...base, playerId: asPlayerId(event.playerId), delta }]
    if (event.kind === "commanderDamage.confirmed" && fromPlayerId && toPlayerId)
      return [
        {
          type: "commanderDamage.assigned",
          ...base,
          fromPlayerId: asPlayerId(fromPlayerId),
          toPlayerId: asPlayerId(toPlayerId),
          delta,
        },
      ]
    return []
  })
  const commanderDamage = Object.fromEntries(
    (memory ? commanderTotals(memory) : [])
      .filter(({ total }) => total > 0)
      .map(({ fromPlayerId, toPlayerId, total }) => [`${fromPlayerId}>${toPlayerId}`, total]),
  )
  const { table } = lanProjection(game, game.hostKey)
  const hostDeck = game.seats.find((seat) => seat.key === game.hostKey)?.deck
  return {
    schemaVersion: 1,
    id,
    status: "finished",
    ...(setup.system ? { system: setup.system } : {}),
    ...(setup.format ? { format: setup.format } : {}),
    lifeStep: setup.lifeStep,
    startingLife: setup.startingLife,
    players: game.seats.map((seat) => {
      const startingLife = startingLifeFor(setup, seat.deck)
      return {
        id: asPlayerId(seat.key),
        name: seat.name,
        ...lanSeatAppearance(seat.seat),
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
    ...(ownerId
      ? {
          account: {
            ownerId,
            mePlayerId: asPlayerId(game.hostKey),
            ...(hostDeck ? { deckVersionId: hostDeck.versionId, deckName: hostDeck.name } : {}),
          },
        }
      : {}),
    ...(seatPassHashes && Object.keys(seatPassHashes).length > 0 ? { seatPassHashes } : {}),
  }
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
  return localGameRepository.archiveGame(lanLocalGame(game, { result, ownerId, seatPassHashes }))
}
