import { render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { LobbySeatList } from "./LobbySeatList"

describe("LobbySeatList", () => {
  it("renders one ledger row for every configured seat", () => {
    render(
      <ThemeProvider initialContext="light">
        <LobbySeatList
          seats={[
            {
              playerId: "player-1",
              seat: 1,
              displayName: "Ada",
              color: "#7C3AED",
              controlledByMe: true,
            },
          ]}
          openSeats={5}
          totalSeats={6}
          deckRequired
          deckState={{ status: "ready", value: [] }}
          versionLabel={() => "Current"}
          onSelectVersion={jest.fn()}
          onReport={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(screen.getByText("Ada")).toBeTruthy()
    expect(screen.getByTestId("seat-1-readiness")).toHaveTextContent("○ Choose a deck")
    expect(screen.getAllByTestId("lobby-open-seat")).toHaveLength(5)
  })
})
