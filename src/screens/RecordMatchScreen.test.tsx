import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { saveGuestDeck } from "@/features/decks/guestDeck"
import { ThemeProvider } from "@/theme/context"

import { RecordMatchScreen } from "./RecordMatchScreen"

const mockRecordMatch = jest.fn(async (_args: unknown) => ({ matchId: "match-1" }))
jest.mock("convex/react", () => ({ useMutation: () => mockRecordMatch }))
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

it("records a local deck's key, list and name with the match", async () => {
  const stored = saveGuestDeck(
    { name: "Mono Red", format: "modern", game: "mtg", cards: [] },
    { deckKey: "moved-deck-key" },
  )
  const onSaved = jest.fn()
  const view = render(
    <ThemeProvider initialContext="light">
      <RecordMatchScreen
        access={{
          ready: true,
          loading: false,
          signedIn: true,
          ownerId: "owner-a",
          request: jest.fn(),
        }}
        deck={{ localId: stored.localId, name: "Mono Red" }}
        onBack={jest.fn()}
        onSaved={onSaved}
      />
    </ThemeProvider>,
  )
  fireEvent.changeText(view.getByTestId("match-opponent-name-0"), "Them")
  fireEvent.press(view.getByTestId("match-save"))

  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(mockRecordMatch.mock.calls[0][0]).toMatchObject({
    system: "mtg",
    format: "modern",
    me: {
      deckKey: "moved-deck-key",
      deckFingerprint: expect.stringMatching(/^v1:[0-9a-f]{64}$/),
      deckName: "Mono Red",
    },
  })
})
