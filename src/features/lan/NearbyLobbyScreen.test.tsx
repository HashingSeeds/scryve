import { Linking } from "react-native"
import { fireEvent, render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import type { LanSessionState } from "./lanSession"
import { NearbyLobbyScreen } from "./NearbyLobbyScreen"

let mockState: LanSessionState = { status: "idle" }
jest.mock("./lanSession", () => ({
  lanSession: { leave: jest.fn() },
  useLanSessionSlice: <Slice,>(select: (state: LanSessionState) => Slice) => select(mockState),
}))

function renderScreen(props: { accessDenied?: boolean; hosting?: boolean } = {}) {
  render(
    <ThemeProvider initialContext="dark">
      <NearbyLobbyScreen onBack={jest.fn()} onPlay={jest.fn()} onLeft={jest.fn()} {...props} />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  mockState = { status: "idle" }
})

it("sends a player whose nearby access is off to Settings", () => {
  const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue()
  renderScreen({ accessDenied: true, hosting: true })
  expect(screen.getByText("Nearby access is off")).toBeTruthy()
  expect(screen.queryByText("Connecting…")).toBeNull()
  fireEvent.press(screen.getByText("Open settings"))
  expect(openSettings).toHaveBeenCalledTimes(1)
})

it("says what it is waiting on before the lobby arrives", () => {
  renderScreen({ hosting: true })
  expect(screen.getByText("Starting lobby…")).toBeTruthy()

  mockState = { role: "guest", status: "connecting", serviceName: "Android 91f2" }
  screen.unmount()
  renderScreen()
  expect(screen.getByText("Connecting to Android 91f2…")).toBeTruthy()
})
