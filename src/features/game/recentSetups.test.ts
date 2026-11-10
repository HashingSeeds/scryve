import { createLocalGame } from "./domain"
import { LocalGameRepository } from "./localPersistence"
import {
  MAX_RECENT_SETUPS,
  parseRecentSetup,
  withRecentSetup,
  type NewRecentSetup,
} from "./recentSetups"
import { MemoryStorage } from "../../../test/support/memoryStorage"

const local = (names: string[], startingLife = 40) =>
  ({
    mode: "local",
    game: {
      players: names.map((name, index) => ({ name, color: ["#B85636", "#41476E"][index % 2] })),
      startingLife,
      system: "mtg",
      format: "commander",
    },
  }) satisfies NewRecentSetup

const treachery: NewRecentSetup = {
  mode: "connected",
  lobby: {
    playerCount: 5,
    startingLife: 40,
    ruleset: "commander",
    system: "mtg",
    format: "commander",
    variant: "treachery",
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
    expect(parseRecentSetup({ ...valid, lobby: { ...valid.lobby, deckRequired: true } })).toEqual(
      valid,
    )
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

  it("keeps Archenemy and Planechase setups through storage", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const modeSetup = { archenemy: { seat: 2 }, planechase: {} }
    const archenemy: NewRecentSetup = {
      mode: "connected",
      lobby: { ...treachery.lobby, playerCount: 4, variant: "archenemy", modeSetup },
    }
    const planechase: NewRecentSetup = {
      mode: "local",
      game: { ...local(["Ada", "Grace"]).game, modeSetup: { planechase: {} } },
    }
    repository.rememberSetup(archenemy, 1)
    repository.rememberSetup(planechase, 2)
    expect(repository.loadRecentSetups()).toEqual([
      { savedAt: 2, ...planechase },
      { savedAt: 1, ...archenemy },
    ])
    const { modeSetup: _, ...noSetup } = archenemy.lobby
    expect(parseRecentSetup({ savedAt: 1, mode: "connected", lobby: noSetup })).toBeUndefined()
    expect(
      parseRecentSetup({
        savedAt: 1,
        mode: "connected",
        lobby: { ...archenemy.lobby, modeSetup: { archenemy: { seat: 5 } } },
      }),
    ).toBeUndefined()
  })

  it("keeps a Lorcana setup that starts at 0 lore", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const lorcana: NewRecentSetup = {
      mode: "local",
      game: {
        players: [
          { name: "Ada", color: "#B85636" },
          { name: "Grace", color: "#41476E" },
        ],
        startingLife: 0,
        system: "lorcana",
        format: "core",
      },
    }
    repository.rememberSetup(lorcana, 1)
    expect(repository.loadRecentSetups()).toMatchObject([
      { mode: "local", game: { startingLife: 0 } },
    ])
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
