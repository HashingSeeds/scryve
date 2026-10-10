import { asGameId, asPlayerId, createLocalGame } from "@/features/game/domain"

import {
  createReassembler,
  encodeFrames,
  FRAME_BYTES,
  parseTableMessage,
  tableSnapshot,
} from "./protocol"

const game = createLocalGame({
  gameId: asGameId("game"),
  now: 1,
  startingLife: 40,
  players: ["Ana 🐉", "Bō", "Chidi", "Dana", "Émile", "Farah"].map((name) => ({
    name,
    color: "#000",
  })),
})

describe("table protocol", () => {
  it("rebuilds a multi-frame snapshot, unicode names included", () => {
    const frames = encodeFrames({ type: "game", game: tableSnapshot(game) }, 7)
    expect(frames.length).toBeGreaterThan(1)
    for (const frame of frames) expect(frame.length / 2).toBeLessThanOrEqual(FRAME_BYTES)

    const receive = createReassembler()
    const results = frames.map((frame) => receive("host", frame))
    expect(results.slice(0, -1)).toEqual(frames.slice(1).map(() => undefined))
    expect(results.at(-1)).toEqual({ type: "game", game: tableSnapshot(game) })
  })

  it("drops a message that lost a frame and still reads the next one", () => {
    const receive = createReassembler()
    const lost = encodeFrames({ type: "game", game }, 1)
    for (const frame of lost.slice(0, -1)) receive("host", frame)
    const next = encodeFrames({ type: "sync" }, 2)
    expect(receive("host", next[0]!)).toEqual({ type: "sync" })

    const missingMiddle = encodeFrames({ type: "game", game }, 3)
    expect(missingMiddle.filter((_, i) => i !== 1).map((f) => receive("host", f))).toEqual(
      missingMiddle.slice(1).map(() => undefined),
    )
  })

  it("accepts only life and commander damage commands from guests", () => {
    const playerId = asPlayerId("p1")
    expect(
      parseTableMessage(
        JSON.stringify({ type: "command", command: { type: "life.change", playerId, delta: -1 } }),
      ),
    ).toEqual({ type: "command", command: { type: "life.change", playerId, delta: -1 } })
    expect(
      parseTableMessage(JSON.stringify({ type: "command", command: { type: "game.finish" } })),
    ).toBeUndefined()
    expect(parseTableMessage("not json")).toBeUndefined()
  })
})
