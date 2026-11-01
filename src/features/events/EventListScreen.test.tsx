import { render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { EventListScreen } from "./EventListScreen"

it("tells a signed-in player who lost connection to reconnect, not to sign in", () => {
  render(
    <ThemeProvider>
      <EventListScreen
        access={{
          ready: false,
          loading: false,
          signedIn: true,
          message: "Reconnect to continue.",
          actionLabel: "Try again",
          request: jest.fn(),
        }}
        events={undefined}
        onBack={jest.fn()}
        onNew={jest.fn()}
        onJoin={jest.fn()}
        onOpen={jest.fn()}
      />
    </ThemeProvider>,
  )
  expect(screen.getByText("Reconnect to continue.")).toBeTruthy()
  expect(screen.queryByText("Sign in to run or join events")).toBeNull()
})
