import type { ComprehensiveRules } from "./comprehensiveRules"
import { magicKeyword } from "./magicKeywords"

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
