import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { createLocalGame } from "@/features/game/domain"
import { LocalGameRepository, type StringStorage } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { CurrentGameScreen } from "./CurrentGameScreen"

jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}))

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

function matchGame(bestOf: 1 | 3 | 5, playerCount = 2) {
  return createLocalGame({
    players: Array.from({ length: playerCount }, (_, index) => ({
      name: ["Ada", "Grace", "Katherine", "Dorothy"][index],
      color: ["#41476E", "#39755C", "#7B5A91", "#A06A2B"][index],
    })),
    startingLife: 2,
    now: 1,
    match: { bestOf },
  })
}

function mount(repository: LocalGameRepository, onGameAbandoned?: () => void) {
  const initial = repository.loadActiveGame()!
  const onViewSummary = jest.fn()
  const view = render(
    <ThemeProvider initialContext="light">
      <CurrentGameScreen
        initialGame={initial}
        repository={repository}
        onViewSummary={onViewSummary}
        onGameAbandoned={onGameAbandoned}
        ownerId="owner"
      />
    </ThemeProvider>,
  )
  return { view, initial, onViewSummary }
}

function endGame(view: ReturnType<typeof render>, winner: number | "draw") {
  fireEvent.press(view.getByTestId("life-seat-1-1"))
  fireEvent.press(view.getByTestId("game-menu-button"))
  fireEvent.press(view.getByTestId("end-game-button"))
  fireEvent.press(
    view.getByTestId(winner === "draw" ? "end-game-result-draw" : `end-game-winner-${winner}`),
  )
  fireEvent.press(view.getByTestId("confirm-end-game-button"))
}

describe("CurrentGameScreen match mode", () => {
  it("plays a best of three to its end and then starts a fresh match", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.saveActiveGame(matchGame(3))
    const { view, initial } = mount(repository)
    expect(view.getByTestId("match-context")).toHaveTextContent("Game 1 · 0-0")

    endGame(view, 0)
    expect(view.getByText("Game 1 saved")).toBeTruthy()
    expect(view.getByText("Ada 1 · Grace 0")).toBeTruthy()
    fireEvent.press(view.getByTestId("next-game-button"))
    expect(view.getByTestId("match-context")).toHaveTextContent("Game 2 · 1-0")
    expect(repository.loadActiveGame()).toMatchObject({
      match: { id: initial.match?.id, gameNumber: 2, wins: [1, 0] },
    })
    expect(repository.loadHistory()[0].matchPublish).toBeUndefined()

    endGame(view, "draw")
    fireEvent.press(view.getByTestId("next-game-button"))
    expect(view.getByTestId("match-context")).toHaveTextContent("Game 3 · 1-0 · 1 draw")

    endGame(view, 0)
    expect(view.queryByTestId("match-prompt-dialog")).toBeNull()
    expect(view.getByText("Match saved")).toBeTruthy()
    await waitFor(() =>
      expect(repository.loadHistory()[0]).toMatchObject({
        matchPublish: "pending",
        match: { id: initial.match?.id, gameNumber: 3, result: { outcomes: ["win", "loss"] } },
      }),
    )
    expect(view.getByTestId("match-context")).toHaveTextContent("Game 1 · 0-0")
    expect(repository.loadActiveGame()?.match?.id).not.toBe(initial.match?.id)
  })

  it("lets a game inside a match have only one winner", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.saveActiveGame(matchGame(1, 3))
    const { view } = mount(repository)
    fireEvent.press(view.getByTestId("life-seat-1-1"))
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    fireEvent.press(view.getByTestId("end-game-winner-0"))
    fireEvent.press(view.getByTestId("end-game-winner-2"))
    expect(view.getByTestId("end-game-winner-0").props.accessibilityState.selected).toBe(false)
    expect(view.getByTestId("end-game-winner-2").props.accessibilityState.selected).toBe(true)
  })

  it("ends a called pod round with a draw for the seats still playing", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.saveActiveGame(matchGame(1, 4))
    const { view, initial } = mount(repository)
    // why: seat 4 drops to zero, so a called round leaves it with a loss.
    fireEvent.press(view.getByTestId("life-seat-4--1"))
    fireEvent.press(view.getByTestId("life-seat-4--1"))
    endGame(view, "draw")
    fireEvent.press(view.getByTestId("match-prompt-end-button"))
    expect(view.getByTestId("end-match-dialog")).toBeTruthy()
    fireEvent.press(view.getByTestId("match-outcome-0-win"))
    fireEvent.press(view.getByTestId("confirm-end-match-button"))
    expect(view.getByText("The winner must have the most game wins")).toBeTruthy()
    fireEvent.press(view.getByTestId("match-draw-remaining"))
    fireEvent.press(view.getByTestId("confirm-end-match-button"))

    expect(view.queryByTestId("end-match-dialog")).toBeNull()
    expect(view.getByText("Match saved")).toBeTruthy()
    await waitFor(() =>
      expect(repository.loadHistory()[0]).toMatchObject({
        id: initial.id,
        matchPublish: "pending",
        match: { result: { outcomes: ["draw", "draw", "draw", "loss"] } },
      }),
    )
    expect(repository.loadActiveGame()?.match).toMatchObject({ gameNumber: 1, wins: [0, 0, 0, 0] })
    expect(repository.loadActiveGame()?.match?.id).not.toBe(initial.match?.id)
  })

  it("ends a match from the score dialog on the fresh next board", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.saveActiveGame(matchGame(3))
    const { view, initial } = mount(repository)
    endGame(view, 1)
    fireEvent.press(view.getByTestId("next-game-button"))

    // why: the board label never takes touches; the score opens from the menu's status line.
    expect(view.getByTestId("match-context").props.onPress).toBeUndefined()
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByLabelText("Game 2 · 0-1 · Best of 3"))
    expect(view.getByText("Best of 3 · Game 2")).toBeTruthy()
    fireEvent.press(view.getByTestId("end-match-button"))
    expect(view.getByTestId("match-outcome-1-win").props.accessibilityState.selected).toBe(true)
    fireEvent.press(view.getByTestId("confirm-end-match-button"))

    await waitFor(() =>
      expect(repository.loadHistory()[0]).toMatchObject({
        id: initial.id,
        match: { result: { outcomes: ["loss", "win"] } },
      }),
    )
    expect(repository.loadActiveGame()?.match?.id).not.toBe(initial.match?.id)
  })

  it("restarts the same game of the match on Abandon instead of dropping the match", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.saveActiveGame(matchGame(3))
    const onGameAbandoned = jest.fn()
    const { view, initial } = mount(repository, onGameAbandoned)
    endGame(view, 0)
    fireEvent.press(view.getByTestId("next-game-button"))
    const second = repository.loadActiveGame()!

    fireEvent.press(view.getByTestId("life-seat-2--1"))
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    fireEvent.press(view.getByTestId("abandon-game-button"))

    expect(onGameAbandoned).not.toHaveBeenCalled()
    expect(view.getByTestId("match-context")).toHaveTextContent("Game 2 · 1-0")
    expect(view.getByTestId("life-total-seat-2").props.children).toBe("2")
    const restarted = repository.loadActiveGame()!
    expect(restarted.id).not.toBe(second.id)
    expect(restarted.match).toEqual({ ...initial.match, gameNumber: 2, wins: [1, 0] })
    expect(repository.loadHistory().map((game) => game.id)).toEqual([initial.id])
  })

  it("holds the board at the tenth game until the match result is confirmed", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.saveActiveGame(matchGame(1))
    const { view, initial } = mount(repository)
    for (let game = 1; game < 10; game += 1) {
      endGame(view, "draw")
      fireEvent.press(view.getByTestId("next-game-button"))
    }
    expect(view.getByTestId("match-context")).toHaveTextContent("Game 10 · 0-0 · 9 draws")
    endGame(view, "draw")
    expect(view.queryByTestId("next-game-button")).toBeNull()
    expect(view.getByText("A match holds at most ten games, so this one ends here.")).toBeTruthy()
    fireEvent.press(view.getByTestId("match-prompt-end-button"))
    fireEvent.press(view.getByTestId("end-match-backdrop"))
    // why: Cancel returns to the prompt, so the match is never left behind without a result.
    expect(view.getByTestId("match-prompt-dialog")).toBeTruthy()
    expect(repository.loadActiveGame()).toBeNull()

    // why: a restart reopens the owed result from storage on a fresh board.
    view.unmount()
    const reopened = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={createLocalGame({
            players: [
              { name: "Ada", color: "#41476E" },
              { name: "Grace", color: "#39755C" },
            ],
            startingLife: 2,
            now: 99,
          })}
          fresh
          repository={repository}
          onViewSummary={jest.fn()}
          ownerId="owner"
        />
      </ThemeProvider>,
    )
    expect(reopened.getByText("Game 10 saved")).toBeTruthy()
    fireEvent.press(reopened.getByTestId("match-prompt-end-button"))
    fireEvent.press(reopened.getByTestId("confirm-end-match-button"))
    expect(repository.loadPendingMatchEnd()).toBeUndefined()

    await waitFor(() =>
      expect(repository.loadHistory()[0]).toMatchObject({
        match: { id: initial.match?.id, gameNumber: 10, result: { outcomes: ["draw", "draw"] } },
      }),
    )
    expect(reopened.queryByTestId("match-prompt-dialog")).toBeNull()
  })
})
