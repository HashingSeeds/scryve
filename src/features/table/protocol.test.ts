import {
  applyGameCommand,
  asDeviceId,
  asGameId,
  asPlayerId,
  createLocalGame,
  defaultCommandContext,
} from "@/features/game/domain"

import {
  applyTablePatch,
  createReassembler,
  encodeFrames,
  FRAME_BYTES,
  parseTableMessage,
  tablePatch,
  tableSnapshot,
} from "./protocol"

const game = createLocalGame({
  gameId: asGameId("game"),
  now: 1,
  startingLife: 40,
  system: "mtg",
  players: ["Ana 🐉", "Bō", "Chidi", "Dana", "Émile", "Farah"].map((name) => ({
    name,
    color: "#000",
  })),
})

describe("table protocol", () => {
  it("rebuilds a multi-frame snapshot, unicode names included", () => {
    const message = { type: "game" as const, game: tableSnapshot(game), acks: { a1: 3 } }
    const frames = encodeFrames(message, 7)
    expect(frames.length).toBeGreaterThan(1)
    for (const frame of frames) expect(frame.length / 2).toBeLessThanOrEqual(FRAME_BYTES)

    const receive = createReassembler()
    const results = frames.map((frame) => receive("host", frame))
    expect(results.slice(0, -1)).toEqual(frames.slice(1).map(() => undefined))
    expect(results.at(-1)).toEqual(message)
  })

  it("drops a message that lost a frame and still reads the next one", () => {
    const receive = createReassembler()
    const lost = encodeFrames({ type: "game", game, acks: {} }, 1)
    for (const frame of lost.slice(0, -1)) receive("host", frame)
    expect(receive("host", encodeFrames({ type: "sync" }, 2)[0]!)).toEqual({ type: "sync" })

    const missingMiddle = encodeFrames({ type: "game", game, acks: {} }, 3)
    expect(missingMiddle.filter((_, i) => i !== 1).map((f) => receive("host", f))).toEqual(
      missingMiddle.slice(1).map(() => undefined),
    )
  })

  it("sends a six-seat board change as one frame the guest can apply", () => {
    const context = defaultCommandContext(asDeviceId("device"))
    const [first, second] = game.players
    const changed = applyGameCommand(
      applyGameCommand(game, { type: "life.change", playerId: second!.id, delta: -3 }, context),
      { type: "commanderDamage.assign", fromPlayerId: first!.id, toPlayerId: second!.id, delta: 5 },
      context,
    )
    const patch = tablePatch(changed)
    expect(encodeFrames({ type: "patch", patch, acks: { a1: 12 } }, 1)).toHaveLength(1)

    const guestBoard = tableSnapshot(game)
    const patched = applyTablePatch(guestBoard, patch)
    expect(patched?.players.map((player) => player.life)).toEqual(
      changed.players.map((player) => player.life),
    )
    expect(patched?.commanderDamage).toEqual(changed.commanderDamage)
    expect(applyTablePatch({ ...guestBoard, players: guestBoard.players.slice(1) }, patch)).toBe(
      undefined,
    )
  })

  it("accepts only life and commander damage commands from guests", () => {
    const playerId = asPlayerId("p1")
    const command = { type: "life.change" as const, playerId, delta: -1 }
    expect(
      parseTableMessage(JSON.stringify({ type: "command", command, guest: "a1", id: 4 })),
    ).toEqual({ type: "command", command, guest: "a1", id: 4 })
    expect(
      parseTableMessage(
        JSON.stringify({ type: "command", command: { type: "game.finish" }, guest: "a1", id: 5 }),
      ),
    ).toBeUndefined()
    expect(parseTableMessage("not json")).toBeUndefined()
  })
})
