import { fireEvent, render } from "@testing-library/react-native"

import { DEFAULT_LOCAL_SETTINGS } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { GameSetupScreen } from "./GameSetupScreen"

describe("GameSetupScreen", () => {
  it("starts defaults and supports six players plus custom life", () => {
    const onStart = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <GameSetupScreen defaults={DEFAULT_LOCAL_SETTINGS} onBack={jest.fn()} onStart={onStart} />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByLabelText("6 players"))
    fireEvent.press(view.getByLabelText("Use custom starting life"))
    fireEvent.changeText(view.getByTestId("custom-starting-life"), "37")
    fireEvent.changeText(view.getByTestId("player-name-6"), "Six")
    fireEvent.press(view.getByTestId("start-game-button"))
    expect(onStart).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Six" })]),
      37,
    )
    expect(onStart.mock.calls[0][0]).toHaveLength(6)
  })

  it("disables start for invalid custom life", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <GameSetupScreen defaults={DEFAULT_LOCAL_SETTINGS} onBack={jest.fn()} onStart={jest.fn()} />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByLabelText("Use custom starting life"))
    fireEvent.changeText(view.getByTestId("custom-starting-life"), "0")
    expect(view.getByTestId("start-game-button").props.accessibilityState.disabled).toBe(true)
  })

  it("hides custom starting life behind an ellipsis until requested", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <GameSetupScreen defaults={DEFAULT_LOCAL_SETTINGS} onBack={jest.fn()} onStart={jest.fn()} />
      </ThemeProvider>,
    )

    expect(view.queryByTestId("custom-starting-life")).toBeNull()
    fireEvent.press(view.getByLabelText("Use custom starting life"))
    expect(view.getByTestId("custom-starting-life")).toBeTruthy()
  })

  it("shows seat-specific name errors and submits trimmed unique names", () => {
    const onStart = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <GameSetupScreen defaults={DEFAULT_LOCAL_SETTINGS} onBack={jest.fn()} onStart={onStart} />
      </ThemeProvider>,
    )
    fireEvent.changeText(view.getByTestId("player-name-1"), " Ada ")
    fireEvent.changeText(view.getByTestId("player-name-2"), "ada")
    expect(view.getAllByText("Player names must be unique.")).toHaveLength(2)
    expect(view.getByTestId("start-game-button").props.accessibilityState.disabled).toBe(true)

    fireEvent.changeText(view.getByTestId("player-name-2"), "   ")
    expect(view.getByText("Enter a player name.")).toBeTruthy()
    fireEvent.changeText(view.getByTestId("player-name-2"), "Grace")
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStart.mock.calls[0][0].map((player: { name: string }) => player.name)).toEqual([
      "Ada",
      "Grace",
    ])
  })
})
