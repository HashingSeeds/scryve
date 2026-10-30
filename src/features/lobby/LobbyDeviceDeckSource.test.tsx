import { act, fireEvent, render, screen } from "@testing-library/react-native"

import { LobbySeatList } from "@/features/connected/LobbySeatList"
import type { LocalDeckSyncResult } from "@/features/decks/localDeckSync"
import { ThemeProvider } from "@/theme/context"

import { LobbyDeviceDeckSource } from "./LobbyDeviceDeckSource"

const mockSync = jest.fn<Promise<LocalDeckSyncResult>, [string]>()
const mockQuery = jest.fn()

jest.mock("@clerk/expo", () => ({ useUser: () => ({ user: { id: "owner" } }) }))
jest.mock("convex/react", () => ({ useConvex: () => ({ query: mockQuery }) }))
jest.mock("../../../convex/_generated/api", () => ({ api: { decks: { detail: "decks.detail" } } }))
jest.mock("@/features/decks/localDeckSync", () => ({
  useLocalDeckSync: () => ({ sync: mockSync }),
}))
jest.mock("@/features/decks/guestDeck", () => ({
  useGuestDecks: () => [
    {
      localId: "local-angels",
      deck: {
        name: "Calling All Angels",
        game: "mtg",
        format: "commander",
        cards: [{ quantity: 1 }, { quantity: 98 }],
      },
    },
  ],
}))

function renderSeat({
  online = true,
  canCreate = true,
  onUse = jest.fn().mockResolvedValue(undefined),
} = {}) {
  render(
    <ThemeProvider initialContext="dark">
      <LobbyDeviceDeckSource online={online} capacity={{ canCreate }} onUse={onUse}>
        {(deviceDecks) => (
          <LobbySeatList
            seats={[{ seat: 1, displayName: "Ada", color: "#7C3AED", controlledByMe: true }]}
            openSeats={0}
            system="mtg"
            format="commander"
            deckState={{ status: "ready", value: [] }}
            deviceDecks={deviceDecks}
            versionLabel={() => "Current"}
            onSelectVersion={jest.fn()}
          />
        )}
      </LobbyDeviceDeckSource>
    </ThemeProvider>,
  )
  return { onUse }
}

beforeEach(() => {
  mockSync.mockReset()
  mockQuery.mockReset()
})

it("syncs a device deck and picks its version for the seat in one step", async () => {
  mockSync.mockResolvedValue({ status: "synced", deckId: "deck-1" as never })
  mockQuery.mockResolvedValue({ version: { _id: "version-1" } })
  const { onUse } = renderSeat()
  expect(screen.getByText("99 cards")).toBeTruthy()
  await act(async () => fireEvent.press(screen.getByTestId("seat-1-sync-and-use-local-angels")))
  expect(mockSync).toHaveBeenCalledWith("local-angels")
  expect(mockQuery).toHaveBeenCalledWith("decks.detail", { deckId: "deck-1" })
  expect(onUse).toHaveBeenCalledWith(1, "version-1")
})

it("says why a deck can't sync when offline or when the account is full", () => {
  renderSeat({ online: false })
  expect(screen.getByText("Reconnect to continue.")).toBeTruthy()
  expect(screen.getByTestId("seat-1-sync-and-use-local-angels")).toBeDisabled()
  screen.unmount()
  renderSeat({ canCreate: false })
  expect(screen.getByText("Account full. Free a slot in Manage decks.")).toBeTruthy()
  expect(screen.getByTestId("seat-1-sync-and-use-local-angels")).toBeDisabled()
})

it("keeps the row and shows the reason when the server refuses at the limit", async () => {
  mockSync.mockResolvedValue({ status: "limit_reached" })
  const { onUse } = renderSeat()
  await act(async () => fireEvent.press(screen.getByTestId("seat-1-sync-and-use-local-angels")))
  expect(screen.getByText("Account full. Free a slot in Manage decks.")).toBeTruthy()
  expect(screen.getByText("Calling All Angels")).toBeTruthy()
  expect(onUse).not.toHaveBeenCalled()
})
