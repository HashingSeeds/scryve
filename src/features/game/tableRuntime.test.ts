import { applyLocalTableAction, createLocalGame, isPlayerOut, localTableRules } from "./domain"
import { LocalGameRepository, type StringStorage } from "./localPersistence"
import { createTableActions } from "./tableRuntime"
import type { LocalGame } from "./types"
import { EMPTY_TABLE, pokemonBoardOf } from "../../../convex/lib/table"

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

function localTable(game: LocalGame) {
  let current = game
  let operation = 0
  const actions = createTableActions(
    () => ({
      table: current.table ?? EMPTY_TABLE,
      rules: localTableRules(current),
      playerIds: current.players.map(({ id }) => id),
      lifeOf: (playerId) => current.players.find(({ id }) => id === playerId)?.life,
      canAct: () => true,
    }),
    (action, operationId) => {
      const previous = current
      current = applyLocalTableAction(current, action, { operationId, now: 2 })
      return current !== previous
    },
    () => `operation-${String(++operation).padStart(12, "0")}`,
  )
  return { actions, game: () => current }
}

function newGame(system: "pokemon" | "mtg", startingLife: number) {
  return createLocalGame({
    now: 1,
    system,
    format: system === "mtg" ? "commander" : "standard",
    startingLife,
    players: [
      { name: "Ada", color: "#000" },
      { name: "Grace", color: "#111" },
    ],
  })
}

describe("table runtime", () => {
  it("turns lethal damage into a knockout the opponent scores and the toast can undo", () => {
    const { actions, game } = localTable(newGame("pokemon", 6))
    const [me, opponent] = game().players.map(({ id }) => id)
    const pokemonId = actions.placePokemon(me, "active", {
      name: "Charizard ex",
      hp: 330,
      prizes: 2,
    })!
    actions.adjustPokemonDamage(me, pokemonId, 320)

    const knockout = actions.adjustPokemonDamage(me, pokemonId, 10)
    expect(knockout).toMatchObject({
      playerId: me,
      takerPlayerId: opponent,
      prizesTaken: 2,
      pokemon: { id: pokemonId, damage: 320 },
    })
    expect(game().players.map(({ life }) => life)).toEqual([6, 4])

    actions.undoKnockout(me, knockout!.operationId)
    expect(game().players.map(({ life }) => life)).toEqual([6, 6])
    expect(pokemonBoardOf(game().table!, me).active).toMatchObject({ damage: 320 })
  })

  it("survives a restart and counts ten poison as a loss", () => {
    const { actions, game } = localTable(newGame("mtg", 40))
    const [me] = game().players.map(({ id }) => id)
    actions.adjustCounter(me, "poison", 10)
    actions.takeDesignation(me, "monarch")

    const repository = new LocalGameRepository(new MemoryStorage())
    repository.saveActiveGame(game())
    const restored = repository.loadActiveGame()!
    expect(restored.table).toEqual(game().table)
    expect(isPlayerOut(restored, me)).toBe(true)
  })

  it("never knocks out on a damage step the reducer rejects", () => {
    const { actions, game } = localTable(newGame("pokemon", 6))
    const [me] = game().players.map(({ id }) => id)
    const pokemonId = actions.placePokemon(me, "active", { name: "Pidgey", hp: 60, prizes: 1 })!
    for (const delta of [Infinity, 1000, 60.5])
      expect(actions.adjustPokemonDamage(me, pokemonId, delta)).toBeNull()
    expect(game().players.map(({ life }) => life)).toEqual([6, 6])
    expect(pokemonBoardOf(game().table!, me).active).toMatchObject({ damage: 0 })
  })

  it("hands back no id or undo handle when the action could not be queued", () => {
    const pikachu = { id: "pikachu-0001", name: "Pikachu", hp: 60, prizes: 1, damage: 50 }
    const actions = createTableActions(
      () => ({
        table: {
          designations: {},
          players: { me: { pokemon: { active: pikachu, bench: [] } } },
        },
        rules: localTableRules({ system: "pokemon", format: "standard" }),
        playerIds: ["me", "them"],
        lifeOf: () => 6,
        canAct: () => true,
      }),
      () => false,
    )
    expect(actions.placePokemon("me", "bench", { name: "Pidgey", hp: 60, prizes: 1 })).toBeNull()
    expect(actions.adjustPokemonDamage("me", "pikachu-0001", 10)).toBeNull()
    expect(actions.knockOut("me", "pikachu-0001")).toBeNull()
  })

  it("does nothing for seats this device cannot act for", () => {
    const submit = jest.fn(() => true)
    const actions = createTableActions(
      () => ({
        table: EMPTY_TABLE,
        rules: localTableRules({ system: "mtg", format: "commander" }),
        playerIds: ["me", "them"],
        lifeOf: () => 40,
        canAct: (playerId) => playerId === "me",
      }),
      submit,
    )
    actions.adjustCounter("them", "poison", 1)
    expect(submit).not.toHaveBeenCalled()
    actions.adjustCounter("me", "poison", 1)
    expect(submit).toHaveBeenCalledTimes(1)
  })
})
