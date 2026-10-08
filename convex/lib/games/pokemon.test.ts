import { normalizePokemonCards, pokemonCardByReference, pokemonCardSummaries } from "./pokemon"
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

  describe("set code tie-break", () => {
    const ctx = { runMutation: jest.fn(async () => 0) } as unknown as ActionCtx
    const candidate = (id: string, localId: string, name = "Riolu") => ({ id, localId, name })

    function mockTcgdex(routes: Record<string, unknown>) {
      const requested: string[] = []
      const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const path = String(input).replace("https://api.tcgdex.net/v2/en", "")
        requested.push(path)
        return path in routes
          ? new Response(JSON.stringify(routes[path]), { status: 200 })
          : new Response("{}", { status: 404 })
      })
      return { requested, restore: () => fetchMock.mockRestore() }
    }

    it("picks the candidate whose set abbreviation matches the deck list code", async () => {
      const tcgdex = mockTcgdex({
        "/cards?name=Riolu&localId=76": [candidate("bw8-76", "76"), candidate("me01-076", "076")],
        "/sets/bw8": { id: "bw8", tcgOnline: "PLS", abbreviation: { official: "PLS" } },
        "/sets/me01": { id: "me01", abbreviation: { official: "MEG" } },
        "/cards/me01-076": { ...riolu, id: "me01-076", localId: "076" },
      })
      try {
        const result = await pokemonCardByReference(ctx, "Riolu", "MEG 76")

        expect(result.cards.map((card) => card.cardId)).toEqual(["me01-076"])
      } finally {
        tcgdex.restore()
      }
    })

    it.each([
      [
        "a current code when the retired PTCGO code differs",
        "SMP 1",
        { tcgOnline: "PR-SM", abbreviation: { official: "SMP" } },
      ],
      ["a subset code with its suffix", "LOR 1", { abbreviation: { official: "LOR:TG" } }],
    ])("matches %s", async (_label, reference, set) => {
      const tcgdex = mockTcgdex({
        "/cards?name=Riolu&localId=1": [candidate("other-1", "1"), candidate("target-1", "1")],
        "/sets/other": { abbreviation: { official: "OTH" } },
        "/sets/target": set,
        "/cards/target-1": { ...riolu, id: "target-1", localId: "1" },
      })
      try {
        const result = await pokemonCardByReference(ctx, "Riolu", reference)

        expect(result.cards.map((card) => card.cardId)).toEqual(["target-1"])
      } finally {
        tcgdex.restore()
      }
    })

    it("maps PTCG Live promo codes to TCGdex sets without loading set details", async () => {
      const tcgdex = mockTcgdex({
        "/cards?name=Riolu&localId=149": [
          candidate("sv01-149", "149"),
          candidate("svp-149", "149"),
        ],
        "/cards/svp-149": { ...riolu, id: "svp-149", localId: "149" },
      })
      try {
        const result = await pokemonCardByReference(ctx, "Riolu", "PR-SV 149")

        expect(result.cards.map((card) => card.cardId)).toEqual(["svp-149"])
        expect(tcgdex.requested.some((path) => path.startsWith("/sets/"))).toBe(false)
      } finally {
        tcgdex.restore()
      }
    })
  })

  it("loads only bounded, filtered pages for deck catalog summaries", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify([]), { status: 200 }))
    const ctx = {
      runMutation: jest.fn(async () => 0),
    } as unknown as ActionCtx
    try {
      await pokemonCardSummaries(
        ctx,
        Array.from({ length: 130 }, (_, index) => ({
          name: `Card ${index}`,
          collectorNumber: String(index),
        })),
        false,
      )

      expect(fetchMock).toHaveBeenCalledTimes(12)
      const requestedNames = fetchMock.mock.calls.flatMap(([input]) => {
        const url = new URL(String(input))
        expect(url.pathname).toBe("/v2/en/cards")
        expect(url.searchParams.get("pagination:page")).toBe("1")
        expect(url.searchParams.get("pagination:itemsPerPage")).toBe("500")
        expect(url.searchParams.get("localId")?.startsWith("eq:")).toBe(true)
        return (url.searchParams.get("name")?.replace(/^eq:/, "").split("|") ?? []).map(
          (name) => name,
        )
      })
      expect(requestedNames).toHaveLength(120)
      expect(requestedNames[0]).toBe("Card 0")
      expect(requestedNames.at(-1)).toBe("Card 119")
    } finally {
      fetchMock.mockRestore()
    }
  })
})
