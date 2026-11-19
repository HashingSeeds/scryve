import {
  findRules,
  matchExcerpt,
  ruleReferences,
  searchRules,
  type ComprehensiveRules,
} from "./comprehensiveRules"
import { MAGIC_RULE_REFERENCE, parseMagicRules } from "./magicRules"

const SOURCE = [
  "﻿Magic: The Gathering Comprehensive Rules",
  " ",
  "These rules are effective as of September 25, 2026.",
  " ",
  "Contents",
  "1. Game Concepts",
  "100. General",
  "Glossary",
  "Credits",
  " ",
  "1. Game Concepts",
  " ",
  "100. General",
  " ",
  "100.1. These Magic rules apply to any Magic game.",
  " ",
  "100.1a A two-player game begins with two players. See rule 103.8a.",
  "Example: A game of two players.\u2028\u00a0\u00a0It ends.",
  " ",
  "100.10. Rule ten.   Its second paragraph.",
  " ",
  "100.10aa Rule ten, double letter.",
  " ",
  "Glossary",
  " ",
  "Trample",
  "A keyword ability. See rule 702.19.",
  " ",
  "Ability",
  "1. Text on an object.",
  "2. An ability on the stack.",
  " ",
  "Credits",
  " ",
  "Design: Someone",
  " ",
  "Published by Wizards of the Coast LLC.",
].join("\r\n")

describe("parseMagicRules", () => {
  const rules = parseMagicRules(SOURCE)

  it("reads chapters, sections, rules, examples, glossary, and the closing notice", () => {
    expect(rules).toMatchObject({
      effectiveDate: "September 25, 2026",
      chapters: [{ id: "1", title: "Game Concepts", sections: [{ id: "100", title: "General" }] }],
      glossary: [
        { term: "Trample", text: "A keyword ability. See rule 702.19." },
        { term: "Ability", text: "1. Text on an object.\n2. An ability on the stack." },
      ],
      notice: ["Credits", "Design: Someone", "Published by Wizards of the Coast LLC."],
    })
    expect(rules?.chapters[0].sections[0].rules).toEqual([
      { id: "100.1", text: "These Magic rules apply to any Magic game.", examples: [] },
      {
        id: "100.1a",
        text: "A two-player game begins with two players. See rule 103.8a.",
        examples: ["Example: A game of two players.\nIt ends."],
      },
      { id: "100.10", text: "Rule ten.\nIts second paragraph.", examples: [] },
      { id: "100.10aa", text: "Rule ten, double letter.", examples: [] },
    ])
  })

  it("rejects text that is not the Comprehensive Rules", () => {
    expect(parseMagicRules("<html>Not found</html>")).toBeUndefined()
  })

  it("finds a rule with its lettered subrules, not its numeric neighbors", () => {
    expect(findRules(rules!, "100.1a")?.rules.map((rule) => rule.id)).toEqual(["100.1", "100.1a"])
    expect(findRules(rules!, "100.10")?.rules.map((rule) => rule.id)).toEqual([
      "100.10",
      "100.10aa",
    ])
    expect(findRules(rules!, "100")?.rules).toHaveLength(4)
    expect(findRules(rules!, "999.1")).toBeUndefined()
    expect(findRules(rules!, "100.1z")).toBeUndefined()
  })

  it("searches glossary terms first, then rule numbers and text", () => {
    expect(
      searchRules(rules!, "ab").map((result) =>
        result.kind === "term" ? result.entry.term : result.rule.id,
      ),
    ).toEqual(["Ability"])
    expect(
      searchRules(rules!, "100.10").map((result) =>
        result.kind === "term" ? result.entry.term : result.rule.id,
      ),
    ).toEqual(["100.10", "100.10aa"])
  })
})

it("ruleReferences links rule numbers and bare sections named as rules", () => {
  expect(
    ruleReferences(
      "See rule 103.8a and rules 601.2a–f. See rule 903, “Commander.”",
      MAGIC_RULE_REFERENCE,
    ),
  ).toEqual([
    "See rule ",
    { id: "103.8a" },
    " and rules ",
    { id: "601.2a" },
    "–f. See rule ",
    { id: "903" },
    ", “Commander.”",
  ])
  expect(ruleReferences("A starting life total of 100.", MAGIC_RULE_REFERENCE)).toEqual([
    "A starting life total of 100.",
  ])
})

describe("matchExcerpt", () => {
  it("starts a long rule near the match, at a word", () => {
    const text = `${"Blocking creatures ".repeat(5)}must be untapped.`
    expect(matchExcerpt(text, "UNTAPPED", 20)).toEqual({
      before: "…creatures must be ",
      match: "untapped",
      after: ".",
    })
  })

  it("keeps the whole text when the match is a rule number", () => {
    expect(matchExcerpt("Trample is a static ability.", "702.19")).toEqual({
      before: "Trample is a static ability.",
      match: "",
      after: "",
    })
  })
})

describe("searchRules ranking", () => {
  const rule = (id: string, text: string) => ({ id, text, examples: [] })
  const rules: ComprehensiveRules = {
    chapters: [
      {
        id: "5",
        title: "Turn Structure",
        sections: [
          {
            id: "509",
            title: "Declare Blockers Step",
            rules: [
              rule("509.1", "The defending player declares blockers."),
              rule("509.1a", "The defending player chooses which untapped creatures block."),
              rule("509.1b", "Check restrictions."),
            ],
          },
        ],
      },
      {
        id: "7",
        title: "Additional Rules",
        sections: [
          {
            id: "701",
            title: "Keyword Actions",
            rules: [
              rule("701.8", "Destroy"),
              rule("701.8a", "To destroy a permanent, move it to its owner's graveyard."),
              rule("701.8b", "Effects can destroy all creatures at once."),
            ],
          },
          {
            id: "702",
            title: "Keyword Abilities",
            rules: [
              rule("702.2", "Deathtouch"),
              rule("702.2b", "A creature dealt damage by a source with deathtouch is destroyed."),
            ],
          },
        ],
      },
      {
        id: "9",
        title: "Casual Variants",
        sections: [
          {
            id: "903",
            title: "Commander",
            rules: [
              rule("903.3", "Each deck has a commander."),
              rule("903.8", "A player may cast a commander from the command zone for 2 more."),
            ],
          },
        ],
      },
    ],
    glossary: [
      { term: "Commander Tax", text: "The extra cost to cast a commander. See rule 903.8." },
    ],
    notice: [],
    slang: { wrath: "destroy all creatures" },
    references: MAGIC_RULE_REFERENCE,
  }
  const ids = (query: string) =>
    searchRules(rules, query).map((result) =>
      result.kind === "term" ? result.entry.term : result.rule.id,
    )

  it("matches the words of a question and ranks the rule that has its rarest ones first", () => {
    expect(ids("does deathtouch destroy creatures")[0]).toBe("702.2b")
  })

  it("reads player slang as the rules' wording", () => {
    expect(ids("wrath")[0]).toBe("701.8b")
  })

  it("forgives one typo in a word the rules never use", () => {
    expect(ids("deathtuch")[0]).toBe("702.2")
  })

  it("lists one result per rule screen, shown by the subrule that says the words", () => {
    expect(ids("untapped blockers")).toEqual(["509.1a"])
  })

  it("keeps a rule while the player is partway through typing its word", () => {
    const flying: ComprehensiveRules = {
      chapters: [
        {
          id: "7",
          title: "Additional Rules",
          sections: [
            {
              id: "702",
              title: "Keyword Abilities",
              rules: [
                rule("702.9", "Flying"),
                rule("702.9b", "A creature with flying can't be blocked."),
              ],
            },
          ],
        },
      ],
      glossary: [],
      notice: [],
    }
    expect(
      searchRules(flying, "flyi").map((result) => result.kind === "rule" && result.rule.id),
    ).toEqual(["702.9"])
  })

  it("lifts the rule a glossary term in the query cites", () => {
    expect(ids("commander tax")).toEqual(["Commander Tax", "903.8", "903.3"])
  })

  it("goes straight to a rule number in either game's format, and finds nothing for punctuation", () => {
    const fab: ComprehensiveRules = {
      chapters: [
        {
          id: "1",
          title: "Game Concepts",
          sections: [
            {
              id: "1.0",
              title: "General",
              rules: [rule("1.0.1", "Rules."), rule("1.0.1a", "More.")],
            },
          ],
        },
      ],
      glossary: [{ term: "Go again", text: "An ability keyword.[8.3.5]" }],
      notice: [],
    }
    expect(
      searchRules(fab, "1.0.1a").map((result) => result.kind === "rule" && result.rule.id),
    ).toEqual(["1.0.1a"])
    expect(searchRules(fab, "???")).toEqual([])
  })

  it("marks the first matched word in an excerpt", () => {
    expect(matchExcerpt("The defending player chooses blockers.", "can my creature block")).toEqual(
      {
        before: "The defending player chooses ",
        match: "blockers",
        after: ".",
      },
    )
    expect(matchExcerpt("Put a +1/+1 counter on it.", "+1/+1 counters").match).toBe("+1/+1")
  })
})
