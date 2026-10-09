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
      launchDestination: "play",
    })
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
