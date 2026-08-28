import { applyGameCommand, asDeviceId, createLocalGame, defaultCommandContext } from "./domain"
import {
  DEFAULT_LOCAL_SETTINGS,
  LOCAL_KEYS,
  LocalGameRepository,
  MAX_HISTORY_GAMES,
  type StringStorage,
} from "./localPersistence"

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

function makeGame(now = 1) {
  return createLocalGame({
    now,
    startingLife: 20,
    players: [
      { name: "Ada", color: "#000", shape: "hexagon" },
      { name: "Grace", color: "#111", shape: "circle" },
    ],
  })
}

describe("LocalGameRepository", () => {
  it("recovers an active game and its negative life/event history", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const context = defaultCommandContext(asDeviceId("device"))
    let game = makeGame()
    for (let index = 0; index < 5; index += 1) {
      game = applyGameCommand(
        game,
        { type: "life.change", playerId: game.players[0].id, delta: -5 },
        context,
      )
    }
    repository.saveActiveGame(game)
    expect(repository.loadActiveGame()).toEqual(game)
    expect(repository.loadActiveGame()?.players[0].life).toBe(-5)
  })

  it("falls back safely when active/settings schemas are corrupt", () => {
    const storage = new MemoryStorage()
    storage.set(LOCAL_KEYS.active, "{bad")
    storage.set(LOCAL_KEYS.settings, JSON.stringify({ schemaVersion: 999 }))
    const repository = new LocalGameRepository(storage)
    expect(repository.loadActiveGame()).toBeNull()
    expect(repository.loadSettings()).toEqual(DEFAULT_LOCAL_SETTINGS)
  })

  it("migrates unversioned legacy settings", () => {
    const storage = new MemoryStorage()
    storage.set(
      LOCAL_KEYS.legacySettings,
      JSON.stringify({
        defaultPlayerCount: 6,
        defaultStartingLife: 40,
        hapticsEnabled: false,
        themePreference: "dark",
      }),
    )
    const repository = new LocalGameRepository(storage)
    expect(repository.loadSettings()).toMatchObject({
      schemaVersion: 1,
      defaultPlayerCount: 6,
      defaultStartingLife: 40,
    })
    expect(storage.getString(LOCAL_KEYS.legacySettings)).toBeUndefined()
  })

  it("keeps settings written before the menu button style existed", () => {
    const storage = new MemoryStorage()
    storage.set(
      LOCAL_KEYS.settings,
      JSON.stringify({
        schemaVersion: 1,
        defaultPlayerCount: 5,
        defaultStartingLife: 30,
        hapticsEnabled: false,
        themePreference: "dark",
      }),
    )
    const repository = new LocalGameRepository(storage)
    expect(repository.loadSettings()).toEqual({
      schemaVersion: 1,
      defaultPlayerCount: 5,
      defaultStartingLife: 30,
      hapticsEnabled: false,
      themePreference: "dark",
      menuButtonStyle: "keystoneIIFlat",
    })
  })

  it("round-trips a chosen menu button style and ignores an unknown one", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    repository.saveSettings({ ...DEFAULT_LOCAL_SETTINGS, menuButtonStyle: "prismFlat" })
    expect(repository.loadSettings().menuButtonStyle).toBe("prismFlat")
    storage.set(
      LOCAL_KEYS.settings,
      JSON.stringify({ ...DEFAULT_LOCAL_SETTINGS, menuButtonStyle: "hologram" }),
    )
    expect(repository.loadSettings().menuButtonStyle).toBe("keystoneIIFlat")
  })

  it("archives finish/abandon once, removes the matching active game, and loads detail", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const context = defaultCommandContext(asDeviceId("device"))
    const active = makeGame()
    repository.saveActiveGame(active)
    const finished = applyGameCommand(active, { type: "game.finish" }, context)
    repository.archiveGame(finished)
    repository.archiveGame(finished)
    expect(repository.loadActiveGame()).toBeNull()
    expect(repository.loadHistory()).toHaveLength(1)
    expect(repository.loadHistoryDetail(finished.id)?.game.status).toBe("finished")
  })

  it("keeps the recorded winner on the archived summary and its detail", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const active = makeGame()
    const winner = active.players[1].id
    const finished = applyGameCommand(
      active,
      { type: "game.finish", result: { kind: "win", winnerPlayerIds: [winner] } },
      defaultCommandContext(asDeviceId("device")),
    )
    repository.archiveGame(finished)
    expect(repository.loadHistory()[0].result).toEqual({ kind: "win", winnerPlayerIds: [winner] })
    expect(repository.loadHistoryDetail(finished.id)?.game.result).toEqual({
      kind: "win",
      winnerPlayerIds: [winner],
    })
  })

  it("ignores a stored result that no longer parses", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const finished = applyGameCommand(
      makeGame(),
      { type: "game.finish", result: { kind: "draw" } },
      defaultCommandContext(asDeviceId("device")),
    )
    repository.archiveGame(finished)
    const detail = JSON.parse(storage.getString(LOCAL_KEYS.historyDetail(finished.id))!)
    detail.game.result = { kind: "win", winnerPlayerIds: [] }
    storage.set(LOCAL_KEYS.historyDetail(finished.id), JSON.stringify(detail))
    expect(repository.loadHistoryDetail(finished.id)?.game.result).toBeUndefined()
  })

  it("bounds history and removes evicted details", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const context = defaultCommandContext(asDeviceId("device"))
    const games = Array.from({ length: MAX_HISTORY_GAMES + 3 }, (_, index) => {
      const game = makeGame(index + 1)
      const ended = applyGameCommand(game, { type: "game.abandon" }, context)
      repository.archiveGame(ended)
      return ended
    })
    expect(repository.loadHistory()).toHaveLength(MAX_HISTORY_GAMES)
    expect(repository.loadHistoryDetail(games[0].id)).toBeNull()
    expect(repository.loadHistoryDetail(games.at(-1)!.id)).not.toBeNull()
  })
})
