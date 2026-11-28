import { fireEvent, render, screen } from "@testing-library/react-native"

import { deckVersionLabel } from "@/features/decks/deckCopy"
import { ThemeProvider } from "@/theme/context"

import { LobbySeatList, type LobbyDeviceDeck } from "./LobbySeatList"

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

it("offers a new deck when a required system has no matching decks", () => {
  const onAddDeck = jest.fn()
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
        onManageDecks={jest.fn()}
        onAddDeck={onAddDeck}
      />
    </ThemeProvider>,
  )
  expect(screen.queryByText("Magic deck")).toBeNull()
  expect(screen.queryByText("Manage decks")).toBeNull()
  fireEvent.press(screen.getByText("+ New deck"))
  expect(onAddDeck).toHaveBeenCalledTimes(1)
})

it("keeps the selection status visible while a seat with no matching decks is selecting", () => {
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
        openSeats={0}
        deckRequired
        system="pokemon"
        deckState={{ status: "ready", value: [] }}
        selectingDeckSeats={new Set([1])}
        versionLabel={() => "Current"}
        onSelectVersion={jest.fn()}
        onReport={jest.fn()}
        onManageDecks={jest.fn()}
        onAddDeck={jest.fn()}
      />
    </ThemeProvider>,
  )
  expect(screen.getByTestId("seat-1-deck-selection-status")).toHaveTextContent("Selecting deck…")
  expect(screen.getByText("+ New deck")).toBeTruthy()
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

it("only offers decks matching the lobby format", () => {
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
        openSeats={0}
        system="mtg"
        format="vintage"
        deckState={{
          status: "ready",
          value: [
            {
              _id: "commander",
              name: "Commander deck",
              format: "commander",
              versions: [{ _id: "c", versionNumber: 1 }],
            },
            {
              _id: "vintage",
              name: "Vintage deck",
              format: "vintage",
              versions: [{ _id: "v", versionNumber: 1 }],
            },
          ],
        }}
        versionLabel={() => "Current"}
        onSelectVersion={jest.fn()}
        onReport={jest.fn()}
      />
    </ThemeProvider>,
  )
  expect(screen.queryByText("Commander deck")).toBeNull()
  expect(screen.getByText("Vintage deck")).toBeTruthy()
})

it("reads an older default-named version by number in the seat and version picker", () => {
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[
          {
            seat: 1,
            displayName: "Ada",
            color: "#7C3AED",
            controlledByMe: true,
            deckVersionId: "v1",
          },
        ]}
        openSeats={0}
        system="mtg"
        deckState={{
          status: "ready",
          value: [
            {
              _id: "deck",
              name: "Atraxa",
              versions: [
                { _id: "v1", versionNumber: 1, name: "Current" },
                { _id: "v2", versionNumber: 2, name: "Budget" },
              ],
            },
          ],
        }}
        versionLabel={deckVersionLabel}
        onSelectVersion={jest.fn()}
      />
    </ThemeProvider>,
  )
  expect(screen.getByText("You · Atraxa · Version 1")).toBeTruthy()
  expect(screen.getByTestId("seat-1-version")).toHaveTextContent(/Version 1.*Budget/)
  expect(screen.queryByText("Current")).toBeNull()
})

it("starts a picked deck on the version you bring", () => {
  const onSelectVersion = jest.fn()
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
        openSeats={0}
        system="mtg"
        deckState={{
          status: "ready",
          value: [
            {
              _id: "deck",
              name: "Atraxa",
              cardQuantity: 100,
              bringingVersionId: "v1",
              versions: [
                { _id: "v1", versionNumber: 1 },
                { _id: "v2", versionNumber: 2 },
              ],
            },
          ],
        }}
        versionLabel={deckVersionLabel}
        onSelectVersion={onSelectVersion}
      />
    </ThemeProvider>,
  )
  fireEvent.press(screen.getByTestId("seat-1-deck-deck"))
  expect(onSelectVersion).toHaveBeenCalledWith(1, "v1")
})

const deviceDeck = (overrides: Partial<LobbyDeviceDeck> = {}): LobbyDeviceDeck => ({
  localId: "local-angels",
  deckKey: "key-angels",
  game: "mtg",
  format: "commander",
  name: "Calling All Angels",
  cardQuantity: 99,
  ...overrides,
})

it("lists matching device decks with Sync and use, below the account decks", () => {
  const onSyncAndUse = jest.fn()
  const onManageDecks = jest.fn()
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[{ seat: 2, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
        openSeats={0}
        deckRequired
        system="mtg"
        format="commander"
        deckState={{
          status: "ready",
          value: [
            {
              _id: "avengers",
              deckKey: "key-avengers",
              name: "Avengers Assemble",
              format: "commander",
              versions: [{ _id: "v1", versionNumber: 1 }],
            },
          ],
        }}
        deviceDecks={{
          decks: [
            deviceDeck(),
            deviceDeck({ localId: "local-modern", name: "Burn", format: "modern" }),
            deviceDeck({ localId: "local-synced", deckKey: "key-avengers", name: "Old copy" }),
          ],
          onSyncAndUse,
        }}
        versionLabel={() => "Current"}
        onSelectVersion={jest.fn()}
        onManageDecks={onManageDecks}
      />
    </ThemeProvider>,
  )
  expect(screen.getByText("Avengers Assemble")).toBeTruthy()
  expect(screen.getByText("On this device")).toBeTruthy()
  expect(screen.getByText("99 cards")).toBeTruthy()
  expect(screen.queryByText("Burn")).toBeNull()
  expect(screen.queryByText("Old copy")).toBeNull()
  fireEvent.press(screen.getByTestId("seat-2-sync-and-use-local-angels"))
  expect(onSyncAndUse).toHaveBeenCalledWith(2, "local-angels")
})

it("gives an empty device deck no Sync and use", () => {
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
        openSeats={0}
        system="mtg"
        deckState={{ status: "ready", value: [] }}
        deviceDecks={{
          decks: [deviceDeck({ localId: "local-empty", name: "Duo check", cardQuantity: 0 })],
          onSyncAndUse: jest.fn(),
        }}
        versionLabel={() => "Current"}
        onSelectVersion={jest.fn()}
      />
    </ThemeProvider>,
  )
  expect(screen.getByText("Empty list")).toBeTruthy()
  expect(screen.queryByTestId("seat-1-sync-and-use-local-empty")).toBeNull()
})

describe("a seat with more than two decks", () => {
  const accountDeck = (id: string, lastPlayedAt?: number, cardQuantity = 100) => ({
    _id: id,
    name: id,
    cardQuantity,
    lastPlayedAt,
    versions: [
      { _id: `${id}-v1`, versionNumber: 1 },
      { _id: `${id}-v2`, versionNumber: 2 },
    ],
  })
  const decks = [
    accountDeck("played-first", 1),
    accountDeck("unplayed"),
    accountDeck("played-last", 3),
    accountDeck("empty", undefined, 0),
  ]
  const seat = ({
    deckVersionId,
    onViewAllDecks = jest.fn(),
    onSelectVersion = jest.fn(),
    onSyncAndUse = jest.fn(),
  }: {
    deckVersionId?: string
    onViewAllDecks?: jest.Mock
    onSelectVersion?: jest.Mock
    onSyncAndUse?: jest.Mock
  }) =>
    render(
      <ThemeProvider initialContext="dark">
        <LobbySeatList
          seats={[
            { seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true, deckVersionId },
          ]}
          openSeats={0}
          system="mtg"
          deckRequired
          deckState={{ status: "ready", value: decks }}
          deviceDecks={{
            decks: [
              deviceDeck(),
              deviceDeck({ localId: "local-empty", deckKey: "key-empty", cardQuantity: 0 }),
            ],
            onSyncAndUse,
          }}
          versionLabel={() => "Current"}
          onSelectVersion={onSelectVersion}
          onViewAllDecks={onViewAllDecks}
        />
      </ThemeProvider>,
    )

  it("shows the two most recently played and hands the rest to View all", () => {
    const onViewAllDecks = jest.fn()
    const onSelectVersion = jest.fn()
    const onSyncAndUse = jest.fn()
    seat({ onViewAllDecks, onSelectVersion, onSyncAndUse })
    expect(screen.getAllByText(/^played-/).map((node) => node.props.children)).toEqual([
      "played-last",
      "played-first",
    ])
    expect(screen.queryByText("unplayed")).toBeNull()
    expect(screen.queryByText("Calling All Angels")).toBeNull()

    fireEvent.press(screen.getByTestId("seat-1-view-all-decks"))
    const [request] = onViewAllDecks.mock.calls[0]
    expect(request.system).toBe("mtg")
    expect([...request.deckIds].sort()).toEqual(
      ["guest-local-angels", "played-first", "played-last", "unplayed"].sort(),
    )
    request.pick("unplayed")
    expect(onSelectVersion).toHaveBeenCalledWith(1, "unplayed-v2")
    request.pick("guest-local-angels")
    expect(onSyncAndUse).toHaveBeenCalledWith(1, "local-angels")
  })

  it("keeps Free a slot reachable when the account is full and its device decks are hidden", () => {
    const onManageDecks = jest.fn()
    render(
      <ThemeProvider initialContext="dark">
        <LobbySeatList
          seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
          openSeats={0}
          system="mtg"
          deckState={{ status: "ready", value: decks.slice(0, 2) }}
          deviceDecks={{
            decks: [deviceDeck({ syncBlocked: "accountFull" })],
            onSyncAndUse: jest.fn(),
          }}
          versionLabel={() => "Current"}
          onSelectVersion={jest.fn()}
          onManageDecks={onManageDecks}
          onViewAllDecks={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(screen.queryByText("Calling All Angels")).toBeNull()
    fireEvent.press(screen.getByTestId("seat-1-free-slot"))
    expect(onManageDecks).toHaveBeenCalledTimes(1)
  })

  it("keeps the seat's deck in view when it is not one of the two", () => {
    seat({ deckVersionId: "unplayed-v1" })
    expect(screen.getByText("played-last")).toBeTruthy()
    expect(screen.getByText("unplayed")).toBeTruthy()
    expect(screen.queryByText("played-first")).toBeNull()
    expect(screen.getByTestId("seat-1-view-all-decks")).toBeTruthy()
  })
})

it("lists decks shared with the player, and marks the one their seat plays", () => {
  const onUse = jest.fn()
  const shared = {
    deckKey: "shared-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    name: "Borrowed",
    game: "mtg",
    format: "commander",
    cardQuantity: 100,
  }
  const seat = (deckVersionId?: string) =>
    render(
      <ThemeProvider initialContext="dark">
        <LobbySeatList
          seats={[
            { seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true, deckVersionId },
          ]}
          openSeats={0}
          system="mtg"
          format="commander"
          deckState={{ status: "ready", value: [] }}
          sharedDecks={{
            decks: [shared, { ...shared, deckKey: "shared-" + "c".repeat(32), format: "modern" }],
            onUse,
          }}
          versionLabel={() => "Current"}
          onSelectVersion={jest.fn()}
        />
      </ThemeProvider>,
    )
  seat()
  expect(screen.getByText("Shared with you")).toBeTruthy()
  expect(screen.queryByTestId("seat-1-shared-deck-shared-" + "c".repeat(32))).toBeNull()
  fireEvent.press(screen.getByTestId("seat-1-shared-deck-shared-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
  expect(onUse).toHaveBeenCalledWith(1, "shared-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
  screen.unmount()

  seat("shared-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
  expect(
    screen.getByTestId("seat-1-shared-deck-shared-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").props
      .accessibilityState,
  ).toMatchObject({
    selected: true,
  })
  expect(screen.getByText("You · Borrowed")).toBeTruthy()
})

it("shows device decks when the account has none, instead of a dead end", () => {
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
        openSeats={0}
        deckRequired
        system="mtg"
        deckState={{ status: "ready", value: [] }}
        deviceDecks={{ decks: [deviceDeck()], onSyncAndUse: jest.fn() }}
        versionLabel={() => "Current"}
        onSelectVersion={jest.fn()}
      />
    </ThemeProvider>,
  )
  expect(screen.queryByText("No synced decks yet.")).toBeNull()
  expect(screen.queryByText("Sync a deck to join.")).toBeNull()
  expect(screen.getByText("Calling All Angels")).toBeTruthy()
})

it("keeps a device deck that can't sync listed, says why, and holds the action", () => {
  const onSyncAndUse = jest.fn()
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
        openSeats={0}
        system="mtg"
        deckState={{ status: "ready", value: [] }}
        deviceDecks={{
          decks: [deviceDeck({ syncBlocked: "offline" })],
          onSyncAndUse,
        }}
        versionLabel={() => "Current"}
        onSelectVersion={jest.fn()}
      />
    </ThemeProvider>,
  )
  expect(screen.getByText("Reconnect to continue.")).toBeTruthy()
  const action = screen.getByTestId("seat-1-sync-and-use-local-angels")
  expect(action).toBeDisabled()
  fireEvent.press(action)
  expect(onSyncAndUse).not.toHaveBeenCalled()
})

it("holds every deck choice while a device deck syncs, so the sync can't overwrite a newer pick", () => {
  const onSelectVersion = jest.fn()
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
        openSeats={0}
        system="mtg"
        deckState={{
          status: "ready",
          value: [
            { _id: "avengers", name: "Avengers", versions: [{ _id: "v1", versionNumber: 1 }] },
          ],
        }}
        deviceDecks={{
          decks: [deviceDeck()],
          syncingLocalId: "local-angels",
          onSyncAndUse: jest.fn(),
        }}
        versionLabel={() => "Current"}
        onSelectVersion={onSelectVersion}
      />
    </ThemeProvider>,
  )
  expect(screen.getByText("Syncing…")).toBeTruthy()
  fireEvent.press(screen.getByTestId("seat-1-deck-avengers"))
  fireEvent.press(screen.getByTestId("seat-1-deck-no-deck"))
  expect(onSelectVersion).not.toHaveBeenCalled()
  expect(screen.queryByTestId("seat-1-deck-selection-status")).toBeNull()
})

it("shows an empty account deck dimmed and doesn't let the seat choose it", () => {
  const onSelectVersion = jest.fn()
  const onAddDeck = jest.fn()
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
        openSeats={0}
        deckRequired
        system="mtg"
        deckState={{
          status: "ready",
          value: [
            {
              _id: "duo",
              name: "Duo check",
              cardQuantity: 0,
              versions: [{ _id: "v1", versionNumber: 1 }],
            },
          ],
        }}
        versionLabel={() => "Current"}
        onSelectVersion={onSelectVersion}
        onManageDecks={jest.fn()}
        onAddDeck={onAddDeck}
      />
    </ThemeProvider>,
  )
  expect(screen.getByText("Empty list")).toBeTruthy()
  fireEvent.press(screen.getByText("Duo check"))
  expect(onSelectVersion).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText("+ New deck"))
  expect(onAddDeck).toHaveBeenCalledTimes(1)
})

it("offers Free a slot on a device deck when the account is full", () => {
  const onManageDecks = jest.fn()
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
        openSeats={0}
        system="mtg"
        deckState={{ status: "ready", value: [] }}
        deviceDecks={{
          decks: [deviceDeck({ syncBlocked: "accountFull" })],
          onSyncAndUse: jest.fn(),
        }}
        versionLabel={() => "Current"}
        onSelectVersion={jest.fn()}
        onManageDecks={onManageDecks}
      />
    </ThemeProvider>,
  )
  expect(screen.getByText("Account full.")).toBeTruthy()
  expect(screen.queryByTestId("seat-1-sync-and-use-local-angels")).toBeNull()
  fireEvent.press(screen.getByText("Free a slot"))
  expect(onManageDecks).toHaveBeenCalledTimes(1)
})

it("hides version choices for a chosen deck whose list is now empty", () => {
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[
          {
            seat: 1,
            displayName: "Ada",
            color: "#7C3AED",
            controlledByMe: true,
            deckVersionId: "v1",
          },
        ]}
        openSeats={0}
        system="mtg"
        deckState={{
          status: "ready",
          value: [
            {
              _id: "deck",
              name: "Atraxa",
              cardQuantity: 0,
              versions: [
                { _id: "v1", versionNumber: 1 },
                { _id: "v2", versionNumber: 2 },
              ],
            },
          ],
        }}
        versionLabel={deckVersionLabel}
        onSelectVersion={jest.fn()}
      />
    </ThemeProvider>,
  )
  expect(screen.queryByTestId("seat-1-version")).toBeNull()
})

it("still offers a new deck when the only device deck can't sync", () => {
  const onAddDeck = jest.fn()
  render(
    <ThemeProvider initialContext="dark">
      <LobbySeatList
        seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
        openSeats={0}
        deckRequired
        system="mtg"
        deckState={{ status: "ready", value: [] }}
        deviceDecks={{
          decks: [deviceDeck({ syncBlocked: "accountFull" })],
          onSyncAndUse: jest.fn(),
        }}
        versionLabel={() => "Current"}
        onSelectVersion={jest.fn()}
        onManageDecks={jest.fn()}
        onAddDeck={onAddDeck}
      />
    </ThemeProvider>,
  )
  expect(screen.getByText("Free a slot")).toBeTruthy()
  fireEvent.press(screen.getByText("+ New deck"))
  expect(onAddDeck).toHaveBeenCalledTimes(1)
})
