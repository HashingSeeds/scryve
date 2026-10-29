import { asActorId, canUndo, commanderDamageBetween } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"

import { buildSeededGame, seedGame } from "./gameSeed"
import { MemoryStorage } from "../../../test/support/memoryStorage"

import { runSeed } from "./index"

const repository = () => new LocalGameRepository(new MemoryStorage())

describe("game seed", () => {
  it("builds a commander board where life is final after commander damage", () => {
    const repo = repository()
    const game = buildSeededGame(
      { format: "commander", players: "5", life: "40,31,12,40,7", cmd: "2>3:9,4>3:21" },
      repo,
    )
    const [, two, three, four] = game.players
    expect(game).toMatchObject({ system: "mtg", format: "commander", startingLife: 40 })
    expect(game.players.map(({ life }) => life)).toEqual([40, 31, 12, 40, 7])
    expect(commanderDamageBetween(game, two.id, three.id)).toBe(9)
    expect(commanderDamageBetween(game, four.id, three.id)).toBe(21)
    expect(canUndo(game, asActorId(`actor_${repo.getDeviceId()}`))).toBe(true)
  })

  it("gives seats the marks it lists, Pro marks included", () => {
    const game = buildSeededGame({ players: "3", marks: "crown,eye" }, repository())
    expect(game.players.map(({ shape }) => shape)).toEqual(["crown", "eye", "square"])
    expect(() => buildSeededGame({ marks: "octagon" }, repository())).toThrow("unknown mark")
  })

  it("uses system defaults and infers the player count from life", () => {
    const game = buildSeededGame({ system: "ygo", life: "8000,2500,100" }, repository())
    expect(game).toMatchObject({ system: "ygo", startingLife: 8000, layout: "auto" })
    expect(game.players).toHaveLength(3)
  })

  it.each([
    [{ system: "hearthstone" }, /system must be one of/],
    [{ format: "vintage-cube" }, /format for mtg must be one of/],
    [{ players: "7" }, /players must be 2-6/],
    [{ players: "4", life: "40,40" }, /life lists 2 values for 4 players/],
    [{ players: "2", layout: "tabletop" }, /layout for 2 players/],
    [{ cmd: "1>2:5" }, /cmd needs system=mtg&format=commander/],
    [{ format: "commander", cmd: "1>1:5" }, /rejected by the game rules/],
    [{ format: "commander", cmd: "1>2:60,1>2:60" }, /"1>2:60" was rejected/],
    [{ format: "commander", players: "2", cmd: "1>3:5" }, /seat 3 is not in a 2 player game/],
    [{ life: "20,abc" }, /life must be a whole number/],
    [{ players: "" }, /players must be a whole number/],
    [{ start: "" }, /start must be a whole number/],
  ])("explains a bad link %j", (params, message) => {
    expect(() => buildSeededGame(params, repository())).toThrow(message)
  })

  it("replaces the active game and opens Play", () => {
    const repo = repository()
    seedGame({ players: "2" }, repo)
    const first = repo.loadActiveGame()
    expect(seedGame({ players: "6", life: "1,2,3,4,5,6" }, repo)).toEqual({
      pathname: "/",
      params: { destination: "play" },
    })
    const active = repo.loadActiveGame()
    expect(active?.id).not.toBe(first?.id)
    expect(active?.players.map(({ life }) => life)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("names the known kinds for an unknown seed", async () => {
    await expect(runSeed("deck", {})).rejects.toThrow('Unknown seed "deck". Try one of game.')
  })
})
