import {
  buildFinishedLocalGameSnapshot,
  buildMatchFinishSnapshot,
} from "@/features/connected/localGameSnapshot"

import {
  applyGameCommand,
  asDeviceId,
  canContinueMatch,
  createLocalGame,
  createNextMatchGame,
  createRematch,
  defaultCommandContext,
  matchContextLabel,
  matchScoreAfter,
  restartMatchGame,
} from "./domain"
import { LocalGameRepository, type StringStorage } from "./localPersistence"
import type { LocalGame } from "./types"

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

function matchGame(bestOf: 1 | 3 | 5 = 3, now = 1) {
  return createLocalGame({
    now,
    startingLife: 20,
    players: [
      { name: "Ada", color: "#000" },
      { name: "Grace", color: "#111" },
    ],
    account: { ownerId: "owner", meSeat: 0, deckVersionId: "v1", deckName: "Burn" },
    match: { bestOf },
  })
}

function finish(game: LocalGame, winner: number | "draw", now: number) {
  return applyGameCommand(
    game,
    {
      type: "game.finish",
      result:
        winner === "draw"
          ? { kind: "draw" }
          : { kind: "win", winnerPlayerIds: [game.players[winner].id] },
    },
    { ...defaultCommandContext(asDeviceId("device")), now: () => now },
  )
}

describe("local match", () => {
  it("starts at game one with no score and shows the standing before each game", () => {
    const game = matchGame()
    expect(game.match).toMatchObject({ bestOf: 3, gameNumber: 1, wins: [0, 0], draws: 0 })
    expect(game.match?.id).toMatch(/^match_/)
    expect(matchContextLabel(game)).toBe("Game 1 · 0-0")
  })

  it("carries the score into the next game and ends the match at the needed wins", () => {
    const first = finish(matchGame(), 0, 10)
    expect(first.match?.result).toBeUndefined()
    expect(canContinueMatch(first)).toBe(true)
    const second = createNextMatchGame(first, 20)
    expect(second.match).toMatchObject({ id: first.match?.id, gameNumber: 2, wins: [1, 0] })
    expect(second.account?.mePlayerId).toBe(second.players[0].id)
    expect(matchContextLabel(second)).toBe("Game 2 · 1-0")

    const drawn = finish(second, "draw", 30)
    expect(drawn.match?.result).toBeUndefined()
    const third = createNextMatchGame(drawn, 40)
    expect(matchContextLabel(third)).toBe("Game 3 · 1-0 · 1 draw")

    const decided = finish(third, 0, 50)
    expect(decided.match?.result).toEqual({ outcomes: ["win", "loss"] })
    expect(matchScoreAfter(decided)).toEqual({ wins: [2, 0], draws: 1 })
    expect(canContinueMatch(decided)).toBe(false)
    expect(() => createNextMatchGame(decided)).toThrow("cannot continue")
  })

  it("hands the table a fresh match after a rematch", () => {
    const decided = finish(matchGame(1), 1, 10)
    const rematch = createRematch(decided, 20)
    expect(rematch.match).toMatchObject({ bestOf: 1, gameNumber: 1, wins: [0, 0], draws: 0 })
    expect(rematch.match?.id).not.toBe(decided.match?.id)
  })

  it("survives a restart on the active game and on the archived summary", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const second = createNextMatchGame(finish(matchGame(), 1, 10), 20)
    repository.saveActiveGame(second)
    expect(repository.loadActiveGame()?.match).toEqual(second.match)

    const decided = finish(second, 1, 30)
    repository.archiveGame(decided, "game_menu")
    const [summary] = repository.loadHistory()
    expect(summary.match).toEqual(decided.match)
    expect(summary.matchPublish).toBe("pending")
    expect(repository.loadHistoryDetail(decided.id)?.game.match).toEqual(decided.match)
  })

  it("drops a stored match that no longer lines up with the seats", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const game = matchGame()
    repository.saveActiveGame({ ...game, match: { ...game.match!, wins: [0] } })
    expect(repository.loadActiveGame()?.match).toBeUndefined()
  })

  it("ends a match by writing the result onto its latest game", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const first = finish(matchGame(), 0, 10)
    repository.archiveGame(first, "game_menu")
    expect(repository.loadHistory()[0].matchPublish).toBeUndefined()
    const listener = jest.fn()
    repository.onGameFinished(listener)

    const ended = repository.finishMatch(first.match!.id, ["win", "loss"])
    expect(ended?.match?.result).toEqual({ outcomes: ["win", "loss"] })
    expect(repository.loadHistory()[0]).toMatchObject({
      id: first.id,
      matchPublish: "pending",
      match: { result: { outcomes: ["win", "loss"] } },
    })
    expect(repository.loadHistoryDetail(first.id)?.game.match?.result).toEqual({
      outcomes: ["win", "loss"],
    })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(repository.finishMatch(first.match!.id, ["loss", "win"])).toBeNull()
  })

  it("uploads games oldest first and holds the match result until they are acked", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const first = finish(matchGame(), 0, 10)
    const second = finish(createNextMatchGame(first, 20), 0, 30)
    repository.archiveGame(first, "game_menu")
    repository.archiveGame(second, "game_menu")
    expect(repository.pendingPublishes("owner").map((game) => game.id)).toEqual([
      first.id,
      second.id,
    ])
    expect(repository.pendingMatchFinishes("owner")).toEqual([])
    repository.markPublished(first.id)
    expect(repository.pendingMatchFinishes("owner")).toEqual([])
    repository.markPublished(second.id)
    expect(repository.pendingMatchFinishes("owner").map((game) => game.id)).toEqual([second.id])
    repository.markMatchPublished(second.id)
    expect(repository.pendingMatchFinishes("owner")).toEqual([])
    expect(repository.loadHistory()[0].matchPublish).toBe("published")
  })

  it("drops a match result once one of its games was rejected", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const first = finish(matchGame(), 0, 10)
    const second = finish(createNextMatchGame(first, 20), 0, 30)
    repository.archiveGame(first, "game_menu")
    repository.archiveGame(second, "game_menu")
    repository.markPublishFailed(first.id)
    repository.markPublished(second.id)
    expect(repository.matchFinishesWithFailedGames("owner").map((game) => game.id)).toEqual([
      second.id,
    ])
    repository.markMatchPublishFailed(second.id)
    expect(repository.loadHistory()[0].matchPublish).toBe("failed")
    expect(repository.pendingMatchFinishes("owner")).toEqual([])
    expect(repository.matchFinishesWithFailedGames("owner")).toEqual([])
  })

  it("restarts a game inside the match without touching the score", () => {
    const second = createNextMatchGame(finish(matchGame(), 0, 10), 20)
    const restarted = restartMatchGame(second, 30)
    expect(restarted.id).not.toBe(second.id)
    expect(restarted.match).toEqual(second.match)
    expect(restarted.players.map((player) => player.life)).toEqual([20, 20])
    expect(restarted.account?.mePlayerId).toBe(restarted.players[0].id)
  })

  it("builds the publish payloads with the match id, order, score, and outcomes", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const first = finish(matchGame(), 0, 10)
    const second = finish(createNextMatchGame(first, 20), 0, 30)
    repository.archiveGame(second, "game_menu")
    const [summary] = repository.loadHistory()
    expect(buildFinishedLocalGameSnapshot(summary).match).toEqual({
      publicId: second.match?.id,
      bestOf: 3,
      gameNumber: 2,
    })
    expect(buildMatchFinishSnapshot(summary)).toEqual({
      publicId: second.match?.id,
      finishedAt: 30,
      gameCount: 2,
      seats: [
        { seat: 1, gamesWon: 2, gamesDrawn: 0, outcome: "win" },
        { seat: 2, gamesWon: 0, gamesDrawn: 0, outcome: "loss" },
      ],
    })
  })
})
