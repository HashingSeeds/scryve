import { cardsByYgoIds, normalizeYgoCards, ygoImageUrl, ygoSection } from "./yugioh"
import type { ActionCtx } from "../../_generated/server"

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

  it("uses the live mirror when no image base is configured", () => {
    expect(ygoImageUrl("14558127")).toBe(
      "https://ygo-images.scryve.sow.care/images/yugioh/cards/14558127.jpg",
    )
    expect(ygoImageUrl(undefined)).toBeUndefined()
    expect(ygoImageUrl("14558127:0")).toBeUndefined()
  })

  it.each([true, false])("honors includeImages=%s in provider lookups", async (includeImages) => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ id: 1, name: "Example", card_images: [{ id: 2 }] }] }),
        ),
      )
    try {
      const ctx = { runMutation: jest.fn().mockResolvedValue(0) } as unknown as ActionCtx
      const result = await cardsByYgoIds(ctx, ["1"], includeImages)
      expect(result.cards[0]?.printings[0]?.faces[0]?.imageUrl).toBe(
        includeImages ? "https://ygo-images.scryve.sow.care/images/yugioh/cards/2.jpg" : undefined,
      )
    } finally {
      fetchMock.mockRestore()
    }
  })
})
