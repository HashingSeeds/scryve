import {
  applyGameCommand,
  asDeviceId,
  commanderDamageKey,
  createLocalGame,
  defaultCommandContext,
} from "./domain"
import {
  DEFAULT_LOCAL_SETTINGS,
  LOCAL_KEYS,
  LocalGameRepository,
  MAX_ACTIVE_EVENTS,
  MAX_HISTORY_GAMES,
  type StringStorage,
} from "./localPersistence"
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

const tapContext = defaultCommandContext(asDeviceId("device"))

function tap(game: LocalGame) {
  const delta = game.events.length % 2 === 0 ? -1 : 1
  return applyGameCommand(
    game,
    { type: "life.change", playerId: game.players[0].id, delta },
    tapContext,
  )
}

describe("LocalGameRepository", () => {
  it("keeps a swapped seat order and drops one that does not cover every player", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const game = makeGame()
    repository.saveActiveGame({ ...game, seatOrder: [1, 0] })
    expect(repository.loadActiveGame()?.seatOrder).toEqual([1, 0])

    repository.saveActiveGame({ ...game, seatOrder: [1, 1] })
    expect(repository.loadActiveGame()).not.toHaveProperty("seatOrder")
  })

  it("updates players on the latest board and keeps events and commander damage", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const original = makeGame()
    const current = applyGameCommand(
      original,
      {
        type: "commanderDamage.assign",
        fromPlayerId: original.players[0].id,
        toPlayerId: original.players[1].id,
        delta: 3,
      },
      defaultCommandContext(asDeviceId("device")),
    )
    repository.saveActiveGame(current)
    const players = original.players.map((player, index) => ({
      name: index ? player.name : "Alex",
      color: "#39755C",
      shape: "star" as const,
    }))
    repository.updateActivePlayers(original.id, players)
    expect(repository.loadActiveGame()).toMatchObject({
      id: original.id,
      events: current.events,
      commanderDamage: current.commanderDamage,
      players: current.players.map((player, index) => ({ ...player, ...players[index] })),
    })
    expect(() => repository.updateActivePlayers("another-game", players)).toThrow(
      "This game changed",
    )
    expect(() => repository.updateActivePlayers(original.id, players.slice(1))).toThrow(
      "This game changed",
    )
    expect(() =>
      repository.updateActivePlayers(
        original.id,
        players.map((p) => ({ ...p, name: "same" })),
      ),
    ).toThrow("unique")
  })

  it("keeps the analytics id stable and independent of gameplay identity", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)

    const analyticsId = repository.getAnalyticsId()
    const deviceId = repository.getDeviceId()

    expect(analyticsId).toMatch(/^analytics_[0-9a-f]{32}$/)
    expect(analyticsId).not.toBe(deviceId)
    expect(repository.getAnalyticsId()).toBe(analyticsId)
    expect(new LocalGameRepository(storage).getAnalyticsId()).toBe(analyticsId)
  })

  it("rotates the analytics id without disturbing the device id", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const deviceId = repository.getDeviceId()
    const before = repository.getAnalyticsId()

    const after = repository.resetAnalyticsId()

    expect(after).not.toBe(before)
    expect(repository.getAnalyticsId()).toBe(after)
    expect(repository.getDeviceId()).toBe(deviceId)
  })

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

  it("recovers commander damage counters alongside the life they moved", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const context = defaultCommandContext(asDeviceId("device"))
    let game = createLocalGame({
      now: 1,
      startingLife: 40,
      system: "mtg",
      format: "commander",
      players: [
        { name: "Ada", color: "#000", shape: "hexagon" },
        { name: "Grace", color: "#111", shape: "circle" },
      ],
    })
    const [ada, grace] = game.players
    game = applyGameCommand(
      game,
      { type: "commanderDamage.assign", fromPlayerId: ada.id, toPlayerId: grace.id, delta: 7 },
      context,
    )
    game = applyGameCommand(
      game,
      { type: "commanderDamage.assign", fromPlayerId: grace.id, toPlayerId: ada.id, delta: 3 },
      context,
    )

    repository.saveActiveGame(game)
    const loaded = repository.loadActiveGame()

    expect(loaded).toEqual(game)
    expect(loaded?.commanderDamage).toEqual({
      [commanderDamageKey(ada.id, grace.id)]: 7,
      [commanderDamageKey(grace.id, ada.id)]: 3,
    })
    expect(loaded?.players.map((player) => player.life)).toEqual([37, 33])
  })

  it("loads an active game stored in the schema 1 layout and keeps appending to it", () => {
    const storage = new MemoryStorage()
    let game = makeGame()
    for (let index = 0; index < 150; index += 1) game = tap(game)
    const { events, ...rest } = game
    storage.set(
      LOCAL_KEYS.active,
      JSON.stringify({ schemaVersion: 1, game: rest, eventChunkCount: 2 }),
    )
    storage.set(LOCAL_KEYS.activeEvents(0), JSON.stringify(events.slice(0, 100)))
    storage.set(LOCAL_KEYS.activeEvents(1), JSON.stringify(events.slice(100)))
    const repository = new LocalGameRepository(storage)

    expect(repository.loadActiveGame()).toEqual(game)
    game = tap(game)
    repository.saveActiveGame(game)
    expect(repository.loadActiveGame()).toEqual(game)
  })

  it("writes only the newest chunk per tap and drops the oldest 100 events at once past the cap", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    let game = makeGame()
    for (let index = 0; index < MAX_ACTIVE_EVENTS; index += 1) {
      game = tap(game)
      repository.saveActiveGame(game)
    }
    const set = jest.spyOn(storage, "set")
    const savedKeys = (next: LocalGame) => {
      set.mockClear()
      repository.saveActiveGame(next)
      return set.mock.calls.map(([key]) => key)
    }

    game = tap(game)
    expect(savedKeys(game)).toEqual(
      [0, 1, 2, 3, 4].map(LOCAL_KEYS.activeEvents).concat(LOCAL_KEYS.active),
    )
    const reopened = repository.loadActiveGame()
    expect(reopened?.events).toEqual(game.events.slice(100))

    const tappedAfterReopen = tap(reopened ?? makeGame())
    expect(savedKeys(tappedAfterReopen)).toEqual([LOCAL_KEYS.activeEvents(4), LOCAL_KEYS.active])
    expect(repository.loadActiveGame()?.events).toEqual(tappedAfterReopen.events)
  })

  it("keeps a game saved by a newer version until the player replaces it", () => {
    const storage = new MemoryStorage()
    const newer = JSON.stringify({ schemaVersion: 2, game: {}, eventChunkCount: 0 })
    storage.set(LOCAL_KEYS.active, newer)
    const repository = new LocalGameRepository(storage)

    expect(repository.loadActiveGame()).toBeNull()
    expect(repository.hasNewerActiveGame()).toBe(true)
    repository.saveActiveGame(tap(makeGame()))
    expect(storage.getString(LOCAL_KEYS.active)).toBe(newer)

    repository.clearActiveGame()
    expect(repository.hasNewerActiveGame()).toBe(false)
    const game = tap(makeGame())
    repository.saveActiveGame(game)
    expect(repository.loadActiveGame()).toEqual(game)
  })

  it("falls back safely when active/settings schemas are corrupt", () => {
    const storage = new MemoryStorage()
    storage.set(LOCAL_KEYS.active, "{bad")
    storage.set(LOCAL_KEYS.settings, JSON.stringify({ schemaVersion: 999 }))
    const repository = new LocalGameRepository(storage)
    expect(repository.loadActiveGame()).toBeNull()
    expect(repository.loadSettings()).toEqual(DEFAULT_LOCAL_SETTINGS)
  })

  it("asks what you play only on a fresh install", () => {
    const fresh = new LocalGameRepository(new MemoryStorage())
    expect(fresh.loadSettings().askWhatYouPlay).toBe(true)
    expect(fresh.loadSettings().askWhatYouPlay).toBe(true)

    const existing = new MemoryStorage()
    existing.set(LOCAL_KEYS.settings, JSON.stringify(DEFAULT_LOCAL_SETTINGS))
    expect(new LocalGameRepository(existing).loadSettings().askWhatYouPlay).toBeUndefined()
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
      launchDestination: "play",
    })
  })

  it.each([
    [2, 20, 25],
    [4, 20, 30],
    [2, 22, 22],
  ])("migrates a %i-player Brawl default stored at %i life to %i", (players, stored, expected) => {
    const storage = new MemoryStorage()
    storage.set(
      LOCAL_KEYS.settings,
      JSON.stringify({
        schemaVersion: 1,
        defaultPlayerCount: players,
        defaultStartingLife: stored,
        hapticsEnabled: true,
        themePreference: "dark",
        defaultSystem: "mtg",
        defaultFormat: "brawl",
      }),
    )
    expect(new LocalGameRepository(storage).loadSettings().defaultStartingLife).toBe(expected)
  })

  it("keeps a Brawl starting life of 20 chosen after the migration", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    repository.saveSettings({
      ...repository.loadSettings(),
      defaultSystem: "mtg",
      defaultFormat: "brawl",
      defaultStartingLife: 20,
    })
    expect(new LocalGameRepository(storage).loadSettings().defaultStartingLife).toBe(20)
  })

  it("stores a default system and format only when both are known", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    expect(repository.loadSettings().defaultSystem).toBeUndefined()
    expect(repository.loadSettings().defaultFormat).toBeUndefined()

    repository.saveSettings({
      ...DEFAULT_LOCAL_SETTINGS,
      defaultSystem: "mtg",
      defaultFormat: "commander",
    })
    expect(repository.loadSettings()).toMatchObject({
      defaultSystem: "mtg",
      defaultFormat: "commander",
    })

    storage.set(
      LOCAL_KEYS.settings,
      JSON.stringify({
        ...DEFAULT_LOCAL_SETTINGS,
        defaultSystem: "mtg",
        defaultFormat: "advanced",
      }),
    )
    expect(repository.loadSettings().defaultFormat).toBeUndefined()

    storage.set(
      LOCAL_KEYS.settings,
      JSON.stringify({
        ...DEFAULT_LOCAL_SETTINGS,
        defaultSystem: "netrunner",
        defaultFormat: "commander",
      }),
    )
    expect(repository.loadSettings().defaultSystem).toBeUndefined()
    expect(repository.loadSettings().defaultFormat).toBeUndefined()
  })

  it("stores Yu-Gi-Oh! starting Life Points", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)

    repository.saveSettings({
      ...DEFAULT_LOCAL_SETTINGS,
      defaultSystem: "ygo",
      defaultFormat: "advanced",
      defaultStartingLife: 8000,
    })

    expect(repository.loadSettings()).toMatchObject({
      defaultSystem: "ygo",
      defaultFormat: "advanced",
      defaultStartingLife: 8000,
    })
  })

  it("rejects a starting value above the no-system limit", () => {
    const storage = new MemoryStorage()
    storage.set(
      LOCAL_KEYS.settings,
      JSON.stringify({
        ...DEFAULT_LOCAL_SETTINGS,
        defaultStartingLife: 8000,
      }),
    )

    expect(new LocalGameRepository(storage).loadSettings()).toEqual(DEFAULT_LOCAL_SETTINGS)
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

  it("archives a No system game without a system so History does not file it as Magic", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const finished = applyGameCommand(
      makeGame(),
      { type: "game.finish" },
      defaultCommandContext(asDeviceId("device")),
    )
    repository.archiveGame(finished)
    expect(repository.loadHistory()[0].system).toBeUndefined()
  })

  it("repairs No system games an earlier build archived as Magic, keeping pre-No-system Magic games", () => {
    const storage = new MemoryStorage()
    const context = defaultCommandContext(asDeviceId("device"))
    const afterNoSystem = Date.parse("2026-10-01T00:00:00Z")
    const noSystem = applyGameCommand(makeGame(afterNoSystem), { type: "game.finish" }, context)
    const magic = applyGameCommand(
      { ...makeGame(afterNoSystem + 1), system: "mtg", format: "commander" },
      { type: "game.finish" },
      context,
    )
    const legacyMagic = applyGameCommand(makeGame(1), { type: "game.finish" }, context)
    for (const game of [noSystem, magic, legacyMagic])
      new LocalGameRepository(storage).archiveGame(game)
    const index = JSON.parse(storage.getString(LOCAL_KEYS.historyIndex)!)
    storage.set(
      LOCAL_KEYS.historyIndex,
      JSON.stringify(index.map((game: object) => ({ ...game, system: "mtg" }))),
    )
    storage.delete(LOCAL_KEYS.noSystemHistoryRepaired)

    const history = new LocalGameRepository(storage).loadHistory()

    expect(history.find(({ id }) => id === noSystem.id)?.system).toBeUndefined()
    expect(history.find(({ id }) => id === magic.id)?.system).toBe("mtg")
    expect(history.find(({ id }) => id === legacyMagic.id)?.system).toBe("mtg")
    expect(JSON.parse(storage.getString(LOCAL_KEYS.historyIndex)!)).toEqual(history)
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

  it("keeps games past the cap until they publish, then evicts them", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const context = defaultCommandContext(asDeviceId("device"))
    const unpublished = applyGameCommand(
      makeGame(0),
      { type: "game.finish", result: { kind: "draw" } },
      context,
    )
    repository.archiveGame(unpublished, "game_menu", "owner-a")
    for (let index = 1; index <= MAX_HISTORY_GAMES; index += 1)
      repository.archiveGame(applyGameCommand(makeGame(index), { type: "game.abandon" }, context))

    expect(repository.loadHistory()).toHaveLength(MAX_HISTORY_GAMES + 1)
    expect(repository.pendingPublishes("owner-a").map(({ id }) => id)).toEqual([unpublished.id])
    expect(repository.loadHistoryDetail(unpublished.id)).not.toBeNull()

    repository.markPublished(unpublished.id)
    expect(repository.loadHistory()).toHaveLength(MAX_HISTORY_GAMES)
    expect(repository.loadHistoryDetail(unpublished.id)).toBeNull()
  })
})

describe("LocalGameRepository account ownership", () => {
  function finished(game: ReturnType<typeof makeGame>, now: number) {
    return applyGameCommand(
      game,
      { type: "game.finish", result: { kind: "win", winnerPlayerIds: [game.players[0].id] } },
      { ...defaultCommandContext(asDeviceId("device-1")), now: () => now },
    )
  }

  it("tags a finished game with the signed-in owner as pending until the server acks", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const game = makeGame(1)
    repository.archiveGame(finished(game, 2), "game_menu", "owner-a")
    expect(repository.loadHistory()[0]).toMatchObject({
      account: { ownerId: "owner-a" },
      publish: "pending",
    })
    expect(repository.pendingPublishes("owner-a").map(({ id }) => id)).toEqual([game.id])
    expect(repository.pendingPublishes("owner-b")).toEqual([])
    repository.markPublished(game.id)
    expect(repository.loadHistory()[0].publish).toBe("published")
    expect(repository.pendingPublishes("owner-a")).toEqual([])
    expect(repository.loadHistoryDetail(game.id)?.game.account).toEqual({ ownerId: "owner-a" })
  })

  it("keeps the seat and deck claimed at setup over the account signed in at the end", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const game = createLocalGame({
      now: 1,
      startingLife: 20,
      players: [
        { name: "Ada", color: "#000" },
        { name: "Grace", color: "#111" },
      ],
      account: { ownerId: "owner-a", meSeat: 1, deckVersionId: "v1", deckName: "Atraxa" },
    })
    repository.archiveGame(finished(game, 2), "game_menu", "owner-b")
    const summary = repository.loadHistory()[0]
    expect(summary.account).toEqual({
      ownerId: "owner-a",
      mePlayerId: game.players[1].id,
      deckVersionId: "v1",
      deckName: "Atraxa",
    })
    const abandoned = applyGameCommand(
      makeGame(5),
      { type: "game.abandon" },
      { ...defaultCommandContext(asDeviceId("device-1")), now: () => 6 },
    )
    repository.archiveGame(abandoned, "game_menu", "owner-a")
    expect(repository.loadHistory()[0]).toMatchObject({ account: { ownerId: "owner-a" } })
    expect(repository.loadHistory()[0].publish).toBeUndefined()
  })

  it("lets setup change the account seat and remembers the last seat picked", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const game = makeGame(1)
    repository.saveActiveGame(game)
    repository.updateActivePlayers(
      game.id,
      game.players.map(({ name, color, shape }) => ({ name, color, shape })),
      { ownerId: "owner-a", meSeat: 0 },
    )
    expect(repository.loadActiveGame()?.account).toEqual({
      ownerId: "owner-a",
      mePlayerId: game.players[0].id,
    })
    expect(repository.loadMeSeat()).toBeUndefined()
    repository.saveMeSeat(2)
    expect(repository.loadMeSeat()).toBe(2)
    repository.saveMeSeat(undefined)
    expect(repository.loadMeSeat()).toBe("none")
  })

  it("keeps a rejected game on the device without retrying it", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const game = makeGame(1)
    repository.archiveGame(finished(game, 2), "game_menu", "owner-a")
    repository.markPublishFailed(game.id)
    expect(repository.loadHistory()[0].publish).toBe("failed")
    expect(repository.pendingPublishes("owner-a")).toEqual([])
    repository.markPublished(game.id)
    expect(repository.loadHistory()[0].publish).toBe("failed")
  })
})

describe("LocalGameRepository sign-in claims", () => {
  function finished(game: ReturnType<typeof makeGame>, now: number) {
    return applyGameCommand(
      game,
      { type: "game.finish", result: { kind: "win", winnerPlayerIds: [game.players[0].id] } },
      { ...defaultCommandContext(asDeviceId("device-1")), now: () => now },
    )
  }

  it("files claimed games under the account for upload and remembers the skipped ones", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const claimed = makeGame(1)
    const skipped = makeGame(3)
    repository.archiveGame(finished(claimed, 2))
    repository.archiveGame(finished(skipped, 4))
    const listener = jest.fn()
    repository.onGameFinished(listener)

    repository.resolveClaims("owner-a", [
      { id: claimed.id, claim: true, meSeat: 1 },
      { id: skipped.id, claim: false },
    ])

    expect(listener).toHaveBeenCalledTimes(1)
    expect(repository.pendingPublishes("owner-a").map(({ id }) => id)).toEqual([claimed.id])
    expect(repository.loadHistory()).toEqual([
      expect.objectContaining({ id: skipped.id, skippedBy: ["owner-a"] }),
      expect.objectContaining({
        id: claimed.id,
        account: { ownerId: "owner-a", mePlayerId: claimed.players[1].id },
        publish: "pending",
      }),
    ])
    expect(repository.loadHistoryDetail(claimed.id)?.game.account).toEqual({
      ownerId: "owner-a",
      mePlayerId: claimed.players[1].id,
    })
    expect(repository.loadHistoryDetail(skipped.id)?.game.account).toBeUndefined()

    repository.resolveClaims("owner-a", [{ id: skipped.id, claim: false }])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("keeps a system this build doesn't know when it writes history back", () => {
    const storage = new MemoryStorage()
    const game = makeGame(1)
    new LocalGameRepository(storage).archiveGame(finished(game, 2))
    const detailKey = LOCAL_KEYS.historyDetail(game.id)
    const [summary] = JSON.parse(storage.getString(LOCAL_KEYS.historyIndex)!)
    storage.set(LOCAL_KEYS.historyIndex, JSON.stringify([{ ...summary, system: "lorcana" }]))
    const detail = JSON.parse(storage.getString(detailKey)!)
    storage.set(
      detailKey,
      JSON.stringify({ ...detail, game: { ...detail.game, system: "lorcana" } }),
    )
    const repository = new LocalGameRepository(storage)

    repository.resolveClaims("owner-a", [{ id: game.id, claim: true }])

    expect(JSON.parse(storage.getString(LOCAL_KEYS.historyIndex)!)[0]).toMatchObject({
      system: "lorcana",
      account: { ownerId: "owner-a" },
    })
    expect(JSON.parse(storage.getString(detailKey)!).game).toMatchObject({
      system: "lorcana",
      account: { ownerId: "owner-a" },
    })
    expect(repository.loadHistoryDetail(game.id)?.game.system).toBeUndefined()
  })

  it("notifies History on skip-only decisions and repairs a detail whose write failed", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const claimed = makeGame(1)
    const skipped = makeGame(3)
    repository.archiveGame(finished(claimed, 2))
    repository.archiveGame(finished(skipped, 4))
    const historyChanged = jest.fn()
    repository.onHistoryChanged(historyChanged)

    repository.resolveClaims("owner-a", [{ id: skipped.id, claim: false }])
    expect(historyChanged).toHaveBeenCalledTimes(1)

    const set = storage.set.bind(storage)
    storage.set = (key, value) => {
      if (key.includes("history.detail")) throw new Error("disk full")
      set(key, value)
    }
    expect(() => repository.resolveClaims("owner-a", [{ id: claimed.id, claim: true }])).toThrow(
      "disk full",
    )
    expect(historyChanged).toHaveBeenCalledTimes(2)
    expect(repository.pendingPublishes("owner-a").map(({ id }) => id)).toEqual([claimed.id])
    expect(repository.loadHistoryDetail(claimed.id)?.game.account).toBeUndefined()

    storage.set = set
    repository.repairClaimedDetails("owner-a")
    expect(repository.loadHistoryDetail(claimed.id)?.game.account).toEqual({ ownerId: "owner-a" })
    repository.repairClaimedDetails("owner-a")
    expect(repository.loadHistoryDetail(claimed.id)?.game.account).toEqual({ ownerId: "owner-a" })
  })
})

describe("first-player offer on the game", () => {
  it("round-trips the chooser seat and the used mark, and ignores values that fit no seat", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const game = { ...makeGame(), firstChooserSeat: 1, firstPlayerOffered: true as const }
    repository.saveActiveGame(game)
    expect(repository.loadActiveGame()).toMatchObject({
      firstChooserSeat: 1,
      firstPlayerOffered: true,
    })

    repository.saveActiveGame({ ...makeGame(), firstChooserSeat: 9 })
    const loaded = repository.loadActiveGame()
    expect(loaded?.firstChooserSeat).toBeUndefined()
    expect(loaded?.firstPlayerOffered).toBeUndefined()
  })
})
