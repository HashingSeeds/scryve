import { normalizePokemonCards, pokemonCardByReference } from "./pokemon"
import type { ActionCtx } from "../../_generated/server"

const riolu = {
  id: "me01-76",
  localId: "76",
  name: "Riolu",
  category: "Pokemon",
  stage: "Basic",
  types: ["Fighting"],
  rarity: "Common",
  image: "https://assets.tcgdex.net/en/mega/me01/76",
  set: { id: "me01" },
  attacks: [{ name: "Punch", damage: 20 }],
}

describe("TCGdex Pokemon cards", () => {
  it("normalizes provider rules text for the shared card dialog", () => {
    const card = normalizePokemonCards(riolu)[0]

    expect(card).toMatchObject({
      cardId: "me01-76",
      name: "Riolu",
      printings: [
        {
          collectorNumber: "76",
          typeLabel: "Pokemon · Basic · Fighting",
          faces: [
            {
              text: "Punch · 20",
              imageUrl: "https://assets.tcgdex.net/en/mega/me01/76/high.webp",
            },
          ],
        },
      ],
    })
  })

  it("resolves a Limitless set and number reference before loading full details", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "me01-76",
              localId: "76",
              name: "Riolu",
              image: "https://assets.tcgdex.net/en/mega/me01/76",
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(riolu), { status: 200 }))
    const ctx = {
      runMutation: jest.fn(async () => 0),
    } as unknown as ActionCtx

    const result = await pokemonCardByReference(ctx, "Riolu", "MEG 76")

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.tcgdex.net/v2/en/cards?name=Riolu&localId=76",
    )
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.tcgdex.net/v2/en/cards/me01-76")
    expect(result.cards[0]?.cardId).toBe("me01-76")
    fetchMock.mockRestore()
  })
})
