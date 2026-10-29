import { buildFinishedLocalGameSnapshot } from "@/features/connected/localGameSnapshot"
import { LocalGameRepository } from "@/features/game/localPersistence"
import type { PlayerId } from "@/features/game/types"

import { lanLocalGame } from "./lanArchive"
import {
  admitLanGuest,
  applyLanWrite,
  createLanGame,
  endLanRound,
  LAN_PROTOCOL,
  lanRoundId,
  setLanDeck,
  startLanRound,
} from "./lanGame"
import { MemoryStorage } from "../../../test/support/memoryStorage"

const NOW = 1_700_000_000_000
const HASH = "a".repeat(64)

function finishedRound(hostDeck?: Parameters<typeof setLanDeck>[2]) {
  const lobby = createLanGame(
    "lan_game",
    "host",
    "Host",
    {
      playerCount: 2,
      startingLife: 40,
      lifeStep: 1,
      ruleset: "commander",
      system: "mtg",
      format: "commander",
    },
    NOW,
  )
  const admitted = admitLanGuest(
    lobby,
    new Map(),
    { type: "join", protocol: LAN_PROTOCOL, name: "Guest" },
    { key: "guest", token: "token" },
  )
  if ("rejected" in admitted) throw new Error(admitted.rejected)
  const started = startLanRound(
    hostDeck ? setLanDeck(admitted.game, "host", hostDeck) : admitted.game,
    NOW + 1,
  )
  const sent = { gameId: lanRoundId(started), deviceId: "device-0001", clientCreatedAt: NOW + 2 }
  const writes: [string, Record<string, unknown>][] = [
    [
      "guest",
      { type: "life.changed", operationId: "life-operation-0001", playerId: "guest", delta: -7 },
    ],
    [
      "host",
      {
        type: "commanderDamage.submitted",
        operationId: "claim-operation-0001",
        fromPlayerId: "host",
        toPlayerId: "guest",
        delta: 5,
      },
    ],
    [
      "guest",
      {
        type: "commanderDamage.resolved",
        operationId: "resolve-operation-0001",
        claimOperationId: "claim-operation-0001",
        toPlayerId: "guest",
        accepted: true,
      },
    ],
  ]
  const game = writes.reduce(
    (current, [sender, event]) =>
      applyLanWrite(
        current,
        sender,
        { ...sent, actorId: sender, ...event } as Parameters<typeof applyLanWrite>[2],
        NOW + 2,
      ).game,
    started,
  )
  return endLanRound(game, "finished", NOW + 3)
}

describe("lanLocalGame", () => {
  it("archives the host's round as a local game that uploads each guest's pass hash", () => {
    const game = lanLocalGame(finishedRound(), {
      result: { kind: "win", winnerPlayerIds: ["host"] },
      ownerId: "host-account",
      seatPassHashes: { ["guest" as PlayerId]: HASH },
    })

    expect(game).toMatchObject({
      id: "lan_game-1",
      status: "finished",
      system: "mtg",
      format: "commander",
      createdAt: NOW + 1,
      finishedAt: NOW + 3,
      result: { kind: "win", winnerPlayerIds: ["host"] },
      account: { ownerId: "host-account", mePlayerId: "host" },
    })
    expect(game.players.map(({ id, life, seat }) => ({ id, life, seat }))).toEqual([
      { id: "host", life: 40, seat: 0 },
      { id: "guest", life: 28, seat: 1 },
    ])
    expect(game.events).toEqual([
      expect.objectContaining({ type: "life.changed", playerId: "guest", delta: -7 }),
      expect.objectContaining({
        type: "commanderDamage.assigned",
        fromPlayerId: "host",
        toPlayerId: "guest",
        delta: 5,
      }),
    ])
    expect(game.commanderDamage).toEqual({ "host>guest": 5 })

    const repository = new LocalGameRepository(new MemoryStorage())
    repository.archiveGame(game)
    const [pending] = repository.pendingPublishes("host-account")
    expect(buildFinishedLocalGameSnapshot(pending).players).toEqual([
      expect.not.objectContaining({ seatPassHash: expect.anything() }),
      expect.objectContaining({ localId: "guest", seatPassHash: HASH }),
    ])
    expect(buildFinishedLocalGameSnapshot(pending).players[0]).toMatchObject({ me: true })
  })

  it("uploads the host's deck with its own seat only", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.archiveGame(
      lanLocalGame(finishedRound({ versionId: "version-atraxa", name: "Atraxa" }), {
        ownerId: "host-account",
        seatPassHashes: { ["guest" as PlayerId]: HASH },
      }),
    )
    const [pending] = repository.pendingPublishes("host-account")

    expect(pending.account).toMatchObject({ deckVersionId: "version-atraxa", deckName: "Atraxa" })
    expect(
      buildFinishedLocalGameSnapshot(pending).players.map((player) => player.deckVersionId),
    ).toEqual(["version-atraxa", undefined])
  })

  it("keeps a signed-out host's round on the device without uploading it", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const summary = repository.archiveGame(lanLocalGame(finishedRound(), {}))

    expect(summary).toMatchObject({ id: "lan_game-1" })
    expect(summary?.publish).toBeUndefined()
  })
})
