import type { ComprehensiveRules } from "./comprehensiveRules"
import { fabKeyword, magicKeyword } from "./keywords"

const rules: ComprehensiveRules = {
  chapters: [
    {
      id: "7",
      title: "Additional Rules",
      sections: [
        {
          id: "702",
          title: "Keyword Abilities",
          rules: [
            { id: "702.9", text: "Flying", examples: [] },
            { id: "702.9a", text: "Flying is an evasion ability.", examples: [] },
            { id: "702.9b", text: "A creature with flying can't be blocked.", examples: [] },
            { id: "702.10", text: "Haste", examples: [] },
            { id: "702.33", text: "Kicker", examples: [] },
          ],
        },
      ],
    },
  ],
  glossary: [
    {
      term: "Flying",
      text: "A keyword ability that restricts how a creature may be blocked. See rule 702.9, “Flying.”",
    },
    {
      term: "Kicker, Kicked",
      text: "A keyword ability that represents an optional cost. See rule 702.33.",
    },
  ],
  notice: [],
}

it("defines a keyword from its glossary entry and its subrules", () => {
  expect(magicKeyword(rules, "flying")).toEqual({
    id: "702.9",
    definition: "A keyword ability that restricts how a creature may be blocked.",
    rules: [rules.chapters[0].sections[0].rules[1], rules.chapters[0].sections[0].rules[2]],
  })
})

it("skips words that are not a keyword ability or action", () => {
  expect(magicKeyword(rules, "Landfall")).toBeUndefined()
})

it("finds a glossary entry whose heading lists variants", () => {
  expect(magicKeyword(rules, "Kicker")?.definition).toBe(
    "A keyword ability that represents an optional cost.",
  )
})

it("finds a Flesh and Blood keyword by its rule's title line", () => {
  const fab: ComprehensiveRules = {
    chapters: [
      {
        id: "8",
        title: "Keywords",
        sections: [
          {
            id: "8.3",
            title: "Ability Keywords",
            rules: [
              { id: "8.3.5", text: "Go again\nGo again means gain 1 action point.", examples: [] },
              { id: "8.3.5a", text: "It resolves last.", examples: [] },
            ],
          },
        ],
      },
    ],
    glossary: [{ term: "Go again", text: "An ability keyword that gives an action point.[8.3.5]" }],
    notice: [],
  }
  expect(fabKeyword(fab, "Go again")).toEqual({
    id: "8.3.5",
    definition: "An ability keyword that gives an action point.",
    rules: [fab.chapters[0].sections[0].rules[1]],
  })
})

it("finds a keyword whose card gives it a value", () => {
  expect(magicKeyword(rules, "Kicker 2")?.id).toBe("702.33")
  expect(magicKeyword(rules, "Kicker X")?.id).toBe("702.33")
})

it("finds a Flesh and Blood keyword printed with its element or hero", () => {
  const fab: ComprehensiveRules = {
    chapters: [
      {
        id: "8",
        title: "Keywords",
        sections: [
          {
            id: "8.3",
            title: "Ability Keywords",
            rules: [
              { id: "8.3.7", text: "Specialization\nOnly that hero.", examples: [] },
              { id: "8.3.16", text: "Essence\nAn essence of a talent.", examples: [] },
              { id: "8.3.17", text: "Fusion\nReveal a card.", examples: [] },
            ],
          },
        ],
      },
    ],
    glossary: [],
    notice: [],
  }
  expect(fabKeyword(fab, "Ice Fusion")?.id).toBe("8.3.17")
  expect(fabKeyword(fab, "Essence of Lightning")?.id).toBe("8.3.16")
  expect(fabKeyword(fab, "Kano Specialization")?.id).toBe("8.3.7")
})
