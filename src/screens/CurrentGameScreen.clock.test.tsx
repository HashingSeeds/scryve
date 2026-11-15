import { fireEvent, render } from "@testing-library/react-native"

import { createLocalGame } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { CurrentGameScreen } from "./CurrentGameScreen"
import { MemoryStorage } from "../../test/support/memoryStorage"

jest.mock("@/features/rules/rulesSource", () => ({ prefetchRules: jest.fn() }))

function mountTimedGame() {
  const repository = new LocalGameRepository(new MemoryStorage())
  const game = createLocalGame({
    players: [
      { name: "Ada", color: "#41476E" },
      { name: "Grace", color: "#39755C" },
    ],
    startingLife: 20,
    system: "mtg",
    clock: { mode: "countdown", minutes: 50 },
  })
  const view = render(
    <ThemeProvider initialContext="light">
      <CurrentGameScreen initialGame={game} repository={repository} onViewSummary={jest.fn()} />
    </ThemeProvider>,
  )
  return { view, repository, game }
}

describe("CurrentGameScreen round clock", () => {
  it("shows the clock to both ends of the table and walks the end-of-round turns", () => {
    const { view, repository, game } = mountTimedGame()
    expect(repository.loadActiveGame()?.clock).toEqual(game.clock)
    expect(view.getByTestId("round-clock-tab")).toHaveTextContent(/^\d+:\d{2}$/)
    expect(
      view.getByTestId("round-clock-tab-mirror", { includeHiddenElements: true }),
    ).toHaveTextContent(/^\d+:\d{2}$/)

    fireEvent.press(view.getByTestId("round-clock-tab"))
    fireEvent.press(view.getByTestId("round-clock-call"))
    expect(view.getByTestId("round-clock-tab").props.accessibilityLabel).toBe("Finish turn")

    fireEvent.press(view.getByTestId("round-clock-next"))
    fireEvent.press(view.getByTestId("round-clock-bonus"))
    expect(view.getByTestId("round-clock-tab").props.accessibilityLabel).toBe("Turn 1 of 7")
    expect(repository.loadActiveGame()?.clock).toMatchObject({ turn: 1, bonusTurns: 2 })

    fireEvent.press(view.getByTestId("round-clock-off"))
    expect(view.queryByTestId("round-clock-tab")).toBeNull()
    expect(repository.loadActiveGame()?.clock).toBeUndefined()
  })
})
