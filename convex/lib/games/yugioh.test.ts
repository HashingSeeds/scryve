import { normalizeYgoCards, ygoSection } from "./yugioh"

function card(frameType: string) {
  return {
    game: "ygo" as const,
    identityNamespace: "ygoprodeck-card",
    cardId: "1",
    name: "Example",
    nameNormalized: "example",
    facets: [{ key: "frameType", value: frameType }],
    printings: [],
  }
}

describe("Yu-Gi-Oh normalization", () => {
  it.each(["fusion_pendulum", "synchro_pendulum", "xyz_pendulum"])(
    "classifies %s as extra deck",
    (frameType) => {
      expect(ygoSection(card(frameType))).toBe("extra")
    },
  )

  it("does not throw or add image URLs for an unsafe mirror base URL", () => {
    expect(() =>
      normalizeYgoCards(
        {
          data: [
            {
              id: 1,
              name: "Example",
              card_images: [{ id: 2 }],
            },
          ],
        },
        "not a URL",
      ),
    ).not.toThrow()
    expect(
      normalizeYgoCards(
        { data: [{ id: 1, name: "Example", card_images: [{ id: 2 }] }] },
        "http://mirror.example",
      )[0]?.printings[0]?.faces[0],
    ).not.toHaveProperty("imageUrl")
  })
})
