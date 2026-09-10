import { fireEvent, render, screen } from "@testing-library/react-native"

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

it("offers deck management when a required system has no matching decks", () => {
  const onManageDecks = jest.fn()
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
        openSeats={0}
        deckRequired
        system="pokemon"
        deckState={{
          status: "ready",
          value: [
            { _id: "magic", name: "Magic deck", versions: [{ _id: "v1", versionNumber: 1 }] },
          ],
        }}
        versionLabel={() => "Current"}
        onSelectVersion={jest.fn()}
        onReport={jest.fn()}
        onManageDecks={onManageDecks}
      />
    </ThemeProvider>,
  )
  expect(screen.queryByText("Magic deck")).toBeNull()
  expect(screen.getByText("No decks for this system. Add a deck to get ready.")).toBeTruthy()
  fireEvent.press(screen.getByText("Manage decks"))
  expect(onManageDecks).toHaveBeenCalledTimes(1)
})

it.each(["none", "mtg"])("can clear an unavailable deck in an optional %s game", (system) => {
  const onSelectVersion = jest.fn()
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[
          {
            seat: 1,
            displayName: "Ada",
            color: "#7C3AED",
            controlledByMe: true,
            deckVersionId: "archived-version",
          },
        ]}
        openSeats={0}
        system={system}
        deckState={{ status: "ready", value: [] }}
        versionLabel={() => "Current"}
        onSelectVersion={onSelectVersion}
        onReport={jest.fn()}
        onManageDecks={jest.fn()}
      />
    </ThemeProvider>,
  )
  if (system === "none") {
    expect(screen.getByText("Decks are not used for this game.")).toBeTruthy()
    expect(screen.queryByText("Manage decks")).toBeNull()
  }
  fireEvent.press(screen.getByText("No deck"))
  expect(onSelectVersion).toHaveBeenCalledWith(1)
})
