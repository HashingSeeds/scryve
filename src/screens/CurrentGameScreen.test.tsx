import { StyleSheet } from "react-native"
import * as Haptics from "expo-haptics"
import { useKeepAwake } from "expo-keep-awake"
import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { createLocalGame } from "@/features/game/domain"
import { LocalGameRepository, type StringStorage } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { CurrentGameScreen } from "./CurrentGameScreen"

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

function game(playerCount = 2) {
  return createLocalGame({
    players: Array.from({ length: playerCount }, (_, index) => ({
      name: ["Ada", "Grace", "Katherine", "Dorothy", "Evelyn", "Mary"][index],
      color: ["#41476E", "#39755C", "#7B5A91", "#A06A2B", "#B03A58", "#C76542"][index],
    })),
    startingLife: 2,
    now: 1,
  })
}

describe("CurrentGameScreen", () => {
  beforeEach(() => jest.mocked(Haptics.impactAsync).mockClear())

  it("renders changes immediately, allows negative life, and undoes once", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={game()}
          repository={repository}
          onHome={jest.fn()}
          onGameEnded={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent(view.getByTestId("life-seat-1--1"), "longPress")
    fireEvent.changeText(view.getByTestId("life-editor-input-seat-1"), "5")
    fireEvent.press(view.getByTestId("life-editor-apply-seat-1"))
    expect(view.getByTestId("life-total-seat-1").props.children).toBe("-3")
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("undo-button"))
    expect(view.getByTestId("life-total-seat-1").props.children).toBe("2")
    fireEvent.press(view.getByTestId("game-menu-button"))
    expect(view.getByTestId("undo-button").props.accessibilityState.disabled).toBe(true)
    expect(useKeepAwake).toHaveBeenCalledWith("count-local-game")
  })

  it("keeps playing if haptics fail", () => {
    jest.mocked(Haptics.impactAsync).mockRejectedValueOnce(new Error("unavailable"))
    const repository = new LocalGameRepository(new MemoryStorage())
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={game()}
          repository={repository}
          onHome={jest.fn()}
          onGameEnded={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("life-seat-1-1"))
    expect(view.getByTestId("life-total-seat-1").props.children).toBe("3")
  })

  it("suppresses haptics until the system motion preference is known", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={game()}
          repository={repository}
          onHome={jest.fn()}
          onGameEnded={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("life-seat-1-1"))
    expect(Haptics.impactAsync).not.toHaveBeenCalled()
  })

  it("uses a centered board menu and keeps navigation out of the play surface", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={game()}
          repository={new LocalGameRepository(new MemoryStorage())}
          onHome={jest.fn()}
          onGameEnded={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.getByTestId("game-menu-button")).toBeTruthy()
    expect(view.queryByText("Grace")).toBeNull()
    expect(view.getByTestId("player-mark-seat-2", { includeHiddenElements: true })).toBeTruthy()
    expect(view.queryByTestId("undo-button")).toBeNull()
    expect(view.queryByTestId("home-button")).toBeNull()

    fireEvent.press(view.getByTestId("game-menu-button"))

    expect(view.getByTestId("game-menu-backdrop")).toBeTruthy()
    expect(view.getByTestId("home-button")).toBeTruthy()
    expect(view.getByTestId("layout-button").props.accessibilityState.disabled).toBe(true)
    expect(view.getByTestId("status-button")).toBeTruthy()
    expect(view.getByTestId("end-game-button")).toBeTruthy()
    expect(view.queryByTestId("finish-button")).toBeNull()
    expect(view.queryByTestId("abandon-button")).toBeNull()
  })

  it("moves the menu to a shared four-card junction", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={game(6)}
          repository={new LocalGameRepository(new MemoryStorage())}
          onHome={jest.fn()}
          onGameEnded={jest.fn()}
        />
      </ThemeProvider>,
    )

    const menuStyle = StyleSheet.flatten(view.getByTestId("game-menu-anchor").props.style)
    expect(menuStyle).toMatchObject({ left: "50%", top: `${(2 / 3) * 100}%` })
    expect(menuStyle.right).toBeUndefined()
    expect(view.getByTestId("player-grid-row-2")).toBeTruthy()

    fireEvent.press(view.getByTestId("game-menu-button"))
    expect(view.getByTestId("layout-button").props.accessibilityState.disabled).toBe(true)
  })

  it("keeps the useful odd-player layout choices without offering wide", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={game(5)}
          repository={new LocalGameRepository(new MemoryStorage())}
          onHome={jest.fn()}
          onGameEnded={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("layout-button"))
    expect(view.getByTestId("layout-picker-dialog")).toBeTruthy()
    expect(
      StyleSheet.flatten(view.getByTestId("layout-picker-backdrop").props.style),
    ).toMatchObject({
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    })
    expect(view.queryByTestId("layout-wide-grid")).toBeNull()
    expect(view.getByTestId("layout-featured-first")).toBeTruthy()
  })

  it("archives the game as abandoned when ended from the pop-up with no result", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = game()
    repository.saveActiveGame(initial)
    const onGameEnded = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={initial}
          repository={repository}
          onHome={jest.fn()}
          onGameEnded={onGameEnded}
        />
      </ThemeProvider>,
    )
    expect(view.queryByTestId("end-game-button")).toBeNull()
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    expect(view.getByTestId("game-board")).toBeTruthy()
    expect(view.queryByTestId("layout-picker-dialog")).toBeNull()
    expect(view.getByTestId("end-game-dialog")).toBeTruthy()
    expect(StyleSheet.flatten(view.getByTestId("end-game-backdrop").props.style)).toMatchObject({
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    })
    expect(view.getByTestId("confirm-end-game-button")).toBeTruthy()
    fireEvent.press(view.getByTestId("confirm-end-game-button"))
    await waitFor(() => {
      expect(onGameEnded).toHaveBeenCalledWith(initial.id)
      expect(repository.loadActiveGame()).toBeNull()
      expect(repository.loadHistory()[0].status).toBe("abandoned")
    })
  })

  it("offers to abandon until a result is chosen, then to finish", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = game()
    repository.saveActiveGame(initial)
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={initial}
          repository={repository}
          onHome={jest.fn()}
          onGameEnded={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))

    expect(view.getByText(/localGame:abandon/)).toBeTruthy()

    fireEvent.press(view.getByTestId("end-game-winner-1"))
    expect(view.getByText(/localGame:finish/)).toBeTruthy()
    expect(view.queryByText(/localGame:abandon/)).toBeNull()

    fireEvent.press(view.getByTestId("end-game-result-draw"))
    expect(view.getByText(/localGame:finish/)).toBeTruthy()

    fireEvent.press(view.getByTestId("end-game-result-draw"))
    expect(view.getByText(/localGame:abandon/)).toBeTruthy()
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
          onHome={jest.fn()}
          onGameEnded={jest.fn()}
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

  it("records no result once the last picked winner is unpicked", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = game()
    repository.saveActiveGame(initial)
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={initial}
          repository={repository}
          onHome={jest.fn()}
          onGameEnded={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    fireEvent.press(view.getByTestId("end-game-winner-0"))
    fireEvent.press(view.getByTestId("end-game-winner-0"))
    expect(view.getByTestId("confirm-end-game-button").props.accessibilityState.disabled).toBe(
      false,
    )
    fireEvent.press(view.getByTestId("confirm-end-game-button"))

    await waitFor(() => {
      expect(repository.loadHistory()[0].result).toBeUndefined()
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
          onHome={jest.fn()}
          onGameEnded={jest.fn()}
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

  it("ends without a result when the host declines to record one", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const initial = game()
    repository.saveActiveGame(initial)
    const view = render(
      <ThemeProvider initialContext="light">
        <CurrentGameScreen
          initialGame={initial}
          repository={repository}
          onHome={jest.fn()}
          onGameEnded={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    fireEvent.press(view.getByTestId("confirm-end-game-button"))

    await waitFor(() => {
      expect(repository.loadHistory()[0].result).toBeUndefined()
    })
  })
})
