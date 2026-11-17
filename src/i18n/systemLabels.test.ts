import { modeProductName } from "@/features/game/playSystems"

import systems from "./en/systems"
import { PLANAR_DECKS, SCHEME_DECKS } from "../../convex/lib/modeDecks"
import { SYSTEMS } from "../../convex/lib/systems/definitions"

const definitions = Object.entries(SYSTEMS)

describe("game system labels", () => {
  it("names every game and format in English exactly as its definition does", () => {
    const names = Object.fromEntries(
      definitions.map(([system, { shortLabel, formats }]) => [
        system,
        { game: shortLabel, formats: Object.fromEntries(formats.map((f) => [f.id, f.label])) },
      ]),
    )
    const translated = Object.fromEntries(
      Object.keys(names).map((system) => [
        system,
        {
          game: systems.gameName[system as keyof typeof systems.gameName],
          formats: systems.formatName[system as keyof typeof systems.formatName],
        },
      ]),
    )

    expect(translated).toEqual(names)
  })

  it("names every Planechase and Archenemy deck and product in English as its definition does", () => {
    const decks = [...PLANAR_DECKS, ...SCHEME_DECKS]
    const productIds = (deck: (typeof decks)[number]) => deck.id.split("-")[0]

    expect(systems.modeDeck).toEqual(Object.fromEntries(decks.map((deck) => [deck.id, deck.name])))
    expect(Object.keys(systems.modeProduct)).toEqual([...new Set(decks.map(productIds))])
    expect(decks.map(modeProductName)).toEqual(decks.map((deck) => deck.product))
  })

  it("translates every counter and designation instead of showing its English label", () => {
    const items = definitions.flatMap(([system, { table }]) =>
      [...table.counters, ...table.designations].map(({ id }) => `${system}.${id}`),
    )
    const untranslated = items.filter(
      (item) => !Object.hasOwn(systems.tableItem, item.split(".")[1]),
    )

    expect(untranslated).toEqual([])
  })

  it("translates every deck section and format blurb", () => {
    const untranslated = definitions.flatMap(([system, { formats }]) =>
      formats.flatMap((format) => {
        const { id, sections } = format
        const blurb = "blurb" in format ? format.blurb : undefined
        return [
          ...sections
            .filter(
              (section) => section.id !== "main" && !Object.hasOwn(systems.section, section.id),
            )
            .map((section) => `${system}.${id} section ${section.id}`),
          ...(blurb &&
          !Object.hasOwn(systems.formatBlurb[system as keyof typeof systems.formatBlurb] ?? {}, id)
            ? [`${system}.${id} blurb`]
            : []),
        ]
      }),
    )

    expect(untranslated).toEqual([])
  })
})
