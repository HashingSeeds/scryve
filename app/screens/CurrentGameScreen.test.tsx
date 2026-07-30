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

function game() {
  return createLocalGame({
    players: [
      { name: "Ada", color: "#41476E" },
      { name: "Grace", color: "#39755C" },
    ],
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
    fireEvent.press(view.getByTestId("life-seat-1--5"))
    expect(view.getByTestId("life-total-seat-1").props.children).toBe("-3")
    fireEvent.press(view.getByTestId("undo-button"))
    expect(view.getByTestId("life-total-seat-1").props.children).toBe("2")
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

  it.each(["finish", "abandon"] as const)("confirms and archives %s", async (action) => {
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
    expect(view.queryByTestId(`${action}-button`)).toBeNull()
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId(`${action}-button`))
    expect(view.getByTestId("game-board")).toBeTruthy()
    expect(view.queryByTestId(`${action}-button`)).toBeNull()
    expect(view.getByTestId(`confirm-${action}-button`)).toBeTruthy()
    fireEvent.press(view.getByTestId(`confirm-${action}-button`))
    await waitFor(() => {
      expect(onGameEnded).toHaveBeenCalledWith(initial.id)
      expect(repository.loadActiveGame()).toBeNull()
      expect(repository.loadHistory()[0].status).toBe(
        action === "finish" ? "finished" : "abandoned",
      )
    })
  })
})
