import { buildFinishedLocalGameSnapshot } from "@/features/connected/localGameSnapshot"
import { LocalGameRepository, type StringStorage } from "@/features/game/localPersistence"
import type { PlayerId } from "@/features/game/types"

import { lanLocalGame } from "./lanArchive"
import {
  admitLanGuest,
  applyLanWrite,
  createLanGame,
  endLanRound,
  LAN_PROTOCOL,
  lanRoundId,
  startLanRound,
} from "./lanGame"

const NOW = 1_700_000_000_000
const HASH = "a".repeat(64)

class MemoryStorage implements StringStorage {
  values = new Map<string, string>()
  getString(key: string) {
    return this.values.get(key)
  }
  set(key: string, value: string) {
    this.values.set(key, value)
  }
  delete(key: string) {
    this.values.delete(key)
  }
}

function finishedRound() {
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
  const started = startLanRound(admitted.game, NOW + 1)
  const { game } = applyLanWrite(
    started,
    "guest",
    {
      type: "life.changed",
      operationId: "life-operation-0001",
      gameId: lanRoundId(started),
      actorId: "guest",
      deviceId: "device-guest",
      clientCreatedAt: NOW + 2,
      playerId: "guest",
      delta: -7,
    } as Parameters<typeof applyLanWrite>[2],
    NOW + 2,
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
      { id: "guest", life: 33, seat: 1 },
    ])
    expect(game.events).toEqual([
      expect.objectContaining({ type: "life.changed", playerId: "guest", delta: -7 }),
    ])

    const repository = new LocalGameRepository(new MemoryStorage())
    repository.archiveGame(game)
    const [pending] = repository.pendingPublishes("host-account")
    expect(buildFinishedLocalGameSnapshot(pending).players).toEqual([
      expect.not.objectContaining({ seatPassHash: expect.anything() }),
      expect.objectContaining({ localId: "guest", seatPassHash: HASH }),
    ])
    expect(buildFinishedLocalGameSnapshot(pending).players[0]).toMatchObject({ me: true })
  })

  it("keeps a signed-out host's round on the device without uploading it", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const summary = repository.archiveGame(lanLocalGame(finishedRound(), {}))

    expect(summary).toMatchObject({ id: "lan_game-1" })
    expect(summary?.publish).toBeUndefined()
  })
})
