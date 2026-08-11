import { fireEvent, render, within } from "@testing-library/react-native"

import { Screen } from "@/components/Screen"
import { DEFAULT_LOCAL_SETTINGS } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { NewGameScreen, type ConnectedHostFeed, type NewGameScreenProps } from "./NewGameScreen"

function setup(overrides: Partial<NewGameScreenProps> = {}) {
  return render(
    <ThemeProvider initialContext="light">
      <NewGameScreen
        defaults={DEFAULT_LOCAL_SETTINGS}
        mode="local"
        onModeChange={jest.fn()}
        onBack={jest.fn()}
        onStartLocal={jest.fn()}
        {...overrides}
      />
    </ThemeProvider>,
  )
}

const readyHost: ConnectedHostFeed = { ready: true, busy: false, host: jest.fn() }

describe("NewGameScreen", () => {
  it("starts defaults and supports six players plus custom life", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.press(view.getByLabelText("6 players"))
    fireEvent.press(view.getByLabelText("Use custom starting life"))
    fireEvent.changeText(view.getByTestId("custom-starting-life"), "37")
    fireEvent.changeText(view.getByTestId("player-name-6"), "Six")
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Six" })]),
      37,
    )
    expect(onStartLocal.mock.calls[0][0]).toHaveLength(6)
  })

  it("falls back to the placeholder name for seats left blank", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.changeText(view.getByTestId("player-name-1"), " Ada ")
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal.mock.calls[0][0].map((player: { name: string }) => player.name)).toEqual([
      "Ada",
      "Player 2",
    ])
  })

  it("disables start for invalid custom life", () => {
    const view = setup()

    fireEvent.press(view.getByLabelText("Use custom starting life"))
    fireEvent.changeText(view.getByTestId("custom-starting-life"), "0")

    expect(view.getByTestId("start-game-button").props.accessibilityState.disabled).toBe(true)
  })

  it("hides the custom starting life field until it is requested", () => {
    const view = setup()

    expect(view.queryByTestId("custom-starting-life")).toBeNull()
    fireEvent.press(view.getByLabelText("Use custom starting life"))
    expect(view.getByTestId("custom-starting-life")).toBeTruthy()
    fireEvent.press(view.getByLabelText("Start at 30 life"))
    expect(view.queryByTestId("custom-starting-life")).toBeNull()
  })

  it("keeps the start button pinned outside the scrollable form", () => {
    const view = setup()

    fireEvent.press(view.getByLabelText("6 players"))
    const scrollableForm = view.UNSAFE_getByType(Screen)
    expect(within(scrollableForm).queryByTestId("start-game-button")).toBeNull()
    expect(within(scrollableForm).getByTestId("player-name-6")).toBeTruthy()
    expect(view.getByTestId("start-game-button")).toBeTruthy()
  })

  it("reports duplicate names per seat and blocks the start", () => {
    const view = setup()

    fireEvent.changeText(view.getByTestId("player-name-1"), " Ada ")
    fireEvent.changeText(view.getByTestId("player-name-2"), "ada")

    expect(view.getAllByText("Player names must be unique.")).toHaveLength(2)
    expect(view.getByTestId("start-game-button").props.accessibilityState.disabled).toBe(true)
  })

  it("swaps to seats, ruleset, and hosting in connected mode", () => {
    const host = jest.fn()
    const view = setup({ mode: "connected", connected: { ...readyHost, host } })

    expect(view.queryByTestId("player-name-1")).toBeNull()
    expect(view.getByLabelText("4 seats")).toBeTruthy()
    fireEvent.press(view.getByLabelText("4 seats"))
    fireEvent.changeText(view.getByTestId("connected-ruleset"), "commander")
    fireEvent.press(view.getByTestId("host-connected-button"))

    expect(host).toHaveBeenCalledWith({ playerCount: 4, startingLife: 20, ruleset: "commander" })
  })

  it("keeps hosting unavailable until the connected session is ready", () => {
    const view = setup({ mode: "connected", connected: { ...readyHost, ready: false } })

    expect(view.getByTestId("host-connected-button").props.accessibilityState.disabled).toBe(true)
  })

  it("surfaces a host blocker and refuses to submit while it stands", () => {
    const host = jest.fn()
    const view = setup({
      mode: "connected",
      connected: { ...readyHost, host, blockedReason: "Finish your hosted game first." },
    })

    expect(view.getByText("Finish your hosted game first.")).toBeTruthy()
    fireEvent.press(view.getByTestId("host-connected-button"))
    expect(host).not.toHaveBeenCalled()
  })

  it("switches modes through the toggle", () => {
    const onModeChange = jest.fn()
    const view = setup({ onModeChange })

    expect(view.getByTestId("mode-local").props.accessibilityState.selected).toBe(true)
    fireEvent.press(view.getByTestId("mode-connected"))
    expect(onModeChange).toHaveBeenCalledWith("connected")
  })
})
