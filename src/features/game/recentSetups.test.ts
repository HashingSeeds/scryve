import { createLocalGame } from "./domain"
import { LocalGameRepository, type StringStorage } from "./localPersistence"
import {
  MAX_RECENT_SETUPS,
  parseRecentSetup,
  recentSetupLabel,
  withRecentSetup,
  type NewRecentSetup,
} from "./recentSetups"

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

const local = (names: string[], startingLife = 40): NewRecentSetup => ({
  mode: "local",
  game: {
    players: names.map((name, index) => ({ name, color: ["#B85636", "#41476E"][index % 2] })),
    startingLife,
    system: "mtg",
    format: "commander",
  },
})

const treachery: NewRecentSetup = {
  mode: "connected",
  lobby: {
    playerCount: 5,
    startingLife: 40,
    ruleset: "commander",
    system: "mtg",
    format: "commander",
    variant: "treachery",
    deckRequired: false,
    layout: "auto",
    lifeStep: 1,
  },
}

describe("recent setups", () => {
  it("keeps the newest setup of each table, up to the cap", () => {
    let setups = withRecentSetup([], local(["Ada", "Grace"]), 1)
    setups = withRecentSetup(setups, treachery, 2)
    setups = withRecentSetup(setups, local([" Ada ", "Grace"]), 3)

    expect(setups.map((setup) => setup.savedAt)).toEqual([3, 2])
    for (let life = 1; life <= MAX_RECENT_SETUPS + 2; life += 1)
      setups = withRecentSetup(setups, local(["Ada", "Grace"], life), 10 + life)
    expect(setups).toHaveLength(MAX_RECENT_SETUPS)
    expect(setups[0]).toMatchObject({ savedAt: 10 + MAX_RECENT_SETUPS + 2 })
  })

  it("drops stored setups that could not start a game", () => {
    const valid = { savedAt: 1, ...treachery }
    expect(parseRecentSetup(valid)).toEqual(valid)
    expect(parseRecentSetup({ savedAt: 1, ...local(["Solo"]) })).toBeUndefined()
    expect(parseRecentSetup({ savedAt: 1, ...local(["Ada", "Ada"]) })).toBeUndefined()
    expect(
      parseRecentSetup({ ...valid, lobby: { ...treachery.lobby, playerCount: 3 } }),
    ).toBeUndefined()
    expect(
      parseRecentSetup({ ...valid, lobby: { ...valid.lobby, format: "jumpstart" } }),
    ).toBeUndefined()
    expect(parseRecentSetup({ ...valid, mode: "lan" })).toBeUndefined()
  })

  it("replays a hero's game at the format's life, since the deck is not remembered", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const players = [
      { name: "Hero", color: "#B85636", startingLife: 38 },
      { name: "Other", color: "#41476E" },
    ]
    repository.rememberSetup({
      mode: "local",
      game: { players, startingLife: 40, system: "fab", format: "cc" },
    })
    expect(repository.loadRecentSetups()[0]).toMatchObject({
      game: { startingLife: 40, players: [{ name: "Hero" }, { name: "Other" }] },
    })
    expect(repository.loadRecentSetups()[0]).not.toHaveProperty("game.players.0.startingLife")

    repository.saveActiveGame(createLocalGame({ players, startingLife: 40, system: "fab" }))
    expect(repository.loadActiveGame()?.players.map(({ life }) => life)).toEqual([38, 40])
    expect(repository.loadActiveGame()?.players[0].startingLife).toBe(38)
  })

  it("names a setup by its game type", () => {
    expect(recentSetupLabel({ savedAt: 1, ...treachery })).toBe("Treachery")
    expect(recentSetupLabel({ savedAt: 1, ...local(["Ada", "Grace"]) })).toBe("Commander")
  })

  it("survives storage that is missing, corrupt, or partly invalid", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    expect(repository.loadRecentSetups()).toEqual([])

    storage.set("count.local.recentSetups.v1", "{not json")
    expect(repository.loadRecentSetups()).toEqual([])

    repository.rememberSetup(local(["Ada", "Grace"]), 1)
    repository.rememberSetup(treachery, 2)
    const stored = JSON.parse(storage.getString("count.local.recentSetups.v1")!) as unknown[]
    storage.set("count.local.recentSetups.v1", JSON.stringify([...stored, { savedAt: 3 }]))
    expect(repository.loadRecentSetups().map((setup) => setup.mode)).toEqual(["connected", "local"])
  })
})
