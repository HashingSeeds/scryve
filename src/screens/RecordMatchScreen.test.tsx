import { fireEvent, render, waitFor } from "@testing-library/react-native"
import type { ConvexReactClient } from "convex/react"

import type { CloudAccess } from "@/features/auth/CloudScreen"
import { saveGuestDeck } from "@/features/decks/guestDeck"
import { getManualMatchController } from "@/features/matches/matchOutbox"
import { ThemeProvider } from "@/theme/context"

import { RecordMatchScreen, type RecordMatchDeck } from "./RecordMatchScreen"

const mockRecordMatch = jest.fn(async (_reference: unknown, _args: unknown) => ({
  matchId: "match-1",
}))
const mockClient = {
  mutation: mockRecordMatch,
  url: "https://test.convex.cloud",
} as unknown as ConvexReactClient
jest.mock("convex/react", () => ({ useConvex: () => mockClient }))
jest.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(async (_algorithm: string, input: string) =>
    jest
      .requireActual<typeof import("node:crypto")>("node:crypto")
      .createHash("sha256")
      .update(input)
      .digest("hex"),
  ),
}))

const signedIn = (ready: boolean): CloudAccess => ({
  ready,
  loading: false,
  signedIn: true,
  ownerId: "owner-a",
  request: jest.fn(),
})

function renderScreen(access: CloudAccess, deck?: RecordMatchDeck) {
  const onBack = jest.fn()
  const onSaved = jest.fn()
  const view = render(
    <ThemeProvider initialContext="light">
      <RecordMatchScreen access={access} deck={deck} onBack={onBack} onSaved={onSaved} />
    </ThemeProvider>,
  )
  fireEvent.changeText(view.getByTestId("match-opponent-name-0"), "Them")
  return { view, onBack, onSaved }
}

it("records a local deck's key, list and name with the match", async () => {
  const stop = getManualMatchController(mockClient, "owner-a").start()
  const stored = saveGuestDeck(
    { name: "Mono Red", format: "modern", game: "mtg", cards: [] },
    { deckKey: "moved-deck-key" },
  )
  const { view, onSaved } = renderScreen(signedIn(true), {
    localId: stored.localId,
    name: "Mono Red",
  })
  fireEvent.press(view.getByTestId("match-save"))

  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  await waitFor(() => expect(mockRecordMatch).toHaveBeenCalled())
  stop()
  expect(mockRecordMatch.mock.calls[0][1]).toMatchObject({
    system: "mtg",
    format: "modern",
    me: {
      deckKey: "moved-deck-key",
      deckFingerprint: expect.stringMatching(/^v1:[0-9a-f]{64}$/),
      deckName: "Mono Red",
    },
  })
})

it("saves offline on this device without blocking Back", async () => {
  const { view, onBack, onSaved } = renderScreen(signedIn(false))
  fireEvent.press(view.getByTestId("match-save"))

  await waitFor(() => expect(view.getByTestId("match-saved-offline")).toBeTruthy())
  expect(getManualMatchController(mockClient, "owner-a").getSnapshot().pending).toHaveLength(1)
  fireEvent.press(view.getByText("Back"))
  expect(onBack).toHaveBeenCalled()
  fireEvent.press(view.getByTestId("match-done"))
  expect(onSaved).toHaveBeenCalled()
})
