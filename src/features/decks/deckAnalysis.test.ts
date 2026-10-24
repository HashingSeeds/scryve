import {
  analyzeDeck,
  chanceOfLands,
  isRamp,
  karstenCheapSpell,
  landColors,
  manaValue,
} from "./deckAnalysis"
import type { DeckCard } from "./deckCards"

const emeriasCall = {
  manaCost: "{4}{W}{W}{W}",
  typeLine: "Sorcery // Land",
  oracleText: "Create two 4/4 white Angel Warrior creature tokens.\n—\n{T}: Add {W}.",
  faceDetails: JSON.stringify([
    {
      name: "Emeria's Call",
      manaCost: "{4}{W}{W}{W}",
      typeLine: "Sorcery",
      oracleText: "Create two 4/4 white Angel Warrior creature tokens.",
    },
    { name: "Emeria, Shattered Skyclave", typeLine: "Land", oracleText: "{T}: Add {W}." },
  ]),
}

describe("manaValue", () => {
  it.each([
    ["modal double-faced card uses its front face", emeriasCall, 7],
    [
      "split card adds both halves",
      { manaCost: "{1}{R} // {1}{U}", typeLine: "Instant // Instant" },
      4,
    ],
    [
      "adventure uses the creature half",
      { manaCost: "{2}{R} // {1}{R}", typeLine: "Creature — Giant // Instant — Adventure" },
      3,
    ],
    ["X counts as zero", { manaCost: "{X}{R}{R}", typeLine: "Sorcery" }, 2],
    ["hybrid takes the larger half", { manaCost: "{2/W}{2/W}{2/W}", typeLine: "Creature" }, 6],
    ["Phyrexian counts as one", { manaCost: "{1}{G/P}", typeLine: "Instant" }, 2],
  ])("%s", (_, details, expected) => {
    expect(manaValue(details)).toBe(expected)
  })
})

describe("landColors", () => {
  it("reads basic types, Add clauses, any-color text, and fetchable lands", () => {
    const basics = { basic: new Set(["G", "U"] as const), typed: new Set(["G", "U"] as const) }
    expect([...landColors({ typeLine: "Land — Plains Island", oracleText: "" }, basics)]).toEqual([
      "W",
      "U",
    ])
    expect([
      ...landColors({ typeLine: "Land", oracleText: "{T}: Add {B} or {R}." }, basics),
    ]).toEqual(["B", "R"])
    expect(
      landColors({ typeLine: "Land", oracleText: "{T}: Add one mana of any color." }, basics).size,
    ).toBe(5)
    expect([
      ...landColors(
        {
          typeLine: "Land",
          oracleText:
            "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.",
        },
        basics,
      ),
    ]).toEqual(["G", "U"])
    expect([
      ...landColors(
        {
          typeLine: "Land",
          oracleText:
            "{T}, Pay 1 life, Sacrifice this land: Search your library for a Plains or Island card, put it onto the battlefield, then shuffle.",
        },
        basics,
      ),
    ]).toEqual(["U"])
  })
})

describe("isRamp", () => {
  it.each([
    ["mana rock", { typeLine: "Artifact", oracleText: "{T}: Add {C}{C}." }, true],
    [
      "mana dork",
      { typeLine: "Creature — Bird", oracleText: "{T}: Add one mana of any color." },
      true,
    ],
    [
      "land search",
      {
        typeLine: "Sorcery",
        oracleText:
          "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.",
      },
      true,
    ],
    ["lands are not ramp", { typeLine: "Land", oracleText: "{T}: Add {G}." }, false],
    [
      "counters are not mana",
      { typeLine: "Instant", oracleText: "Put a +1/+1 counter on it." },
      false,
    ],
    [
      "basic land type search",
      {
        typeLine: "Creature — Elf Shaman",
        oracleText:
          "When this creature enters, search your library for a Forest card, put that card onto the battlefield, then shuffle.",
      },
      true,
    ],
    ["a spell with a land back face is not ramp", emeriasCall, false],
  ])("%s", (_, details, expected) => {
    expect(isRamp(details)).toBe(expected)
  })
})

describe("karstenCheapSpell", () => {
  it.each([
    [
      "Brainstorm draws",
      {
        manaCost: "{U}",
        typeLine: "Instant",
        oracleText:
          "Draw three cards, then put two cards from your hand on top of your library in any order.",
      },
      "draw",
    ],
    [
      "Ice-Fang Coatl draws when it enters",
      {
        manaCost: "{G}{U}",
        typeLine: "Snow Creature — Snake",
        oracleText: "Flash\nFlying\nWhen this creature enters, draw a card.",
      },
      "draw",
    ],
    [
      "Augur of Bolas is a creature that only looks",
      {
        manaCost: "{1}{U}",
        typeLine: "Creature — Merfolk Wizard",
        oracleText:
          "When this creature enters, look at the top three cards of your library. You may reveal an instant or sorcery card from among them and put it into your hand.",
      },
      undefined,
    ],
    [
      "Fateful Absence only investigates",
      {
        manaCost: "{1}{W}",
        typeLine: "Instant",
        oracleText:
          'Destroy target creature or planeswalker. Its controller investigates. (They create a Clue token. It\'s an artifact with "{2}, Sacrifice this token: Draw a card.")',
      },
      undefined,
    ],
    [
      "Manamorphose counts as draw, not ramp",
      {
        manaCost: "{1}{R/G}",
        typeLine: "Instant",
        oracleText: "Add two mana in any combination of colors.\nDraw a card.",
      },
      "draw",
    ],
    [
      "Sylvan Scrying searches for a land",
      {
        manaCost: "{1}{G}",
        typeLine: "Sorcery",
        oracleText:
          "Search your library for a land card, reveal it, put it into your hand, then shuffle.",
      },
      "ramp",
    ],
    [
      "Shambling Ghast only makes mana when it dies",
      {
        manaCost: "{B}",
        typeLine: "Creature — Zombie",
        oracleText:
          'When this creature dies, choose one —\n• Create a Treasure token. (It\'s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")',
      },
      undefined,
    ],
    [
      "one-mana cycling counts at any mana value",
      {
        manaCost: "{4}{U}{U}",
        typeLine: "Sorcery",
        oracleText: "Draw three cards.\nIslandcycling {1}",
      },
      "draw",
    ],
  ])("%s", (_, details, expected) => {
    expect(karstenCheapSpell(details)).toBe(expected)
  })
})

it("chanceOfLands matches the hypergeometric distribution", () => {
  expect(chanceOfLands(60, 24, 9, 3)).toBeCloseTo(0.789, 3)
  expect(chanceOfLands(60, 24, 7, 2, 5)).toBeCloseTo(0.84, 2)
})

describe("analyzeDeck", () => {
  const forest = { typeLine: "Basic Land — Forest", oracleText: "({T}: Add {G}.)" }
  const elves = { manaCost: "{G}", typeLine: "Creature — Elf Druid", oracleText: "{T}: Add {G}." }
  const bear = { manaCost: "{1}{G}", typeLine: "Creature — Bear" }
  const legionsLanding = {
    manaCost: "{W}",
    typeLine: "Enchantment // Land",
    faceDetails: JSON.stringify([
      {
        name: "Legion's Landing",
        manaCost: "{W}",
        typeLine: "Enchantment",
        oracleText: "When you attack with three or more creatures, transform Legion's Landing.",
      },
      { name: "Adanto, the First Fort", typeLine: "Legendary Land", oracleText: "{T}: Add {W}." },
    ]),
  }
  const byName: Record<string, object> = {
    "Legion's Landing": legionsLanding,
    "Forest": forest,
    "Llanowar Elves": elves,
    "Grizzly Bears": bear,
    "Emeria's Call": emeriasCall,
  }
  const card = (name: string, quantity: number, board?: DeckCard["board"]): DeckCard => ({
    name,
    quantity,
    board,
  })

  it("counts the main deck, skipping the sideboard and cards without data", () => {
    const analysis = analyzeDeck({
      format: "standard",
      cards: [
        card("Forest", 24),
        card("Llanowar Elves", 4),
        card("Grizzly Bears", 30),
        card("Emeria's Call", 1),
        card("Legion's Landing", 1),
        card("Unknown", 1),
        card("Grizzly Bears", 15, "sideboard"),
      ],
      details: (entry) => byName[entry.name],
    })
    expect(analysis).toMatchObject({
      missing: 1,
      lands: 24,
      modalLands: 1,
      ramp: 4,
      curve: [0, 5, 30, 0, 0, 0, 0, 1],
      colors: [
        { color: "W", pips: 4, sources: 1 },
        { color: "G", pips: 34, sources: 24 },
      ],
      onThePlay: true,
    })
    expect(analysis.averageManaValue).toBeCloseTo((5 + 60 + 7) / 36)
    expect(analysis.suggestedLands).toBeDefined()
    expect(analysis.landDrops).toHaveLength(5)
  })

  it("scales the land suggestion to 40-card and Brawl decks, and skips tiny decks", () => {
    const suggest = (format: string, cards: DeckCard[]) =>
      analyzeDeck({ format, cards, details: (entry) => byName[entry.name] })
    expect(suggest("limited", [card("Forest", 17), card("Grizzly Bears", 23)])).toMatchObject({
      suggestedLands: { low: 14, high: 18 },
      freeMulligan: false,
    })
    expect(
      suggest("brawl", [
        card("Grizzly Bears", 1, "commander"),
        card("Forest", 24),
        card("Grizzly Bears", 35),
      ]),
    ).toMatchObject({ suggestedLands: { low: 22, high: 26 }, freeMulligan: true })
    expect(
      suggest("standard", [card("Forest", 10), card("Grizzly Bears", 20)]).suggestedLands,
    ).toBe(undefined)
  })

  describe("unfinished decks", () => {
    const run = (format: string, cards: DeckCard[]) =>
      analyzeDeck({ format, cards, details: (entry) => byName[entry.name] })

    it("flags a Commander deck below 100 and computes odds from the cards listed", () => {
      const analysis = run("commander", [card("Forest", 17), card("Grizzly Bears", 20)])
      expect(analysis.incomplete).toEqual({ count: 37, size: 100 })
      expect(analysis.needsCommander).toBe(true)
      expect(analysis.mulligans?.keep).toBeCloseTo(chanceOfLands(37, 17, 7, 2, 5))
    })

    it("counts the commander toward the 100 and clears the nudge", () => {
      const analysis = run("commander", [
        card("Grizzly Bears", 1, "commander"),
        card("Forest", 40),
        card("Grizzly Bears", 59),
      ])
      expect(analysis.incomplete).toBeUndefined()
      expect(analysis.needsCommander).toBe(false)
    })

    it.each([
      ["standard", 59, true],
      ["standard", 60, false],
      ["standard", 75, false],
      ["limited", 39, true],
      ["limited", 40, false],
      ["brawl", 59, true],
    ])("%s with %i main cards is incomplete: %s", (format, count, incomplete) => {
      const analysis = run(format, [
        card("Grizzly Bears", count),
        card("Grizzly Bears", 9, "sideboard"),
      ])
      expect(analysis.incomplete !== undefined).toBe(incomplete)
    })

    it("only asks for a commander in formats that have one", () => {
      expect(run("standard", [card("Forest", 20)]).needsCommander).toBe(false)
      expect(run("brawl", [card("Forest", 20)]).needsCommander).toBe(true)
    })

    it("does not guess a size for an unknown format", () => {
      expect(run("mystery", [card("Forest", 20)]).incomplete).toBeUndefined()
    })
  })

  it("orders colors W, U, B, R, G regardless of card order", () => {
    const cost = (symbol: string) => ({ manaCost: `{${symbol}}`, typeLine: "Creature" })
    const colors = analyzeDeck({
      format: "standard",
      cards: ["G", "R", "B", "U", "W"].map((symbol) => card(symbol, 1)),
      details: (entry) => cost(entry.name),
    }).colors.map(({ color }) => color)
    expect(colors).toEqual(["W", "U", "B", "R", "G"])
  })
})
