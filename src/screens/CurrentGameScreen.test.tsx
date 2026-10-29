import { useEffect, useId } from "react"
import { Alert, StyleSheet } from "react-native"
import * as Haptics from "expo-haptics"
import { useKeepAwake } from "expo-keep-awake"
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native"

import { applyLocalTableAction, commanderDamageKey, createLocalGame } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { prefetchRules } from "@/features/rules/rulesSource"
import { ThemeProvider } from "@/theme/context"

import { CurrentGameScreen } from "./CurrentGameScreen"
import { MemoryStorage } from "../../test/support/memoryStorage"

jest.mock("@/features/rules/rulesSource", () => ({ prefetchRules: jest.fn() }))

jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}))

function game(playerCount = 2, system?: "pokemon") {
  return createLocalGame({
    players: Array.from({ length: playerCount }, (_, index) => ({
      name: ["Ada", "Grace", "Katherine", "Dorothy", "Evelyn", "Mary"][index],
      color: ["#41476E", "#39755C", "#7B5A91", "#A06A2B", "#B03A58", "#C76542"][index],
    })),
    startingLife: system === "pokemon" ? 6 : 2,
    system,
    now: 1,
  })
}

function renderGame(
  initialGame = game(),
  repository = new LocalGameRepository(new MemoryStorage()),
) {
  return render(
    <ThemeProvider initialContext="light">
      <CurrentGameScreen
        initialGame={initialGame}
        repository={repository}
        onViewSummary={jest.fn()}
      />
    </ThemeProvider>,
  )
}

function layoutSeats(view: ReturnType<typeof render>, prefix = "life-card-seat") {
  for (const card of view.queryAllByTestId(new RegExp(`^${prefix}-\\d+$`)))
    fireEvent(card, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 400 } } })
}

describe("CurrentGameScreen", () => {
  beforeEach(() => jest.mocked(Haptics.impactAsync).mockClear())
  afterEach(() => jest.restoreAllMocks())

  it("renders changes immediately and allows negative life", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen initialGame={game()} repository={repository} onViewSummary={jest.fn()} />
      </ThemeProvider>,
    )
    fireEvent(view.getByTestId("life-seat-1--1"), "longPress")
    fireEvent.press(view.getByTestId("life-editor-step-1--5"))
    fireEvent.press(view.getByTestId("life-editor-close-seat-1"))
    expect(view.getByTestId("life-total-seat-1").props.children).toBe("-3")
    expect(useKeepAwake).toHaveBeenCalledWith(undefined, {
      suppressDeactivateWarnings: true,
    })
  })

  it("stays awake while another board is still mounted", () => {
    const awake = new Set<string>()
    jest.mocked(useKeepAwake).mockImplementation(function useExpoKeepAwake(tag) {
      const id = useId()
      const held = tag ?? id
      useEffect(() => {
        awake.add(held)
        return () => void awake.delete(held)
      }, [held])
    })

    renderGame()
    renderGame().unmount()

    expect(awake.size).toBe(1)
  })

  it.each(["commander", "standard"])("applies one navigation bottom inset in %s", (format) => {
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={createLocalGame({
            players: [
              { name: "Ada", color: "#41476E" },
              { name: "Grace", color: "#39755C" },
            ],
            startingLife: 40,
            system: "mtg",
            format,
            now: 1,
          })}
          repository={new LocalGameRepository(new MemoryStorage())}
          onDecks={jest.fn()}
          onHistory={jest.fn()}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
          onAccount={jest.fn()}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("game-menu-button"))
    const navigation = StyleSheet.flatten(view.getByTestId("floating-app-navigation").props.style)
    expect((navigation.bottom ?? 0) + (navigation.marginBottom ?? 0)).toBe(34)
  })

  it("keeps playing if haptics fail", () => {
    jest.mocked(Haptics.impactAsync).mockRejectedValueOnce(new Error("unavailable"))
    const repository = new LocalGameRepository(new MemoryStorage())
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen initialGame={game()} repository={repository} onViewSummary={jest.fn()} />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("life-seat-1-1"))
    expect(view.getByTestId("life-total-seat-1").props.children).toBe("3")
  })

  it("suppresses haptics until the system motion preference is known", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen initialGame={game()} repository={repository} onViewSummary={jest.fn()} />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("life-seat-1-1"))
    expect(Haptics.impactAsync).not.toHaveBeenCalled()
  })

  it("keeps the radial geometry and reveals the new actions and corner navigation", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={game()}
          repository={new LocalGameRepository(new MemoryStorage())}
          onDecks={jest.fn()}
          onHistory={jest.fn()}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
          onAccount={jest.fn()}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.getByTestId("game-menu-button")).toBeTruthy()
    expect(view.getByTestId("player-name-seat-2")).toHaveTextContent("Grace")
    expect(view.getByTestId("player-mark-seat-2", { includeHiddenElements: true })).toBeTruthy()
    expect(view.queryByTestId("dice-bag")).toBeNull()

    fireEvent.press(view.getByTestId("game-menu-button"))

    expect(view.getByTestId("game-menu-backdrop")).toBeTruthy()
    expect(view.getByTestId("layout-button").props.accessibilityState.disabled).toBe(false)
    expect(view.getByTestId("dice-bag")).toBeTruthy()
    expect(view.getByTestId("setup-button")).toBeTruthy()
    expect(view.getByTestId("decks-button")).toBeTruthy()
    expect(view.getByTestId("end-game-button")).toBeTruthy()
    expect(view.getByTestId("utility-menu-button")).toBeTruthy()
  })

  it("puts Magic rules in the game menu, moving Decks to More", () => {
    jest.mocked(prefetchRules).mockClear()
    const onRules = jest.fn()
    const onDecks = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={createLocalGame({
            players: [
              { name: "Ada", color: "#41476E" },
              { name: "Grace", color: "#39755C" },
            ],
            startingLife: 20,
            system: "mtg",
            now: 1,
          })}
          repository={new LocalGameRepository(new MemoryStorage())}
          onDecks={onDecks}
          onHistory={jest.fn()}
          onRules={onRules}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
          onAccount={jest.fn()}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(prefetchRules).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByTestId("game-menu-button"))
    expect(view.queryByTestId("decks-button")).toBeNull()
    fireEvent.press(view.getByTestId("rules-button"))
    expect(onRules).toHaveBeenCalledTimes(1)

    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("utility-menu-button"))
    fireEvent.press(view.getByTestId("utility-decks-button"))
    expect(onDecks).toHaveBeenCalledTimes(1)
  })

  it("opens the dice bag over the menu, which its pentagon returns to", () => {
    const view = renderGame()
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("dice-bag"))

    expect(view.queryByTestId("layout-button")).toBeNull()
    expect(view.getByTestId("dice-bag-d12")).toBeTruthy()
    expect(view.getByTestId("game-menu-button").props.accessibilityLabel).toBe("Close dice bag")

    fireEvent.press(view.getByTestId("game-menu-button"))
    expect(view.queryByTestId("dice-bag-d12")).toBeNull()
    expect(view.getByTestId("layout-button")).toBeTruthy()
  })

  it("enters dice mode from the dice bag and closes it from the pentagon", () => {
    const view = renderGame()
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("dice-bag"))
    fireEvent.press(view.getByTestId("dice-bag-coin"))

    expect(view.queryByTestId("game-menu-backdrop")).toBeNull()
    expect(view.queryByTestId("layout-button")).toBeNull()
    expect(view.queryByTestId("dice-bag")).toBeNull()
    expect(view.getByTestId("game-menu-held-tool")).toBeTruthy()
    expect(view.getByTestId("dice-seat-1").props.accessibilityLabel).toBe("Flip a coin for Ada")
    expect(view.getByTestId("game-menu-button").props.accessibilityLabel).toBe("Close dice")

    fireEvent.press(view.getByTestId("game-menu-button"))
    expect(view.queryByTestId("game-menu-held-tool")).toBeNull()
    expect(view.queryByTestId("dice-seat-1")).toBeNull()
    expect(view.getByTestId("game-menu-button").props.accessibilityLabel).toBe("Game options")
  })

  it("arms a die from the menu, rolls it once for the tapped seat, and leaves a chip", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderGame()
    layoutSeats(view)
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("dice-d20"))

    expect(view.getByTestId("game-menu-held-tool")).toBeTruthy()
    fireEvent.press(view.getByTestId("dice-seat-1"))
    expect(view.getByTestId("dice-chip-1-d20")).toHaveTextContent("11")
    expect(view.queryByTestId("game-menu-held-tool")).toBeNull()
    expect(view.queryByTestId("dice-seat-2")).toBeNull()
    expect(view.getByTestId("life-seat-1-1")).toBeTruthy()
    expect(view.getByTestId("dice-chip-1-d20")).toHaveTextContent("11")
  })

  it("offers the first-player roll only while the game is fresh, and its chip leaves on the first life change", () => {
    const rolls = [0.9, 0.1]
    jest.spyOn(Math, "random").mockImplementation(() => rolls.shift() ?? 0)
    const initial = game()
    const repository = new LocalGameRepository(new MemoryStorage())
    const view = renderGame(initial, repository)
    layoutSeats(view)
    expect(view.getByTestId("first-player-tab").props.accessibilityLabel).toBe(
      "Roll for who goes first",
    )
    fireEvent.press(view.getByTestId("game-menu-button"))
    expect(view.queryByTestId("first-player-tab")).toBeNull()
    fireEvent.press(view.getByTestId("game-menu-button"))

    fireEvent.press(view.getByTestId("first-player-tab"))
    expect(view.queryByTestId("first-player-tab")).toBeNull()
    expect(view.getByTestId("dice-chip-1-first")).toHaveTextContent("1st")
    expect(repository.loadActiveGame()?.firstPlayerId).toBe(initial.players[0].id)
    expect(view.queryByTestId("dice-chip-2-first")).toBeNull()

    fireEvent.press(view.getByTestId("life-seat-2-1"))
    expect(repository.loadActiveGame()?.firstPlayerId).toBe(initial.players[0].id)
    expect(view.queryByTestId("dice-chip-1-first")).toBeNull()
    expect(view.queryByTestId("first-player-tab")).toBeNull()

    const inProgress = renderGame({
      ...game(),
      players: game().players.map((p, i) => ({ ...p, life: i ? 2 : 1 })),
    })
    expect(inProgress.queryByTestId("first-player-tab")).toBeNull()
  })

  it("keeps the first-player offer through Pokémon setup and withdraws it at the first point of play", () => {
    const context = { operationId: "op-1", now: 2 }
    const mtg = createLocalGame({
      players: [
        { name: "Ada", color: "#41476E" },
        { name: "Grace", color: "#39755C" },
      ],
      startingLife: 20,
      system: "mtg",
      now: 1,
    })
    const withPoison = applyLocalTableAction(
      mtg,
      { kind: "counter.changed", playerId: mtg.players[0].id, counterId: "poison", delta: 1 },
      context,
    )
    expect(withPoison).not.toBe(mtg)
    expect(renderGame(withPoison).queryByTestId("first-player-tab")).toBeNull()

    const pokemon = game(2, "pokemon")
    const placed = applyLocalTableAction(
      pokemon,
      {
        kind: "pokemon.placed",
        playerId: pokemon.players[0].id,
        pokemonId: "pokemon_1",
        slot: "active",
        card: { name: "Pikachu", hp: 60, prizes: 1 },
      },
      context,
    )
    expect(placed).not.toBe(pokemon)
    const view = renderGame(placed)
    expect(view.getByTestId("first-player-tab")).toBeTruthy()
    fireEvent.press(view.getByTestId("pokemon-damage-seat-1-10"))
    expect(view.queryByTestId("first-player-tab")).toBeNull()
    fireEvent.press(view.getByTestId("pokemon-damage-seat-1--10"))
    expect(view.queryByTestId("first-player-tab")).toBeNull()
  })

  it("remembers a used offer and a rematch's loser across a reopen", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.saveActiveGame(game())
    const rolls = [0.9, 0.1]
    jest.spyOn(Math, "random").mockImplementation(() => rolls.shift() ?? 0)
    const first = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={repository.loadActiveGame()!}
          repository={repository}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent.press(first.getByTestId("first-player-tab"))
    first.unmount()

    const reopened = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={repository.loadActiveGame()!}
          repository={repository}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(reopened.queryByTestId("first-player-tab")).toBeNull()
    fireEvent.press(reopened.getByTestId("life-seat-1-1"))
    fireEvent.press(reopened.getByTestId("game-menu-button"))
    fireEvent.press(reopened.getByTestId("end-game-button"))
    fireEvent.press(reopened.getByTestId("end-game-winner-0"))
    fireEvent.press(reopened.getByTestId("confirm-end-game-button"))
    reopened.unmount()

    const rematch = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={repository.loadActiveGame()!}
          repository={repository}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(rematch.getByTestId("first-player-tab").props.accessibilityLabel).toBe(
      "Grace lost the last game. Choose who goes first",
    )
  })

  it("lets a seat claim first from its empty 1st, which closes the offer everywhere", () => {
    const initial = game()
    const repository = new LocalGameRepository(new MemoryStorage())
    const view = renderGame(initial, repository)
    layoutSeats(view)
    expect(view.getByTestId("dice-chip-1-claim").props.accessibilityLabel).toBe(
      "Mark Ada as going first",
    )

    fireEvent.press(view.getByTestId("dice-chip-2-claim"))
    expect(view.getByTestId("dice-chip-2-first")).toHaveTextContent("1st")
    expect(view.queryByTestId("dice-chip-1-claim")).toBeNull()
    expect(view.queryByTestId("first-player-tab")).toBeNull()
    expect(repository.loadActiveGame()?.firstPlayerId).toBe(initial.players[1].id)
  })

  it("forgets who went first when the result is cleared before play", () => {
    const rolls = [0.9, 0.1]
    jest.spyOn(Math, "random").mockImplementation(() => rolls.shift() ?? 0)
    const initial = game()
    const repository = new LocalGameRepository(new MemoryStorage())
    const view = renderGame(initial, repository)
    layoutSeats(view)
    fireEvent.press(view.getByTestId("first-player-tab"))
    expect(repository.loadActiveGame()?.firstPlayerId).toBe(initial.players[0].id)
    fireEvent.press(view.getByTestId("dice-chip-1-first"))
    expect(repository.loadActiveGame()?.firstPlayerId).toBeUndefined()
  })

  it("flips a coin for Pokémon and lets the winner choose first or second", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const initial = game(2, "pokemon")
    const repository = new LocalGameRepository(new MemoryStorage())
    const view = renderGame(initial, repository)
    layoutSeats(view, "pokemon-card-seat")
    expect(view.getByTestId("first-player-tab").props.accessibilityLabel).toBe(
      "Flip for who goes first",
    )

    fireEvent.press(view.getByTestId("first-player-tab"))
    expect(view.getByTestId("dice-seat-2")).toHaveTextContent(/^Won the flip/)
    expect(view.getByTestId("dice-seat-1").props.accessibilityLabel).toBe("Waiting for the choice")

    expect(repository.loadActiveGame()?.firstPlayerId).toBeUndefined()
    fireEvent.press(view.getByTestId("dice-go-second"))
    expect(repository.loadActiveGame()?.firstPlayerId).toBe(initial.players[0].id)
    expect(view.getByTestId("dice-chip-1-first")).toHaveTextContent("1st")
    expect(view.queryByTestId("dice-seat-2")).toBeNull()
  })

  it("rolls off for first when Pokémon has more than two players", () => {
    const view = renderGame(game(3, "pokemon"))
    layoutSeats(view, "pokemon-card-seat")
    expect(view.getByTestId("first-player-tab").props.accessibilityLabel).toBe(
      "Roll for who goes first",
    )
  })

  it("hands a rematch's first choice to the player who lost", () => {
    const view = renderGame()
    fireEvent.press(view.getByTestId("life-seat-1-1"))
    expect(view.queryByTestId("first-player-tab")).toBeNull()
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    fireEvent.press(view.getByTestId("end-game-winner-0"))
    fireEvent.press(view.getByTestId("confirm-end-game-button"))
    layoutSeats(view)

    const badge = view.getByTestId("first-player-tab")
    expect(badge.props.accessibilityLabel).toBe("Grace lost the last game. Choose who goes first")

    fireEvent.press(badge)
    expect(view.getByTestId("dice-seat-2")).toHaveTextContent(/^Lost the last game/)
    fireEvent.press(view.getByTestId("dice-go-first"))
    expect(view.getByTestId("dice-chip-2-first")).toHaveTextContent("1st")
  })

  it("offers Connect instead of End on a fresh board", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          fresh
          initialGame={game()}
          repository={new LocalGameRepository(new MemoryStorage())}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("game-menu-button"))
    expect(view.getByTestId("setup-button")).toHaveTextContent("Game")
    expect(view.getByTestId("connect-button")).toBeTruthy()
    expect(view.queryByTestId("end-game-button")).toBeNull()

    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("life-seat-1-1"))
    fireEvent.press(view.getByTestId("game-menu-button"))
    expect(view.getByTestId("setup-button")).toHaveTextContent("Game")
    expect(view.getByTestId("end-game-button")).toBeTruthy()
    expect(view.queryByTestId("connect-button")).toBeNull()
  })

  it("moves the menu to a shared four-card junction", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={game(6)}
          repository={new LocalGameRepository(new MemoryStorage())}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )

    const menuStyle = StyleSheet.flatten(view.getByTestId("game-menu-anchor").props.style)
    expect(menuStyle).toMatchObject({ left: "50%", top: `${(2 / 3) * 100}%` })
    expect(menuStyle.right).toBeUndefined()
    expect(view.getByTestId("player-grid-row-2")).toBeTruthy()

    fireEvent.press(view.getByTestId("game-menu-button"))
    expect(view.getByTestId("layout-button").props.accessibilityState.disabled).toBe(false)
    fireEvent.press(view.getByTestId("layout-button"))
    expect(view.getByTestId("layout-tabletop")).toBeTruthy()
  })

  it("scrolls the layout choices and seat map while Done stays reachable", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={game(5)}
          repository={new LocalGameRepository(new MemoryStorage())}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("layout-button"))
    const scroll = within(view.getByTestId("layout-picker-scroll"))
    expect(scroll.getByTestId("seat-arrangement")).toBeTruthy()
    expect(scroll.queryByText("Done")).toBeNull()
    expect(within(view.getByTestId("layout-picker-dialog")).getByText("Done")).toBeTruthy()
  })

  it("changes and persists the four-player layout from the radial menu", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={game(4)}
          repository={repository}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("game-menu-button"))
    expect(view.getByTestId("layout-button")).toBeEnabled()
    fireEvent.press(view.getByTestId("layout-button"))
    fireEvent.press(view.getByTestId("layout-tabletop"))

    expect(view.getByTestId("player-grid-row-2")).toBeTruthy()
    await waitFor(() => expect(repository.loadActiveGame()?.layout).toBe("tabletop"))
  })

  it("starts a rematch for the same table when a game ends", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = game()
    repository.saveActiveGame(initial)
    const onViewSummary = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={initial}
          repository={repository}
          onViewSummary={onViewSummary}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("life-seat-1-1"))
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    fireEvent.press(view.getByTestId("end-game-winner-0"))
    fireEvent.press(view.getByTestId("confirm-end-game-button"))

    expect(repository.loadHistory().map(({ id }) => id)).toEqual([initial.id])
    const rematch = repository.loadActiveGame()
    expect(rematch?.id).not.toBe(initial.id)
    expect(rematch?.players.map(({ name, color }) => [name, color])).toEqual(
      initial.players.map(({ name, color }) => [name, color]),
    )
    expect(view.getByTestId("player-name-seat-1")).toHaveTextContent("Ada")
    expect(view.getByTestId("life-total-seat-1").props.children).toBe("2")
    fireEvent.press(view.getByTestId("game-menu-button"))
    expect(view.getByTestId("connect-button")).toBeTruthy()
    fireEvent.press(view.getByTestId("game-menu-button"))

    fireEvent.press(view.getByTestId("game-saved-summary-button"))
    expect(onViewSummary).toHaveBeenCalledWith(initial.id)
    expect(view.queryByTestId("game-saved-toast")).toBeNull()
  })

  it("gives each saved game its own Summary toast timer", () => {
    jest.useFakeTimers()
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = game()
    repository.saveActiveGame(initial)
    const onViewSummary = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={initial}
          repository={repository}
          onViewSummary={onViewSummary}
        />
      </ThemeProvider>,
    )
    const endGame = () => {
      fireEvent.press(view.getByTestId("life-seat-1-1"))
      fireEvent.press(view.getByTestId("game-menu-button"))
      fireEvent.press(view.getByTestId("end-game-button"))
      fireEvent.press(view.getByTestId("end-game-winner-0"))
      fireEvent.press(view.getByTestId("confirm-end-game-button"))
    }

    endGame()
    act(() => jest.advanceTimersByTime(4_000))
    const second = repository.loadActiveGame()
    endGame()
    act(() => jest.advanceTimersByTime(4_000))

    fireEvent.press(view.getByTestId("game-saved-summary-button"))
    expect(onViewSummary).toHaveBeenCalledWith(second?.id)
    jest.useRealTimers()
  })

  it("starts the rematch in memory and says once that it can't be saved", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const initial = game()
    repository.saveActiveGame(initial)
    const save = repository.saveActiveGame.bind(repository)
    jest.spyOn(repository, "saveActiveGame").mockImplementation((next) => {
      if (next.id !== initial.id) throw new Error("Storage is full")
      save(next)
    })
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={initial}
          repository={repository}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("life-seat-1-1"))
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    fireEvent.press(view.getByTestId("end-game-winner-0"))
    fireEvent.press(view.getByTestId("confirm-end-game-button"))

    expect(view.queryByTestId("end-game-dialog")).toBeNull()
    expect(repository.loadHistory()).toHaveLength(1)
    expect(alert).toHaveBeenCalledTimes(1)
    alert.mockRestore()
  })

  it("discards an abandoned game without adding it to history", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = game()
    repository.saveActiveGame(initial)
    const onGameAbandoned = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={initial}
          repository={repository}
          onViewSummary={jest.fn()}
          onGameAbandoned={onGameAbandoned}
        />
      </ThemeProvider>,
    )
    expect(view.queryByTestId("end-game-button")).toBeNull()
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    expect(view.getByTestId("game-board")).toBeTruthy()
    expect(view.queryByTestId("layout-picker-dialog")).toBeNull()
    expect(view.getByTestId("end-game-dialog")).toBeTruthy()
    fireEvent.press(view.getByTestId("abandon-game-button"))
    await waitFor(() => {
      expect(onGameAbandoned).toHaveBeenCalledTimes(1)
      expect(repository.loadActiveGame()).toBeNull()
      expect(repository.loadHistory()).toEqual([])
    })
  })

  it("keeps Abandon separate and enables End only after choosing a result", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = game()
    repository.saveActiveGame(initial)
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={initial}
          repository={repository}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))

    expect(view.getByTestId("abandon-game-button")).toBeTruthy()
    expect(view.getByTestId("confirm-end-game-button").props.accessibilityState.disabled).toBe(true)

    fireEvent.press(view.getByTestId("end-game-winner-1"))
    expect(view.getByTestId("confirm-end-game-button").props.accessibilityState.disabled).toBe(
      false,
    )

    fireEvent.press(view.getByTestId("end-game-winner-1"))
    expect(view.getByTestId("confirm-end-game-button").props.accessibilityState.disabled).toBe(true)

    fireEvent.press(view.getByTestId("end-game-result-draw"))
    expect(view.getByTestId("confirm-end-game-button").props.accessibilityState.disabled).toBe(
      false,
    )

    fireEvent.press(view.getByTestId("end-game-result-draw"))
    expect(view.getByTestId("confirm-end-game-button").props.accessibilityState.disabled).toBe(true)
    fireEvent.press(view.getByTestId("confirm-end-game-button"))
    expect(repository.loadHistory()).toEqual([])
  })

  it("records the winner the host picks before ending the game", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = game()
    repository.saveActiveGame(initial)
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={initial}
          repository={repository}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    fireEvent.press(view.getByTestId("end-game-winner-1"))
    expect(view.getByLabelText("Grace, 2 life, winner")).toBeTruthy()
    expect(view.getByLabelText("Ada, 2 life")).toBeTruthy()
    expect(view.getByTestId("end-game-winner-1").props.accessibilityState.selected).toBe(true)
    expect(view.getByTestId("end-game-winner-0").props.accessibilityState.selected).toBe(false)
    fireEvent.press(view.getByTestId("confirm-end-game-button"))

    await waitFor(() => {
      expect(repository.loadHistory()[0].result).toEqual({
        kind: "win",
        winnerPlayerIds: [initial.players[1].id],
      })
    })
  })

  it("records a draw and drops any picked winner", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = game()
    repository.saveActiveGame(initial)
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={initial}
          repository={repository}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    fireEvent.press(view.getByTestId("end-game-winner-0"))
    fireEvent.press(view.getByTestId("end-game-result-draw"))
    expect(view.getByTestId("end-game-winner-0").props.accessibilityState.selected).toBe(false)
    fireEvent.press(view.getByTestId("confirm-end-game-button"))

    await waitFor(() => {
      expect(repository.loadHistory()[0].result).toEqual({ kind: "draw" })
    })
  })
  describe("commander damage", () => {
    function commanderGame(playerCount = 4) {
      return createLocalGame({
        players: Array.from({ length: playerCount }, (_, index) => ({
          name: ["Ada", "Grace", "Katherine", "Dorothy"][index],
          color: ["#41476E", "#39755C", "#7B5A91", "#A06A2B"][index],
        })),
        startingLife: 40,
        system: "mtg",
        format: "commander",
        now: 1,
      })
    }

    const renderGame = (initialGame = commanderGame()) =>
      render(
        <ThemeProvider initialContext="light">
          <CurrentGameScreen
            initialGame={initialGame}
            repository={new LocalGameRepository(new MemoryStorage())}
            onViewSummary={jest.fn()}
          />
        </ThemeProvider>,
      )

    const life = (view: ReturnType<typeof renderGame>, seat: number) =>
      view.getByTestId(`life-total-seat-${seat}`, { includeHiddenElements: true }).props.children

    const armCommander = (view: ReturnType<typeof renderGame>, seat: number) => {
      fireEvent.press(view.getByTestId(`commander-mark-seat-${seat}`))
    }

    it("stays out of the way outside Commander", () => {
      const view = renderGame(
        createLocalGame({
          players: [
            { name: "Ada", color: "#41476E" },
            { name: "Grace", color: "#39755C" },
          ],
          startingLife: 20,
          system: "mtg",
          format: "standard",
          now: 1,
        }),
      )
      expect(view.queryByTestId("commander-board-seat-1")).toBeNull()
    })

    it("keeps the menu during assignment and turns it into an exit for inspection", () => {
      const view = renderGame()
      armCommander(view, 1)
      expect(view.getByTestId("game-menu-button").props.accessibilityLabel).toBe("Game options")
      fireEvent.press(view.getByTestId("game-menu-button"))
      expect(view.queryByTestId("commander-hit-seat-2")).toBeNull()
      fireEvent.press(view.getByTestId("game-menu-button"))
      armCommander(view, 1)
      fireEvent.press(view.getByTestId("commander-hit-seat-2"))
      expect(view.getByTestId("commander-total-seat-2")).toHaveTextContent("1")
      expect(life(view, 2)).toBe("39")
      expect(view.getByLabelText("1 commander damage from Ada")).toBeTruthy()
      fireEvent.press(view.getByTestId("commander-exit-seat-1"))
      expect(view.getByTestId("game-menu-button").props.accessibilityLabel).toBe("Game options")

      fireEvent.press(view.getByTestId("commander-map-seat-2"))
      expect(view.getByTestId("commander-board-seat-2")).toBeTruthy()
      expect(view.getByTestId("game-menu-button").props.accessibilityLabel).toBe(
        "Exit commander damage",
      )
      fireEvent.press(view.getByTestId("game-menu-button"))
      expect(view.queryByTestId("commander-board-seat-2")).toBeNull()
      fireEvent.press(view.getByTestId("commander-map-seat-2"))
      armCommander(view, 3)
      expect(view.queryByTestId("commander-board-seat-2")).toBeNull()
      fireEvent.press(view.getByTestId("commander-exit-seat-3"))
      expect(view.getByTestId("game-menu-button").props.accessibilityLabel).toBe("Game options")
      expect(view.queryByTestId("layout-button")).toBeNull()
    })

    it("arms one commander at a time and reveals controls only on opponents", () => {
      const view = renderGame()
      armCommander(view, 1)
      for (const seat of [2, 3, 4])
        expect(view.getByTestId(`commander-hit-seat-${seat}`)).toBeTruthy()
      expect(view.queryByTestId("commander-hit-seat-1")).toBeNull()

      fireEvent.press(view.getByTestId("commander-exit-seat-1"))
      armCommander(view, 3)
      expect(view.queryByTestId("commander-hit-seat-3")).toBeNull()
      expect(view.getByTestId("commander-hit-seat-1")).toBeTruthy()
    })

    it("applies each press straight to the counter and the life total", () => {
      const view = renderGame()
      armCommander(view, 1)
      for (let press = 0; press < 7; press += 1)
        fireEvent.press(view.getByTestId("commander-hit-seat-2"))
      for (let press = 0; press < 3; press += 1)
        fireEvent.press(view.getByTestId("commander-hit-seat-3"))

      expect(life(view, 2)).toBe("33")
      expect(life(view, 3)).toBe("37")
      expect(life(view, 4)).toBe("40")
      expect(life(view, 1)).toBe("40")
    })

    it("deals the attacker's power with one tap and finishes without sending", () => {
      const view = renderGame()
      armCommander(view, 1)
      fireEvent.press(view.getByTestId("commander-power-up-seat-1"))
      fireEvent.press(view.getByTestId("commander-power-up-seat-1"))
      fireEvent.press(view.getByTestId("commander-hit-seat-2"))
      expect(life(view, 2)).toBe("37")
      expect(view.getByTestId("commander-exit-seat-1").props.accessibilityLabel).toBe(
        "Done assigning commander damage from seat 1",
      )
    })

    it("disarms from the attacking card", () => {
      const view = renderGame()
      armCommander(view, 2)
      for (let press = 0; press < 4; press += 1)
        fireEvent.press(view.getByTestId("commander-hit-seat-1"))
      fireEvent.press(view.getByTestId("commander-exit-seat-2"))
      expect(life(view, 1)).toBe("36")
      expect(view.queryByTestId("commander-hit-seat-1")).toBeNull()
    })

    it("gives life back on the way down and stops at the recorded total", () => {
      const initial = commanderGame()
      initial.commanderDamage = {
        [commanderDamageKey(initial.players[0].id, initial.players[1].id)]: 7,
      }
      initial.players[1].life = 33
      const view = renderGame(initial)

      armCommander(view, 1)
      for (let press = 0; press < 7; press += 1)
        fireEvent.press(view.getByTestId("commander-undo-seat-2"))

      expect(life(view, 2)).toBe("40")
      expect(view.queryByTestId("commander-undo-seat-2")).toBeNull()
    })

    it("lets an eliminated attacker correct damage they dealt earlier", () => {
      const initial = commanderGame()
      initial.commanderDamage = {
        [commanderDamageKey(initial.players[0].id, initial.players[1].id)]: 7,
        [commanderDamageKey(initial.players[2].id, initial.players[0].id)]: 21,
      }
      initial.players[0].life = 19
      initial.players[1].life = 33
      const view = renderGame(initial)

      expect(view.getByTestId("life-seat-1-1")).toBeDisabled()
      armCommander(view, 1)
      fireEvent.press(view.getByTestId("commander-undo-seat-2"))
      expect(view.getByLabelText("6 commander damage from Ada")).toBeTruthy()
      fireEvent.press(view.getByTestId("commander-exit-seat-1"))
      expect(view.getByTestId("life-seat-1-1")).toBeDisabled()
      expect(life(view, 2)).toBe("34")
    })

    it("marks 21 from one commander as eliminated and leaves the game running", () => {
      const view = renderGame()
      armCommander(view, 1)
      for (let press = 0; press < 21; press += 1)
        fireEvent.press(view.getByTestId("commander-hit-seat-2"))

      expect(
        view.getByTestId("life-eliminated-seat-2", { includeHiddenElements: true }),
      ).toBeTruthy()
      expect(view.queryByTestId("life-eliminated-seat-3")).toBeNull()
      expect(view.getByTestId("game-board")).toBeTruthy()
      fireEvent.press(view.getByTestId("commander-exit-seat-1"))
      fireEvent.press(view.getByTestId("life-seat-2--1"))
      expect(life(view, 2)).toBe("19")
    })

    it("switches a fresh board from Connect to End after a commander assignment", () => {
      const view = render(
        <ThemeProvider initialContext="light">
          <CurrentGameScreen
            fresh
            initialGame={commanderGame()}
            repository={new LocalGameRepository(new MemoryStorage())}
            onViewSummary={jest.fn()}
          />
        </ThemeProvider>,
      )

      fireEvent.press(view.getByTestId("game-menu-button"))
      expect(view.getByTestId("connect-button")).toBeTruthy()
      expect(view.queryByTestId("end-game-button")).toBeNull()
      fireEvent.press(view.getByTestId("game-menu-button"))

      armCommander(view, 1)
      fireEvent.press(view.getByTestId("commander-hit-seat-2"))
      fireEvent.press(view.getByTestId("commander-exit-seat-1"))

      fireEvent.press(view.getByTestId("game-menu-button"))
      expect(view.getByTestId("end-game-button")).toBeTruthy()
      expect(view.queryByTestId("connect-button")).toBeNull()
    })
  })
})

it.each([false, true])(
  "attributes stale-prompt completion without retaining it after cancellation: %s",
  (cancelPrompt) => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const archive = jest.spyOn(repository, "archiveGame")
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={game()}
          initialEndOpen
          repository={repository}
          onViewSummary={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(archive).not.toHaveBeenCalled()
    if (cancelPrompt) {
      fireEvent.press(view.getByTestId("end-game-backdrop"))
      expect(archive).not.toHaveBeenCalled()
      fireEvent.press(view.getByTestId("game-menu-button"))
      fireEvent.press(view.getByTestId("end-game-button"))
    }
    fireEvent.press(view.getByTestId("end-game-result-draw"))
    fireEvent.press(view.getByTestId("confirm-end-game-button"))
    expect(archive).toHaveBeenCalledWith(
      expect.objectContaining({ status: "finished" }),
      cancelPrompt ? "game_menu" : "stale_game_prompt",
      undefined,
    )
  },
)
