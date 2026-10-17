import { findRules, ruleReferences, searchRules } from "./comprehensiveRules"
import { FAB_RULE_REFERENCE, parseFabRules } from "./fabRules"

const SOURCE = [
  "﻿1 Preface",
  "The version of this document is in the form MAJOR.MINOR.PATCH.",
  "1 Game Concepts",
  "1.0 General",
  "1.0.1 The rules in this document apply to any game of Flesh and Blood.",
  "1.0.1a If an effect directly contradicts a rule contained in this document, the effect supersedes that rule.",
  "1.0.2 A restriction takes precedence over any requirement or allowance, subject to [1.0.1a].",
  'Example: "They can\'t defend this with equipment" is a restriction.',
  "Note: Cards printed before 2022 used other wording.",
  "1.10 Game State",
  "1.10.2 A game state action happens when the game state changes.",
  "1 Glossary",
  "1.-1.3 Ability",
  "An object property that generates effects that influence the game.[1.7]",
  "1.-1.11 Additional Cost",
  "ability: A meta-static ability that adds a cost to playing a card.[5.4.4a] ",
  "phrase: An effect that adds a cost to playing a card.[5.1.3]",
  "2 Object Properties",
  "2.5 Life",
  "2.5.1 Life is a numeric property of an object, which represents the starting life total of that object.",
  "2 Acknowledgments",
  "2.0 Legend Story Studios",
  "James White (Flesh and Blood Creator)",
  "2.1 Community Contributors",
  "Jake Armes",
  "© 2019 Legend Story Studios. All Rights Reserved.",
  "3 Zones",
  "3.0 General",
  "3.0.1 A zone is a collection of objects.",
].join("\r\n")

describe("parseFabRules", () => {
  const rules = parseFabRules(SOURCE)

  it("keeps rule chapters and leaves out the preface and acknowledgments", () => {
    expect(rules?.chapters.map(({ id, title }) => `${id} ${title}`)).toEqual([
      "1 Game Concepts",
      "2 Object Properties",
      "3 Zones",
    ])
    expect(rules?.chapters[1].sections.map((section) => section.id)).toEqual(["2.5"])
    expect(rules?.notice).toEqual(["© 2019 Legend Story Studios. All Rights Reserved."])
    expect(rules?.effectiveDate).toBeUndefined()
  })

  it("reads lettered subrules, examples, and notes", () => {
    expect(findRules(rules!, "1.0.1a")?.rules.map((rule) => rule.id)).toEqual(["1.0.1", "1.0.1a"])
    expect(findRules(rules!, "1.0.2")?.rules).toEqual([
      {
        id: "1.0.2",
        text: "A restriction takes precedence over any requirement or allowance, subject to [1.0.1a].",
        examples: [
          'Example: "They can\'t defend this with equipment" is a restriction.\nNote: Cards printed before 2022 used other wording.',
        ],
      },
    ])
    expect(findRules(rules!, "1.10.2")?.section.title).toBe("Game State")
    expect(findRules(rules!, "1.1.2")).toBeUndefined()
  })

  it("reads glossary terms with every definition line", () => {
    expect(rules?.glossary).toEqual([
      {
        term: "Ability",
        text: "An object property that generates effects that influence the game.[1.7]",
      },
      {
        term: "Additional Cost",
        text: "ability: A meta-static ability that adds a cost to playing a card.[5.4.4a]\nphrase: An effect that adds a cost to playing a card.[5.1.3]",
      },
    ])
    expect(searchRules(rules!, "additional")[0]).toMatchObject({ kind: "term" })
  })

  it("rejects a page that is not the rules", () => {
    expect(parseFabRules("<html>Not found</html>")).toBeUndefined()
  })
})

it("links bracketed rule and section citations", () => {
  expect(ruleReferences("Subject to [1.0.1a].[8.3] Not 3.5 damage.", FAB_RULE_REFERENCE)).toEqual([
    "Subject to [",
    { id: "1.0.1a" },
    "].[",
    { id: "8.3" },
    "] Not 3.5 damage.",
  ])
})
