import { useSyncExternalStore } from "react"
import { AccessibilityInfo, Dimensions, StyleSheet } from "react-native"
import { act, fireEvent, render, screen, within } from "@testing-library/react-native"

import { applyLocalTableAction, createLocalGame, localTableRules } from "@/features/game/domain"
import { createTableActions, type TableRuntime } from "@/features/game/tableRuntime"
import { ThemeProvider } from "@/theme/context"

import { PokemonSeatCard, type PokemonSeatCardProps } from "./PokemonSeatCard"
import { EMPTY_TABLE, pokemonBoardOf } from "../../../convex/lib/table"

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
  it("keeps the bench in place when a dice chip settles on the name row", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const dice = {
      chips: [{ kind: "roll", roll: { tool: "coin", value: "Heads" } }] as const,
      onPress: jest.fn(),
      onClearChip: jest.fn(),
    }
    const { rerender } = render(<Seat harness={table} seat={0} />)
    const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 420 } } }
    fireEvent(screen.getByTestId("pokemon-card-seat-1"), "layout", layout)
    const paddingTop = () =>
      StyleSheet.flatten(screen.getByTestId("pokemon-layer-seat-1").props.style).paddingTop
    const before = paddingTop()

    rerender(<Seat harness={table} seat={0} dice={dice} />)

    expect(screen.getByTestId("dice-chip-1-coin")).toHaveTextContent("Heads")
    expect(paddingTop()).toBe(before)
    fireEvent(screen.getByTestId("pokemon-bench-add-seat-1"), "longPress")
    expect(screen.getByTestId("pokemon-sheet-seat-1")).toBeTruthy()
  })

  it("counts damage up on an Active placed with one tap, before its card is chosen", () => {
    const table = pokemonTable(["Ada", "Grace"])
    render(<Seat harness={table} seat={0} />)

    fireEvent.press(screen.getByTestId("pokemon-place-active-seat-1"))
    expect(screen.queryByTestId("pokemon-sheet-seat-1")).toBeNull()
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("0")

    fireEvent.press(screen.getByTestId("pokemon-damage-seat-1-10"))
    fireEvent.press(screen.getByTestId("pokemon-damage-seat-1-10"))
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("20")
    expect(screen.getByTestId("pokemon-unit-seat-1")).toHaveTextContent("DMG")
    expect(board(table).active).toMatchObject({ damage: 20 })

    const { id } = board(table).active!
    act(() => {
      table.actions.updatePokemon(table.game().players[0].id, id, { hp: 130, prizes: 1 })
    })
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("110")
    expect(screen.getByTestId("pokemon-unit-seat-1")).toHaveTextContent("HP")
  })

  it("picks a card on tap and counts damage on hold for a seat with a deck", () => {
    const table = pokemonTable(["Ada", "Grace"])
    render(<Seat harness={table} seat={0} deck={{ ownerId: "owner", versionId: "version" }} />)

    fireEvent(screen.getByTestId("pokemon-bench-add-seat-1"), "longPress")
    expect(screen.queryByTestId("pokemon-sheet-seat-1")).toBeNull()
    expect(board(table).bench).toHaveLength(1)

    fireEvent.press(screen.getByTestId("pokemon-bench-add-seat-1"))
    expect(screen.getByTestId("pokemon-sheet-seat-1")).toBeTruthy()
  })

  it.each([
    { rotation: 0, insets: { top: 0, bottom: 0, left: 0, right: 0 }, offset: 16 },
    { rotation: 0, insets: { top: 0, bottom: 34, left: 0, right: 0 }, offset: 34 + 8 },
    { rotation: 180, insets: { top: 59, bottom: 0, left: 0, right: 0 }, offset: 59 },
  ] as const)(
    "sits the bottom row $offset from a $rotation degree seat's bottom",
    ({ rotation, insets, offset }) => {
      const table = pokemonTable(["Ada", "Grace"])
      render(<Seat harness={table} seat={0} contentRotation={rotation} contentInsets={insets} />)
      fireEvent(screen.getByTestId("pokemon-card-seat-1"), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 422 } },
      })

      const layer = StyleSheet.flatten(screen.getByTestId("pokemon-layer-seat-1").props.style)
      const row = StyleSheet.flatten(screen.getByTestId("pokemon-bottom-row-seat-1").props.style)
      expect((layer.paddingBottom as number) + (row.marginBottom as number)).toBe(offset)
    },
  )

  it.each([
    { menuCorner: undefined, insets: undefined, left: 16, right: 16 },
    { menuCorner: "topLeft", insets: undefined, left: 44, right: 16 },
    {
      menuCorner: "topRight",
      insets: { top: 0, bottom: 0, left: 47, right: 0 },
      left: 63,
      right: 44,
    },
  ] as const)(
    "ends the bench $left and $right from the seat edges, on the mark line or past the menu",
    ({ menuCorner, insets, left, right }) => {
      const table = pokemonTable(["Ada", "Grace"])
      render(<Seat harness={table} seat={0} menuCorner={menuCorner} contentInsets={insets} />)
      fireEvent(screen.getByTestId("pokemon-card-seat-1"), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 422 } },
      })

      const layer = StyleSheet.flatten(screen.getByTestId("pokemon-layer-seat-1").props.style)
      const bench = StyleSheet.flatten(screen.getByTestId("pokemon-bench-seat-1").props.style)
      expect((layer.paddingLeft as number) + (bench.marginLeft as number)).toBe(left)
      expect((layer.paddingRight as number) + (bench.marginRight as number)).toBe(right)
    },
  )

  it("drops the bench below a menu centered on the seat's top edge", () => {
    const table = pokemonTable(["Ada", "Grace"])
    render(<Seat harness={table} seat={0} menuEdgeCenter="top" />)
    fireEvent(screen.getByTestId("pokemon-card-seat-1"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 422 } },
    })

    const layer = StyleSheet.flatten(screen.getByTestId("pokemon-layer-seat-1").props.style)
    expect(layer.paddingTop).toBe(44)
  })

  it("drops its controls from touch and screen readers while dice sit on the seat", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const onPress = jest.fn()
    render(<Seat harness={table} seat={0} dice={{ armed: "coin", onPress }} />)

    const layer = screen.getByTestId("pokemon-layer-seat-1", { includeHiddenElements: true })
    expect(layer.props.pointerEvents).toBe("none")
    expect(layer.props.accessibilityElementsHidden).toBe(true)
    fireEvent.press(screen.getByTestId("dice-seat-1"))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

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

  it("lowers HP from the − side and raises it from the + side", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    const active = table.actions.placePokemon(me, "active", {
      name: "Charizard ex",
      hp: 330,
      prizes: 2,
    })!
    table.actions.adjustPokemonDamage(me, active, 50)
    render(<Seat harness={table} seat={0} />)

    const hero = within(screen.getByTestId("pokemon-hero-seat-1"))
    fireEvent.press(hero.getByText("−"))
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("270")
    expect(hero.getByText("-10")).toBeTruthy()

    fireEvent.press(hero.getByText("+"))
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("280")
  })

  it("shrinks the running change in its glyph to fit beside the HP", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    table.actions.placePokemon(me, "active", { name: "Blastoise ex", hp: 330, prizes: 2 })
    render(<Seat harness={table} seat={0} />)
    fireEvent(screen.getByTestId("pokemon-hero-seat-1"), "layout", {
      nativeEvent: { layout: { width: 300, height: 200 } },
    })

    const hero = within(screen.getByTestId("pokemon-hero-seat-1"))
    for (let tap = 0; tap < 3; tap++)
      fireEvent.press(screen.getByTestId("pokemon-damage-seat-1-10"))
    const fontSize = (text: string) => StyleSheet.flatten(hero.getByText(text).props.style).fontSize
    expect(fontSize("-30")).toBeLessThan(fontSize("+"))
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
    expect(screen.getByText("Place Active")).toBeTruthy()

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

  it("focuses a tapped bench Pokémon on the hero, where its taps count and the Active returns after a pause", () => {
    jest.useFakeTimers()
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
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("250")
    expect(screen.getByTestId("pokemon-hero-bench-tag-seat-1")).toBeTruthy()
    expect(screen.getByTestId("pokemon-focus-drain-seat-1")).toBeTruthy()
    act(() => void jest.advanceTimersByTime(2_500))
    fireEvent.press(screen.getByTestId("pokemon-damage-seat-1-10"))
    expect(board(table).active?.damage).toBe(0)
    expect(screen.getByTestId(`pokemon-bench-hp-${benched}`)).toHaveTextContent("240")
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("240")

    act(() => void jest.advanceTimersByTime(2_500))
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("240")
    act(() => void jest.advanceTimersByTime(600))
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("330")
    expect(screen.queryByTestId("pokemon-hero-bench-tag-seat-1")).toBeNull()

    fireEvent.press(screen.getByTestId(`pokemon-bench-${benched}`))
    fireEvent(screen.getByTestId("pokemon-damage-seat-1-10"), "longPress")
    expect(screen.getByTestId("pokemon-name-input-seat-1").props.value).toBe("Pidgeot ex")
    fireEvent.press(screen.getByTestId("pokemon-sheet-done-seat-1"))

    fireEvent.press(screen.getByTestId("pokemon-switch-in-seat-1"))
    expect(board(table).active?.name).toBe("Pidgeot ex")
    expect(board(table).bench.map(({ name }) => name)).toEqual(["Charizard ex"])
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("240")
    expect(screen.queryByTestId("pokemon-hero-bench-tag-seat-1")).toBeNull()
    jest.useRealTimers()
  })

  it("makes a tapped bench Pokémon Active outright when the Active spot is empty", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    const benched = table.actions.placePokemon(me, "bench", { name: "Pikachu", hp: 60, prizes: 1 })!
    render(<Seat harness={table} seat={0} />)

    expect(screen.getByText("or tap a bench Pokémon")).toBeTruthy()
    fireEvent.press(screen.getByTestId(`pokemon-bench-${benched}`))
    expect(board(table).active?.name).toBe("Pikachu")
    expect(screen.queryByTestId("pokemon-hero-bench-tag-seat-1")).toBeNull()
  })

  it("knocks out a focused bench Pokémon from the hero and Undo returns it to the bench", () => {
    jest.useFakeTimers()
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    table.actions.placePokemon(me, "active", { name: "Charizard ex", hp: 330, prizes: 2 })
    const benched = table.actions.placePokemon(me, "bench", { name: "Pikachu", hp: 60, prizes: 1 })!
    table.actions.adjustPokemonDamage(me, benched, 50)
    render(<Seat harness={table} seat={0} />)

    fireEvent.press(screen.getByTestId(`pokemon-bench-${benched}`))
    fireEvent.press(screen.getByTestId("pokemon-damage-seat-1-10"))
    expect(screen.getByTestId("pokemon-knockout-message-seat-1")).toHaveTextContent(
      "Pikachu knocked out. Grace takes 1 prize.",
    )
    expect(board(table).bench).toEqual([])
    expect(board(table).active?.name).toBe("Charizard ex")
    expect(screen.getByTestId("pokemon-hp-seat-1")).toHaveTextContent("330")

    fireEvent.press(screen.getByTestId("pokemon-knockout-undo-seat-1"))
    expect(board(table).bench).toMatchObject([{ id: benched, damage: 50 }])
    expect(table.game().players.map(({ life }) => life)).toEqual([6, 6])
    jest.useRealTimers()
  })

  it("draws every bench spot, filled or not, with the next free one as the add target", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    const benched = table.actions.placePokemon(me, "bench", { name: "Pikachu", hp: 60, prizes: 1 })!
    render(<Seat harness={table} seat={0} />)

    expect(screen.getByTestId(`pokemon-bench-${benched}`)).toBeTruthy()
    expect(screen.getByTestId("pokemon-bench-add-seat-1")).toBeTruthy()
    expect(screen.getAllByTestId(/^pokemon-bench-slot-\d+-seat-1$/)).toHaveLength(3)
    expect(screen.getByTestId("pokemon-place-active-seat-1")).toHaveTextContent(/^Place Active/)
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

    fireEvent(screen.getByTestId("pokemon-place-active-seat-1"), "longPress")
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
    render(<Seat harness={table} seat={0} prizes={4} onChangePrizes={onChangePrizes} />)

    expect(screen.getByLabelText("Seat 1, Ada, 4 Prize cards")).toBeTruthy()
    expect(
      screen.getAllByTestId(/^pokemon-prize-pip-\d-seat-1$/, { includeHiddenElements: true }),
    ).toHaveLength(6)
    fireEvent.press(screen.getByTestId("pokemon-prizes-seat-1"))
    expect(onChangePrizes).toHaveBeenLastCalledWith(-1)
    fireEvent(screen.getByTestId("pokemon-prizes-seat-1"), "longPress")
    expect(onChangePrizes).toHaveBeenLastCalledWith(1)
    expect(screen.queryByText("+1")).toBeNull()
  })

  it("stands the prize cards in rows of two", () => {
    render(<Seat harness={pokemonTable(["Ada", "Grace"])} seat={0} prizes={6} />)
    const pips = screen.getAllByTestId(/^pokemon-prize-pip-\d-seat-1$/, {
      includeHiddenElements: true,
    })
    const rowOf = (pip: (typeof pips)[number]) => {
      let node = pip.parent
      while (node && typeof node.type !== "string") node = node.parent
      return node
    }
    const rows = [...new Set(pips.map(rowOf))]

    expect(rows.map((row) => pips.filter((pip) => rowOf(pip) === row).length)).toEqual([2, 2, 2])
  })

  it("raises a full-width top seat's bottom row until its name meets the cutout", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const row = () => {
      const layer = StyleSheet.flatten(screen.getByTestId("pokemon-layer-seat-1").props.style)
      const style = StyleSheet.flatten(screen.getByTestId("pokemon-bottom-row-seat-1").props.style)
      const fromEdge = Number(layer.paddingBottom) + Number(style.marginBottom)
      return { fromEdge, middle: fromEdge + Number(style.height) / 2 }
    }
    const top = {
      contentRotation: 180,
      contentInsets: { top: 47, right: 0, bottom: 0, left: 0 },
    } as const
    const view = render(<Seat harness={table} seat={0} {...top} />)
    expect(row().fromEdge).toBe(47)

    view.rerender(
      <Seat
        harness={table}
        seat={0}
        {...top}
        screenEdges={{ top: true, right: true, bottom: false, left: true }}
      />,
    )
    const nameLine = 26 * Math.min(Dimensions.get("window").fontScale, 1.3)
    expect(row().middle).toBe(47 - 11 + nameLine / 2)

    view.rerender(
      <Seat
        harness={table}
        seat={0}
        {...top}
        staleSince={0}
        screenEdges={{ top: true, right: true, bottom: false, left: true }}
      />,
    )
    expect(row().fromEdge).toBe(47)

    const dice = {
      chips: [{ kind: "roll", roll: { tool: "coin", value: "Heads" } }] as const,
      onPress: jest.fn(),
      onClearChip: jest.fn(),
    }
    view.rerender(
      <Seat
        harness={table}
        seat={0}
        {...top}
        dice={dice}
        screenEdges={{ top: true, right: true, bottom: false, left: true }}
      />,
    )
    expect(row().fromEdge).toBe(47)
  })

  it("stops taking prizes at 0 and putting them back at 6", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const onChangePrizes = jest.fn()
    const view = render(
      <Seat harness={table} seat={0} prizes={0} onChangePrizes={onChangePrizes} />,
    )
    fireEvent.press(screen.getByTestId("pokemon-prizes-seat-1"))
    view.rerender(<Seat harness={table} seat={0} prizes={6} onChangePrizes={onChangePrizes} />)
    fireEvent(screen.getByTestId("pokemon-prizes-seat-1"), "longPress")
    expect(onChangePrizes).not.toHaveBeenCalled()
  })

  it("keeps a bench Pokémon focused while a press on the hero crosses the deadline", () => {
    jest.useFakeTimers()
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    table.actions.placePokemon(me, "active", { name: "Charizard ex", hp: 330, prizes: 2 })
    const benched = table.actions.placePokemon(me, "bench", { name: "Pikachu", hp: 60, prizes: 1 })!
    render(<Seat harness={table} seat={0} />)

    fireEvent.press(screen.getByTestId(`pokemon-bench-${benched}`))
    act(() => void jest.advanceTimersByTime(2_800))
    fireEvent(screen.getByTestId("pokemon-damage-seat-1-10"), "pressIn")
    act(() => void jest.advanceTimersByTime(1_000))
    expect(screen.getByTestId("pokemon-hero-bench-tag-seat-1")).toBeTruthy()
    fireEvent.press(screen.getByTestId("pokemon-damage-seat-1-10"))
    fireEvent(screen.getByTestId("pokemon-damage-seat-1-10"), "pressOut")
    expect(board(table).bench[0].damage).toBe(10)
    expect(board(table).active?.damage).toBe(0)
    jest.useRealTimers()
  })

  it("lets the focus run out after a long press opens and closes the editor", () => {
    jest.useFakeTimers()
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    table.actions.placePokemon(me, "active", { name: "Charizard ex", hp: 330, prizes: 2 })
    const benched = table.actions.placePokemon(me, "bench", { name: "Pikachu", hp: 60, prizes: 1 })!
    render(<Seat harness={table} seat={0} />)

    fireEvent.press(screen.getByTestId(`pokemon-bench-${benched}`))
    fireEvent(screen.getByTestId("pokemon-damage-seat-1-10"), "pressIn")
    fireEvent(screen.getByTestId("pokemon-damage-seat-1-10"), "longPress")
    fireEvent.press(screen.getByTestId("pokemon-sheet-done-seat-1"))
    act(() => void jest.advanceTimersByTime(3_100))
    expect(screen.queryByTestId("pokemon-hero-bench-tag-seat-1")).toBeNull()
    jest.useRealTimers()
  })

  it("puts a prize back from a screen reader action or the keyboard", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const onChangePrizes = jest.fn()
    render(<Seat harness={table} seat={0} prizes={4} onChangePrizes={onChangePrizes} />)
    const prizes = screen.getByTestId("pokemon-prizes-seat-1")

    fireEvent(prizes, "accessibilityAction", { nativeEvent: { actionName: "longpress" } })
    fireEvent(prizes, "keyDown", { key: "ArrowUp" })
    expect(onChangePrizes.mock.calls).toEqual([[1], [1]])
  })

  it("ignores prize shortcuts on a seat this device does not control", () => {
    const table = pokemonTable(["Ada", "Grace"])
    const onChangePrizes = jest.fn()
    render(
      <Seat
        harness={table}
        seat={0}
        prizes={4}
        ownership="unowned"
        onChangePrizes={onChangePrizes}
      />,
    )
    fireEvent(screen.getByTestId("pokemon-prizes-seat-1"), "keyDown", { key: "ArrowUp" })
    expect(onChangePrizes).not.toHaveBeenCalled()
  })

  it("keeps a bench Pokémon focused when its chip is tapped again", () => {
    jest.useFakeTimers()
    const table = pokemonTable(["Ada", "Grace"])
    const me = table.game().players[0].id
    table.actions.placePokemon(me, "active", { name: "Charizard ex", hp: 330, prizes: 2 })
    const benched = table.actions.placePokemon(me, "bench", { name: "Pikachu", hp: 60, prizes: 1 })!
    render(<Seat harness={table} seat={0} />)

    fireEvent.press(screen.getByTestId(`pokemon-bench-${benched}`))
    act(() => void jest.advanceTimersByTime(2_000))
    fireEvent.press(screen.getByTestId(`pokemon-bench-${benched}`))
    act(() => void jest.advanceTimersByTime(2_000))
    fireEvent.press(screen.getByTestId("pokemon-damage-seat-1-10"))
    expect(board(table).bench[0].damage).toBe(10)
    expect(board(table).active?.damage).toBe(0)
    jest.useRealTimers()
  })
})
