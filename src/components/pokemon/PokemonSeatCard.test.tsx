import { useSyncExternalStore } from "react"
import { AccessibilityInfo } from "react-native"
import { act, fireEvent, render, screen } from "@testing-library/react-native"

import { applyLocalTableAction, createLocalGame, localTableRules } from "@/features/game/domain"
import { createTableActions, type TableRuntime } from "@/features/game/tableRuntime"
import { ThemeProvider } from "@/theme/context"

import { PokemonSeatCard, type PokemonSeatCardProps } from "./PokemonSeatCard"
import { EMPTY_TABLE, pokemonBoardOf } from "../../../convex/lib/table"

/** why: the card is driven through the same runtime the local board uses, so what the tests press lands in a real table. */
function pokemonTable(playerNames: string[]) {
  let current = createLocalGame({
    now: 1,
    system: "pokemon",
    format: "standard",
    startingLife: 6,
    players: playerNames.map((name, index) => ({ name, color: `#${index}${index}${index}` })),
  })
  let operation = 0
  let refusing = false
  const listeners = new Set<() => void>()
  const actions = createTableActions(
    () => ({
      table: current.table ?? EMPTY_TABLE,
      rules: localTableRules(current),
      playerIds: current.players.map(({ id }) => id),
      lifeOf: (playerId) => current.players.find(({ id }) => id === playerId)?.life,
      canAct: () => true,
    }),
    (action, operationId) => {
      if (refusing) return false
      current = applyLocalTableAction(current, action, { operationId, now: 2 })
      listeners.forEach((listener) => listener())
      return true
    },
    () => `operation-${String(++operation).padStart(12, "0")}`,
  )
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
  return {
    actions,
    subscribe,
    game: () => current,
    refuse: (value: boolean) => {
      refusing = value
    },
  }
}

type Harness = ReturnType<typeof pokemonTable>

function Seat({
  harness,
  seat,
  ...props
}: { harness: Harness; seat: number } & Partial<PokemonSeatCardProps>) {
  const game = useSyncExternalStore(harness.subscribe, harness.game)
  const player = game.players[seat]
  const runtime: TableRuntime = {
    ...harness.actions,
    table: game.table ?? EMPTY_TABLE,
    tableRules: localTableRules(game),
  }
  return (
    <ThemeProvider initialContext="dark">
      <PokemonSeatCard
        playerId={player.id}
        playerName={player.name}
        seatNumber={seat + 1}
        prizes={player.life}
        color={player.color}
        opponents={game.players.filter(({ id }) => id !== player.id)}
        table={runtime}
        onChangePrizes={jest.fn()}
        {...props}
      />
    </ThemeProvider>
  )
}

function board(table: Harness, seat = 0) {
  const game = table.game()
  return pokemonBoardOf(game.table ?? EMPTY_TABLE, game.players[seat].id)
}

describe("PokemonSeatCard", () => {
  it("shows the Active's remaining HP and moves it by the damage step from the tap halves", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    table.actions.placePokemon(me, "active", { name: "Charizard ex", hp: 330, prizes: 2 })
    render(<Seat harness={table} seat={0} />)

    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("330")
    fireEvent.press(screen.getByTestId("pokemon-damage-seat-1-10"))
    fireEvent.press(screen.getByTestId("pokemon-damage-seat-1-10"))
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("310")
    expect(screen.getByText("20 damage · 330 HP")).toBeTruthy()

    fireEvent.press(screen.getByTestId("pokemon-damage-seat-1--10"))
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("320")
  })

  it("knocks out on lethal damage, scores the opponent's prizes, and Undo puts it all back", () => {
    jest.useFakeTimers()
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    const pokemonId = table.actions.placePokemon(me, "active", {
      name: "Charizard ex",
      hp: 330,
      prizes: 2,
    })!
    table.actions.adjustPokemonDamage(me, pokemonId, 320)
    render(<Seat harness={table} seat={0} />)

    fireEvent.press(screen.getByTestId("pokemon-damage-seat-1-10"))
    expect(screen.getByTestId("pokemon-knockout-message-seat-1")).toHaveTextContent(
      "Charizard ex knocked out. Grace takes 2 prizes.",
    )
    expect(table.game().players.map(({ life }) => life)).toEqual([6, 4])
    expect(board(table).active).toBeUndefined()
    expect(screen.getByText("No Active")).toBeTruthy()

    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(
      "Charizard ex knocked out. Grace takes 2 prizes.",
    )

    fireEvent.press(screen.getByTestId("pokemon-knockout-undo-seat-1"))
    expect(table.game().players.map(({ life }) => life)).toEqual([6, 6])
    expect(board(table).active).toMatchObject({ id: pokemonId, damage: 320 })
    expect(screen.queryByTestId("pokemon-knockout-toast-seat-1")).toBeNull()
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("10")
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(
      "Undo. Charizard ex returns to Active, Grace gives back 2 prizes.",
    )
    jest.useRealTimers()
  })

  it("withholds Undo when the knocked out Pokémon has nowhere to return", () => {
    jest.useFakeTimers()
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    const active = table.actions.placePokemon(me, "active", { name: "Pikachu", hp: 60, prizes: 1 })!
    const bench = Array.from({ length: 5 }, (_, index) =>
      table.actions.placePokemon(me, "bench", { name: `Bench ${index}`, hp: 60, prizes: 1 }),
    )
    table.actions.adjustPokemonDamage(me, active, 50)
    render(<Seat harness={table} seat={0} />)

    fireEvent.press(screen.getByTestId("pokemon-damage-seat-1-10"))
    expect(screen.getByTestId("pokemon-knockout-undo-seat-1")).toBeTruthy()

    act(() => void table.actions.switchActive(me, bench[0]!))
    act(() => void table.actions.placePokemon(me, "bench", { name: "Late", hp: 60, prizes: 1 }))
    expect(screen.queryByTestId("pokemon-knockout-undo-seat-1")).toBeNull()
    expect(screen.getByTestId("pokemon-knockout-no-undo-seat-1")).toBeTruthy()
    jest.useRealTimers()
  })

  it("asks before retreating into a bench Pokémon, and offers Make Active or Edit when the Active is gone", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    table.actions.placePokemon(me, "active", { name: "Charizard ex", hp: 330, prizes: 2 })
    const benched = table.actions.placePokemon(me, "bench", {
      name: "Pidgeot ex",
      hp: 280,
      prizes: 2,
    })!
    table.actions.adjustPokemonDamage(me, benched, 30)
    render(<Seat harness={table} seat={0} />)
    expect(screen.getByTestId(`pokemon-bench-hp-${benched}`)).toHaveTextContent("250")

    fireEvent.press(screen.getByTestId(`pokemon-bench-${benched}`))
    expect(board(table).active?.name).toBe("Charizard ex")
    fireEvent.press(screen.getByTestId("pokemon-switch-edit-seat-1"))
    expect(screen.getByTestId("pokemon-sheet-seat-1")).toBeTruthy()
    expect(screen.queryByTestId("pokemon-damage-seat-1-10")).toBeNull()
    fireEvent.press(screen.getByTestId("pokemon-sheet-done-seat-1"))

    fireEvent.press(screen.getByTestId(`pokemon-bench-${benched}`))
    fireEvent.press(screen.getByTestId("pokemon-switch-confirm-seat-1"))
    expect(board(table).active?.name).toBe("Pidgeot ex")
    expect(board(table).bench.map(({ name }) => name)).toEqual(["Charizard ex"])

    act(() => void table.actions.knockOut(me, benched))
    const charizard = board(table).bench[0].id
    fireEvent.press(screen.getByTestId(`pokemon-bench-${charizard}`))
    expect(screen.getByText("Make Active")).toBeTruthy()
    expect(screen.getByTestId("pokemon-switch-edit-seat-1")).toBeTruthy()
    expect(board(table).active).toBeUndefined()
    fireEvent.press(screen.getByTestId("pokemon-switch-confirm-seat-1"))
    expect(board(table).active?.name).toBe("Charizard ex")
  })

  it("asks who takes the prizes when more than one opponent could", () => {
    const table = pokemonTable(["Ada", "Grace", "Linus"])
    const [me, , linus] = table.game().players.map(({ id }) => id)
    const pokemonId = table.actions.placePokemon(me, "active", {
      name: "Pikachu",
      hp: 60,
      prizes: 1,
    })!
    table.actions.adjustPokemonDamage(me, pokemonId, 50)
    render(<Seat harness={table} seat={0} />)

    fireEvent.press(screen.getByTestId("pokemon-damage-seat-1-10"))
    expect(board(table).active).toBeDefined()
    expect(screen.getByTestId("pokemon-taker-ask-seat-1")).toBeTruthy()

    fireEvent.press(screen.getByTestId(`pokemon-taker-${linus}-seat-1`))
    expect(board(table).active).toBeUndefined()
    expect(table.game().players.map(({ life }) => life)).toEqual([6, 6, 5])
    expect(screen.getByTestId("pokemon-knockout-message-seat-1")).toHaveTextContent(
      "Pikachu knocked out. Linus takes 1 prize.",
    )
  })

  it("closes the edit sheet before asking who took the prizes", () => {
    const table = pokemonTable(["Ada", "Grace", "Linus"])
    const me = table.game().players[0].id
    table.actions.placePokemon(me, "active", { name: "Pikachu", hp: 60, prizes: 1 })
    render(<Seat harness={table} seat={0} />)

    fireEvent.press(screen.getByTestId("pokemon-edit-active-seat-1"))
    fireEvent.press(screen.getByTestId("pokemon-sheet-step-100-seat-1"))
    expect(screen.queryByTestId("pokemon-sheet-seat-1")).toBeNull()
    expect(screen.getByTestId("pokemon-taker-ask-seat-1")).toBeTruthy()
    expect(board(table).active).toBeDefined()
  })

  it("keeps the placement sheet open when the board refuses the Pokémon", () => {
    const table = pokemonTable(["Ada", "Grace"])
    render(<Seat harness={table} seat={0} />)

    fireEvent.press(screen.getByTestId("pokemon-place-active-seat-1"))
    fireEvent.changeText(screen.getByTestId("pokemon-name-input-seat-1"), "Pikachu")
    fireEvent.changeText(screen.getByTestId("pokemon-hp-input-seat-1"), "60")
    table.refuse(true)
    fireEvent.press(screen.getByTestId("pokemon-place-seat-1"))
    expect(screen.getByTestId("pokemon-sheet-seat-1")).toBeTruthy()
    expect(screen.getByText("Could not place it. Try again.")).toBeTruthy()
    expect(board(table).active).toBeUndefined()

    table.refuse(false)
    fireEvent.press(screen.getByTestId("pokemon-place-seat-1"))
    expect(screen.queryByTestId("pokemon-sheet-seat-1")).toBeNull()
    expect(board(table).active).toMatchObject({ name: "Pikachu", hp: 60 })
  })

  it("keeps a seat this device does not control read-only", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    table.actions.placePokemon(me, "active", { name: "Charizard ex", hp: 330, prizes: 2 })
    table.actions.placePokemon(me, "bench", { name: "Pidgeot ex", hp: 280, prizes: 2 })
    const onChangePrizes = jest.fn()
    render(<Seat harness={table} seat={0} ownership="unowned" onChangePrizes={onChangePrizes} />)

    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("330")
    expect(screen.queryByTestId("pokemon-damage-seat-1-10")).toBeNull()
    expect(screen.queryByTestId("pokemon-bench-add-seat-1")).toBeNull()
    fireEvent.press(screen.getByTestId("pokemon-prizes-seat-1"))
    expect(onChangePrizes).not.toHaveBeenCalled()
  })

  it("takes a prize on tap and puts one back on a long press", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const onChangePrizes = jest.fn()
    render(<Seat harness={table} seat={0} onChangePrizes={onChangePrizes} />)

    fireEvent.press(screen.getByTestId("pokemon-prizes-seat-1"))
    expect(onChangePrizes).toHaveBeenLastCalledWith(-1)
    fireEvent(screen.getByTestId("pokemon-prizes-seat-1"), "longPress")
    expect(onChangePrizes).toHaveBeenLastCalledWith(1)
    onChangePrizes.mockClear()
    fireEvent.press(screen.getByTestId("pokemon-prize-back-seat-1"))
    expect(onChangePrizes).toHaveBeenCalledWith(1)
  })
})
