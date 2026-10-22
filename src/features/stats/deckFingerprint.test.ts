import { saveGuestDeck } from "@/features/decks/guestDeck"

import { pinDeckChoice } from "./deckChoices"
import { deckFingerprint } from "./deckFingerprint"
import { canonicalDecklist } from "../../../convex/lib/deckFingerprint"
import vectors from "../../../convex/lib/fixtures/deckFingerprint.json"

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "00000000-0000-4000-8000-000000000001"),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(async (_algorithm: string, input: string) =>
    jest
      .requireActual<typeof import("node:crypto")>("node:crypto")
      .createHash("sha256")
      .update(input)
      .digest("hex"),
  ),
}))

it.each(vectors)("matches the backend v1 vector $hex", async ({ cards, hex }) => {
  expect(await deckFingerprint(cards)).toBe(`v1:${hex}`)
  expect(await deckFingerprint([...cards].reverse())).toBe(`v1:${hex}`)
})

it("pins a Pokémon deck with missing card games using the server's normalized fingerprint", async () => {
  const cards = [{ name: "Pikachu", cardId: "base1-58", quantity: 4 }]
  const game = "pokemon"
  const local = saveGuestDeck({ name: "Pikachu", game, format: "standard", cards })
  const serverFingerprint = `v1:${jest
    .requireActual<typeof import("node:crypto")>("node:crypto")
    .createHash("sha256")
    .update(canonicalDecklist(cards.map((card) => ({ ...card, game }))))
    .digest("hex")}`

  expect(await pinDeckChoice({ localId: local.localId, name: "Pikachu" }, "owner")).toMatchObject({
    deckFingerprint: serverFingerprint,
  })
})
