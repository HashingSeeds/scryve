import { canonicalDecklist, deckFingerprint } from "./deckFingerprint"
import vectors from "./fixtures/deckFingerprint.json"
import { integrationFor } from "./integrations"
import { SYSTEM_IDS } from "./systems"

it.each(vectors)("canonical v1 vector $hex", async ({ cards, canonical, hex }) => {
  expect(canonicalDecklist(cards)).toBe(canonical)
  expect(await deckFingerprint(cards)).toBe(`v1:${hex}`)
  expect(canonicalDecklist([...cards].reverse())).toBe(canonical)
  expect(
    canonicalDecklist(
      cards.map((card) => ({
        ...card,
        printingId: "different",
        scryfallId: "art",
        imageUrl: "https://art.example",
      })),
    ),
  ).toBe(canonical)
})

it("separates namespaces, games, boards and gameplay choices but uses names for unresolved cards", () => {
  const card = { game: "mtg", cardId: "one", name: "Name", quantity: 1 }
  const base = canonicalDecklist([card])
  for (const change of [
    { game: "pokemon" },
    { identityNamespace: "other" },
    { section: "sideboard" },
    { commanderColor: "W" },
  ])
    expect(canonicalDecklist([{ ...card, ...change }])).not.toBe(base)
  expect(canonicalDecklist([{ name: "  A\tNAME  ", quantity: 1 }])).toBe(
    'v1:[["mtg","scryfall-oracle",["unresolved","a name"],"main","",1]]',
  )
})

it.each(SYSTEM_IDS)("fingerprints a %s card the same with or without its namespace", (game) => {
  const card = { game, cardId: "one", name: "Name", quantity: 1 }
  expect(canonicalDecklist([card])).toBe(
    canonicalDecklist([{ ...card, identityNamespace: integrationFor(game).identityNamespace }]),
  )
})
