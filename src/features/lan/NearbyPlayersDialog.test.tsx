import { fireEvent, render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { NearbyPlayersDialog } from "./NearbyPlayersDialog"

describe("NearbyPlayersDialog", () => {
  it("lists every seat and marks the ones whose device dropped off", () => {
    const onClose = jest.fn()
    const player = { color: "#7C3AED", controlledByMe: false }
    render(
      <ThemeProvider initialContext="dark">
        <NearbyPlayersDialog
          players={[
            { ...player, playerId: "host", seat: 1, displayName: "Ada", controlledByMe: true },
            { ...player, playerId: "guest", seat: 2, displayName: "Grace" },
          ]}
          awayPlayerIds={["guest"]}
          onClose={onClose}
        />
      </ThemeProvider>,
    )

    expect(screen.getByText("Ada (you)")).toBeTruthy()
    expect(screen.getByText("Grace")).toBeTruthy()
    expect(screen.queryByTestId("nearby-away-seat-1")).toBeNull()
    expect(screen.getByTestId("nearby-away-seat-2")).toBeTruthy()
    fireEvent.press(screen.getByText("Close"))
    expect(onClose).toHaveBeenCalled()
  })
})
