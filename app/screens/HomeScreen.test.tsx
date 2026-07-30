import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { HomeScreen } from "./HomeScreen"

const callbacks = {
  onNewGame: jest.fn(),
  onResumeGame: jest.fn(),
  onHistory: jest.fn(),
  onSettings: jest.fn(),
}

describe("HomeScreen", () => {
  beforeEach(() => jest.clearAllMocks())

  it("starts a new game when no game is active", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <HomeScreen hasActiveGame={false} {...callbacks} />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("new-game-button"))
    expect(callbacks.onNewGame).toHaveBeenCalledTimes(1)
    expect(view.queryByTestId("resume-game-button")).toBeNull()
  })

  it("offers resume and prevents accidental active-game replacement", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <HomeScreen hasActiveGame {...callbacks} />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("resume-game-button"))
    expect(callbacks.onResumeGame).toHaveBeenCalledTimes(1)
    expect(view.queryByTestId("new-game-button")).toBeNull()
  })
})
