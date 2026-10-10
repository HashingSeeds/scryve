import { tableRules } from "./systems"
import {
  applyTableAction,
  EMPTY_TABLE,
  matchesValidator,
  pokemonBoardOf,
  pokemonCardFromCatalog,
  pokemonPrizeValue,
  tableActionValidator,
  type TableAction,
  type TableState,
} from "./table"

const commander = tableRules("mtg", "commander")
const pokemon = tableRules("pokemon", "standard")

function run(
  table: TableState,
  action: TableAction,
  options: { rules?: typeof commander; life?: Record<string, number>; operationId?: string } = {},
) {
  const life = options.life ?? { me: 6, them: 6 }
  return applyTableAction(table, action, {
    rules: options.rules ?? pokemon,
    operationId: options.operationId ?? "operation-0000000001",
    lifeOf: (playerId) => life[playerId],
  })
}

const charizard = { cardId: "sv03.5-006", name: "Charizard ex", hp: 330, prizes: 2 }
const pidgey = { name: "Pidgey", hp: 60, prizes: 1 }

function boardWith(...steps: TableAction[]) {
  return steps.reduce((table, action) => run(table, action)!.table, EMPTY_TABLE)
}

describe("table counters and designations", () => {
  it("clamps counters to the registry range and treats a capped tap as a no-op", () => {
    const tax = run(
      EMPTY_TABLE,
      { kind: "counter.changed", playerId: "me", counterId: "commanderTax", delta: 2 },
      { rules: commander },
    )!
    expect(tax.table.players.me.counters).toEqual({ commanderTax: 2 })
    const floor = run(
      EMPTY_TABLE,
      { kind: "counter.changed", playerId: "me", counterId: "poison", delta: -1 },
      { rules: commander },
    )
    expect(floor?.table).toBe(EMPTY_TABLE)
  })

  it("rejects counters the system does not have", () => {
    expect(
      run(
        EMPTY_TABLE,
        { kind: "counter.changed", playerId: "me", counterId: "commanderTax", delta: 2 },
        { rules: tableRules("mtg", "modern") },
      ),
    ).toBeNull()
  })

  it("moves a designation from its holder when another player takes it", () => {
    const taken = run(
      EMPTY_TABLE,
      { kind: "designation.taken", playerId: "me", designationId: "monarch" },
      { rules: commander },
    )!.table
    const moved = run(
      taken,
      { kind: "designation.taken", playerId: "them", designationId: "monarch" },
      { rules: commander },
    )!.table
    expect(moved.designations).toEqual({ monarch: "them" })
    const released = run(
      moved,
      { kind: "designation.released", playerId: "them", designationId: "monarch" },
      { rules: commander },
    )!.table
    expect(released.designations).toEqual({})
  })
})

describe("Pokémon board", () => {
  it("keeps damage with each Pokémon when the Active switches with the bench", () => {
    const table = boardWith(
      {
        kind: "pokemon.placed",
        playerId: "me",
        pokemonId: "active-001",
        slot: "active",
        card: charizard,
      },
      {
        kind: "pokemon.placed",
        playerId: "me",
        pokemonId: "bench-0001",
        slot: "bench",
        card: pidgey,
      },
      { kind: "pokemon.damaged", playerId: "me", pokemonId: "active-001", delta: 120 },
      { kind: "pokemon.switched", playerId: "me", pokemonId: "bench-0001" },
    )
    const board = pokemonBoardOf(table, "me")
    expect(board.active).toMatchObject({ id: "bench-0001", damage: 0 })
    expect(board.bench).toEqual([expect.objectContaining({ id: "active-001", damage: 120 })])
  })

  it("refuses an edit that lowers HP to or below the damage on the Pokémon", () => {
    const table = boardWith(
      {
        kind: "pokemon.placed",
        playerId: "me",
        pokemonId: "active-001",
        slot: "active",
        card: charizard,
      },
      { kind: "pokemon.damaged", playerId: "me", pokemonId: "active-001", delta: 120 },
    )
    const edit = (hp: number) =>
      run(table, {
        kind: "pokemon.updated",
        playerId: "me",
        pokemonId: "active-001",
        card: { ...charizard, hp },
      })
    expect(edit(100)).toBeNull()
    expect(edit(120)).toBeNull()
    expect(pokemonBoardOf(edit(130)!.table, "me").active).toMatchObject({ hp: 130, damage: 120 })
  })

  it("caps the bench at the registry size", () => {
    const full = boardWith(
      ...Array.from({ length: 5 }, (_, index): TableAction => ({
        kind: "pokemon.placed",
        playerId: "me",
        pokemonId: `bench-000${index}`,
        slot: "bench",
        card: pidgey,
      })),
    )
    expect(
      run(full, {
        kind: "pokemon.placed",
        playerId: "me",
        pokemonId: "bench-0009",
        slot: "bench",
        card: pidgey,
      }),
    ).toBeNull()
  })

  it("gives the taker prizes on a knockout and undoes exactly that knockout", () => {
    const table = boardWith(
      {
        kind: "pokemon.placed",
        playerId: "me",
        pokemonId: "active-001",
        slot: "active",
        card: charizard,
      },
      { kind: "pokemon.damaged", playerId: "me", pokemonId: "active-001", delta: 300 },
    )
    const knockout = run(
      table,
      {
        kind: "pokemon.knockedOut",
        playerId: "me",
        pokemonId: "active-001",
        takerPlayerId: "them",
      },
      { operationId: "knockout-0000000001" },
    )!
    expect(knockout.life).toEqual([{ playerId: "them", delta: -2 }])
    expect(pokemonBoardOf(knockout.table, "me").active).toBeUndefined()

    const undone = run(
      knockout.table,
      {
        kind: "pokemon.knockoutUndone",
        playerId: "me",
        knockoutOperationId: "knockout-0000000001",
      },
      { life: { me: 6, them: 4 } },
    )!
    expect(undone.life).toEqual([{ playerId: "them", delta: 2 }])
    expect(pokemonBoardOf(undone.table, "me")).toEqual({
      active: { ...charizard, id: "active-001", damage: 300 },
      bench: [],
    })
    expect(
      run(undone.table, {
        kind: "pokemon.knockoutUndone",
        playerId: "me",
        knockoutOperationId: "knockout-0000000001",
      }),
    ).toBeNull()
  })

  it("takes no more prizes than the taker has left", () => {
    const table = boardWith({
      kind: "pokemon.placed",
      playerId: "me",
      pokemonId: "active-001",
      slot: "active",
      card: charizard,
    })
    const knockout = run(
      table,
      {
        kind: "pokemon.knockedOut",
        playerId: "me",
        pokemonId: "active-001",
        takerPlayerId: "them",
      },
      { life: { me: 6, them: 1 } },
    )!
    expect(knockout.life).toEqual([{ playerId: "them", delta: -1 }])
  })

  it("rejects Pokémon actions in systems without a board", () => {
    expect(
      run(
        EMPTY_TABLE,
        {
          kind: "pokemon.placed",
          playerId: "me",
          pokemonId: "active-001",
          slot: "active",
          card: pidgey,
        },
        { rules: commander },
      ),
    ).toBeNull()
  })
})

describe("Pokémon catalog helpers", () => {
  it.each([
    ["Pidgey", 1],
    ["Radiant Charizard", 1],
    ["Charizard ex", 2],
    ["Charizard EX", 2],
    ["M Charizard EX", 2],
    ["Serperior VSTAR", 2],
    ["Pikachu V", 2],
    ["Venusaur & Snivy GX", 3],
    ["Butterfree VMAX", 3],
    ["Mewtwo V-UNION", 3],
    ["Mega Lucario ex", 3],
  ])("%s gives up %i prizes", (name, prizes) => {
    expect(pokemonPrizeValue(name)).toBe(prizes)
  })

  it("reads HP from the catalog and leaves it unset when the catalog lacks it", () => {
    expect(
      pokemonCardFromCatalog({
        cardId: "sv03.5-006",
        name: "Charizard ex",
        facets: [{ key: "hp", value: "330" }],
      }),
    ).toEqual(charizard)
    expect(
      pokemonCardFromCatalog({ cardId: "base1-1", name: "Alakazam", facets: [] }),
    ).not.toHaveProperty("hp")
  })
})

describe("table validators on the client", () => {
  it("rejects fields the server validator would reject", () => {
    const action = { kind: "counter.changed", playerId: "me", counterId: "poison", delta: 1 }
    expect(matchesValidator(tableActionValidator, action)).toBe(true)
    expect(matchesValidator(tableActionValidator, { ...action, extra: true })).toBe(false)
    expect(matchesValidator(tableActionValidator, { ...action, kind: "poison.changed" })).toBe(
      false,
    )
  })
})
