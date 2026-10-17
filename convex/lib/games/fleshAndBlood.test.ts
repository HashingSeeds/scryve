import fabCube from "./fixtures/fabCube.json"
import { normalizeFabCubeCards } from "./fleshAndBlood"

const cards = normalizeFabCubeCards(fabCube)

function card(name: string) {
  const found = cards.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`Missing ${name}`)
  return found
}

function facets(name: string) {
  return Object.fromEntries(card(name).facets.map(({ key, value }) => [key, value]))
}

describe("the-fab-cube normalizer", () => {
  it("maps a card, its printings, and its stats", () => {
    expect(cards).toHaveLength(fabCube.length)
    expect(card("Snatch (red)")).toMatchObject({
      identityNamespace: "fab-cube-card",
      cardId: "PHktCwKzLmBMwmCBwb7Cw",
      nameNormalized: "snatch (red)",
      printings: [
        {
          provider: "fab-cube",
          providerCardId: "PHktCwKzLmBMwmCBwb7Cw",
          printingId: "dwt7wcDTPQFrjmz7jgQcT",
          setCode: "1HP",
          collectorNumber: "1HP371",
          rarity: "R",
          typeLabel: "Generic Action - Attack",
          costLabel: "0",
          faces: [
            {
              name: "Snatch (red)",
              text: "When this hits, draw a card.",
              imageUrl:
                "https://storage.googleapis.com/fabmaster/media/images/1HP371.width-450.png",
            },
          ],
        },
        expect.anything(),
      ],
    })
    expect(facets("Snatch (red)")).toMatchObject({
      color: "Red",
      pitch: "1",
      power: "4",
      defense: "2",
    })
  })

  it("puts hero life and intelligence in facets", () => {
    expect(facets("Aurora, Shooting Star")).toMatchObject({
      health: "40",
      intelligence: "4",
      types: "Elemental, Runeblade, Hero",
    })
    expect(facets("Achilles Accelerator")).not.toHaveProperty("pitch")
  })

  it("reads each format's legality with bans ahead of living legend and legal flags", () => {
    expect(facets("Aurora, Shooting Star")).toMatchObject({
      "legality:cc": "living-legend",
      "legality:blitz": "not-legal",
    })
    expect(facets("Ball Lightning (red)")).toMatchObject({
      "legality:cc": "banned",
      "legality:blitz": "banned",
      "legality:commoner": "legal",
      "legality:silverAge": "banned",
      "legality:upf": "legal",
    })
    expect(facets("Awakening (blue)")).toMatchObject({ "legality:ll": "restricted" })
  })

  it("skips records without an identity or a printing", () => {
    expect(
      normalizeFabCubeCards([
        { name: "No id", printings: [] },
        { ...fabCube[0], printings: [] },
      ]),
    ).toEqual([])
    expect(normalizeFabCubeCards({ cards: fabCube })).toEqual([])
  })
})
