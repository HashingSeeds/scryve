import { Linking } from "react-native"
import { act, fireEvent, render, screen } from "@testing-library/react-native"

import type { MineDeck } from "@/features/decks/decksSync"
import type { MyDecks } from "@/features/decks/LocalDeckChoicesSource"
import type { LocalDeckSyncResult } from "@/features/decks/localDeckSync"
import { ThemeProvider } from "@/theme/context"

import { lanSession, type LanSessionState } from "./lanSession"
import { NearbyLobbyScreen } from "./NearbyLobbyScreen"

let mockState: LanSessionState = { status: "idle" }
jest.mock("./lanSession", () => ({
  lanSession: { leave: jest.fn(), selectDeck: jest.fn().mockResolvedValue(undefined) },
  useLanSessionSlice: <Slice,>(select: (state: LanSessionState) => Slice) => select(mockState),
}))

const mockSync = jest.fn<Promise<LocalDeckSyncResult>, [string]>()
const mockDetail = jest.fn()
jest.mock("@clerk/expo", () => ({ useUser: () => ({ user: { id: "owner" } }) }))
jest.mock("convex/react", () => ({
  useConvex: () => ({ query: mockDetail }),
  useQuery: () => ({ canCreate: true }),
}))
jest.mock("@/features/connected/useConvexOnline", () => ({ useConvexOnline: () => true }))
jest.mock("@/features/decks/localDeckSync", () => ({
  useLocalDeckSync: () => ({ sync: mockSync }),
}))
let mockGuestDecks: unknown[] = []
jest.mock("@/features/decks/guestDeck", () => ({ useGuestDecks: () => mockGuestDecks }))

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

describe("the nearby lobby's deck picker", () => {
  const angels = {
    localId: "local-angels",
    deckKey: "key-angels",
    deck: {
      name: "Calling All Angels",
      game: "mtg",
      format: "commander",
      cards: [{ quantity: 99 }],
    },
  }
  const syncedAngels = {
    _id: "deck-angels",
    deckKey: "key-angels",
    name: "Calling All Angels",
    game: "mtg",
    format: "commander",
    cardQuantity: 99,
    latestVersionId: "version-1",
    versions: [{ _id: "version-1", versionNumber: 1 }],
  } as Partial<MineDeck> as MineDeck

  beforeEach(() => {
    mockState = {
      role: "host",
      status: "connected",
      lobby: {
        id: "lan-1",
        status: "lobby",
        round: 1,
        setup: {
          playerCount: 2,
          startingLife: 40,
          lifeStep: 1,
          ruleset: "commander",
          system: "mtg",
          format: "commander",
        },
        seats: [{ key: "host", seat: 1, name: "Ada", connected: true }],
      },
      projection: {
        players: [
          {
            playerId: "host",
            seat: 1,
            displayName: "Ada",
            color: "#7C3AED",
            currentLife: 40,
            controlledByMe: true,
          },
        ],
      } as Partial<LanSessionState["projection"]> as LanSessionState["projection"],
    }
    mockGuestDecks = []
    mockSync.mockReset()
    mockDetail.mockReset()
    jest.mocked(lanSession.selectDeck).mockClear()
  })

  const lobby = (myDecks: MyDecks, onAddDeck = jest.fn()) => (
    <ThemeProvider initialContext="dark">
      <NearbyLobbyScreen
        signedIn
        myDecks={myDecks}
        onBack={jest.fn()}
        onPlay={jest.fn()}
        onLeft={jest.fn()}
        onManageDecks={jest.fn()}
        onAddDeck={onAddDeck}
      />
    </ThemeProvider>
  )

  it("syncs a device deck and seats it once the account lists it", async () => {
    mockGuestDecks = [angels]
    mockSync.mockResolvedValue({ status: "synced", deckId: "deck-angels" as never })
    mockDetail.mockResolvedValue({ version: { _id: "version-1" } })
    const view = render(lobby([]))
    await act(async () => fireEvent.press(screen.getByTestId("seat-1-sync-and-use-local-angels")))
    expect(mockSync).toHaveBeenCalledWith("local-angels")
    expect(lanSession.selectDeck).not.toHaveBeenCalled()
    // why: a pick made before the synced deck lands would be replaced by it.
    expect(screen.getByTestId("seat-1-deck-no-deck")).toBeDisabled()

    await act(async () => view.rerender(lobby([syncedAngels])))
    expect(lanSession.selectDeck).toHaveBeenCalledWith({
      versionId: "version-1",
      name: "Calling All Angels",
    })
    expect(screen.getByTestId("seat-1-deck-no-deck")).toBeEnabled()
  })

  it("opens Add deck from + New deck", () => {
    const onAddDeck = jest.fn()
    render(lobby([], onAddDeck))
    fireEvent.press(screen.getByText("+ New deck"))
    expect(onAddDeck).toHaveBeenCalledTimes(1)
  })
})
