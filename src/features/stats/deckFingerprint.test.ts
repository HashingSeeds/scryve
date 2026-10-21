import { deckFingerprint } from "./deckFingerprint"
import vectors from "../../../convex/lib/fixtures/deckFingerprint.json"

jest.mock("expo-crypto", () => ({
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
