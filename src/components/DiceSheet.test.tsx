import { AccessibilityInfo } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import type { PlayerId } from "@/features/game/types"
import { ThemeProvider } from "@/theme/context"

import { DiceSheet } from "./DiceSheet"

jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

const players = [
  { id: "p1" as PlayerId, name: "Ada", color: "#41476E" },
  { id: "p2" as PlayerId, name: "Grace", color: "#39755C" },
  { id: "p3" as PlayerId, name: "Katherine", color: "#7B5A91" },
]

function renderSheet(onClose = jest.fn()) {
  const view = render(
    <ThemeProvider initialContext="dark">
      <DiceSheet players={players} onClose={onClose} />
    </ThemeProvider>,
  )
  return { view, onClose }
}

describe("DiceSheet", () => {
  afterEach(() => jest.restoreAllMocks())

  it("announces each result, including a repeat and the picked player's name", () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility")
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const { view } = renderSheet()

    fireEvent.press(view.getByTestId("dice-d20-roll"))
    fireEvent.press(view.getByTestId("dice-d20-roll"))
    fireEvent.press(view.getByTestId("dice-coin-flip"))
    fireEvent.press(view.getByTestId("dice-first-pick"))

    expect(announce.mock.calls.map(([message]) => message)).toEqual([
      "d20, 11",
      "d20, 11",
      "Coin, Tails",
      "Grace goes first",
    ])
  })

  it("rolls a d20 from 1 to 20", () => {
    const random = jest.spyOn(Math, "random")
    const { view } = renderSheet()

    random.mockReturnValue(0)
    fireEvent.press(view.getByTestId("dice-d20-roll"))
    expect(view.getByTestId("dice-d20-result")).toHaveTextContent("1")

    random.mockReturnValue(0.999)
    fireEvent.press(view.getByTestId("dice-d20-roll"))
    expect(view.getByTestId("dice-d20-result")).toHaveTextContent("20")
  })

  it("flips heads or tails", () => {
    const random = jest.spyOn(Math, "random")
    const { view } = renderSheet()

    random.mockReturnValue(0.2)
    fireEvent.press(view.getByTestId("dice-coin-flip"))
    expect(view.getByTestId("dice-coin-result")).toHaveTextContent("Heads")

    random.mockReturnValue(0.7)
    fireEvent.press(view.getByTestId("dice-coin-flip"))
    expect(view.getByTestId("dice-coin-result")).toHaveTextContent("Tails")
  })

  it("marks one seated player as going first", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const { view } = renderSheet()
    expect(view.queryByText("Goes first")).toBeNull()

    fireEvent.press(view.getByTestId("dice-first-pick"))

    expect(view.getByTestId("dice-player-p2").props.accessibilityState.selected).toBe(true)
    expect(view.getByTestId("dice-player-p1").props.accessibilityState.selected).toBe(false)
    expect(view.getAllByText("Goes first")).toHaveLength(1)
  })

  it("closes from the backdrop", () => {
    const { view, onClose } = renderSheet()
    fireEvent.press(view.getByTestId("dice-backdrop"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
