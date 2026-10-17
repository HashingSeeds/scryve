import { strToU8, zipSync } from "fflate"

import lorcanaJson from "./fixtures/lorcanaJson.json"
import lorcanaJsonDecks from "./fixtures/lorcanaJsonDecks.json"
import {
  LORCANA_JSON_DATASET,
  normalizeLorcanaJsonCards,
  normalizeLorcanaStarterDecks,
} from "./lorcana"

const cards = normalizeLorcanaJsonCards(lorcanaJson)

function card(name: string) {
  const found = cards.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`Missing ${name}`)
  return found
}

function facets(name: string) {
  return Object.fromEntries(card(name).facets.map(({ key, value }) => [key, value]))
}

describe("LorcanaJSON normalizer", () => {
  it("groups printings by full name under the first printing's id", () => {
    const reversed = normalizeLorcanaJsonCards({ cards: [...lorcanaJson.cards].reverse() })
    const hades = reversed.find((candidate) => candidate.name === "Hades - King of Olympus")
    expect(cards).toHaveLength(5)
    expect(hades).toMatchObject({
      identityNamespace: "lorcanajson-card",
      cardId: "5",
      category: "Character",
      printings: [
        { printingId: "5", rarity: "Rare" },
        { printingId: "205", rarity: "Enchanted" },
      ],
    })
  })

  it("maps a printing's set, number, type line, and images", () => {
    expect(card("Hades - King of Olympus").printings[0]).toMatchObject({
      provider: "lorcanajson",
      providerCardId: "5",
      setCode: "1",
      collectorNumber: "5",
      typeLabel: "Character - Floodborn • Villain • King • Deity",
      costLabel: "8",
      faces: [
        {
          name: "Hades - King of Olympus",
          text: expect.stringContaining("Shift 6"),
          imageUrl: expect.stringMatching(/^https:\/\/api\.lorcana\.ravensburger\.com\/.+\/5_/),
          smallImageUrl: expect.stringMatching(/^https:\/\/api\.lorcana\.ravensburger\.com\//),
        },
      ],
    })
  })

  it("puts stats and ink in facets", () => {
    expect(facets("Hades - King of Olympus")).toMatchObject({
      cost: "8",
      inkwell: "false",
      color: "Amber",
      strength: "6",
      willpower: "7",
      lore: "1",
      keywords: "Shift",
    })
    expect(facets("Rhino - Motivational Speaker")).toMatchObject({ color: "Amber-Steel" })
    expect(facets("Never Land - Mermaid Lagoon")).toMatchObject({ moveCost: "1", willpower: "4" })
    expect(facets("Be Our Guest")).not.toHaveProperty("strength")
  })

  it("reads Core and Infinity legality, bans, and rotation", () => {
    expect(facets("Be Our Guest")).toMatchObject({
      "legality:core": "legal",
      "legality:infinity": "legal",
    })
    expect(facets("Hiram Flaversham - Toymaker")).toMatchObject({
      "legality:core": "banned",
      "legality:infinity": "banned",
    })
    expect(facets("Rhino - Motivational Speaker")).toMatchObject({
      "legality:core": "not-legal",
      "legalUntil:core": "2026-07-17",
    })
  })

  it("skips records without an id or name", () => {
    expect(normalizeLorcanaJsonCards({ cards: [{ fullName: "No id" }, { id: 9 }] })).toEqual([])
    expect(normalizeLorcanaJsonCards(lorcanaJson.cards)).toEqual([])
  })

  it("loads allCards only when it matches the version metadata announced", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation(
        async (url) =>
          new Response(
            JSON.stringify(
              String(url).endsWith("/metadata.json") ? lorcanaJson.metadata : lorcanaJson,
            ),
          ),
      )
    try {
      const version = await LORCANA_JSON_DATASET.version()
      expect(version).toBe(lorcanaJson.metadata.generatedOn)
      await expect(LORCANA_JSON_DATASET.load(version)).resolves.toHaveLength(5)
      await expect(LORCANA_JSON_DATASET.load("2099-01-01T00:00:00")).rejects.toThrow(
        "not 2099-01-01T00:00:00",
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("reads starter decks from the deck zip in set order, without quest or gateway decks", () => {
    const zip = zipSync(
      Object.fromEntries(
        Object.entries(lorcanaJsonDecks).map(([file, deck]) => [
          file,
          strToU8(JSON.stringify(deck)),
        ]),
      ),
    )
    expect(normalizeLorcanaStarterDecks(zip)).toEqual([
      {
        code: "S2-1",
        name: "Rotated Starter",
        cards: [
          { printingId: "5", quantity: 2 },
          { printingId: "205", quantity: 1 },
          { printingId: "25", quantity: 2 },
        ],
      },
      expect.objectContaining({ code: "S10-1" }),
      expect.objectContaining({ code: "S10-2" }),
      expect.objectContaining({ code: "S12-1", name: "Core Starter" }),
    ])
  })
})
