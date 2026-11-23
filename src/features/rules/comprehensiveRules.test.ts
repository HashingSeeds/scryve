import {
  definingRule,
  excerptSegments,
  findRules,
  ruleContext,
  rulePreviewText,
  ruleReferences,
  ruleTopic,
  prepareSearchIndex,
  searchRules,
  type ComprehensiveRules,
} from "./comprehensiveRules"
import { MAGIC_RULE_REFERENCE, parseMagicRules } from "./magicRules"
import { finish } from "./slices"

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
  const rules = finish(parseMagicRules(SOURCE))

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
    expect(finish(parseMagicRules("<html>Not found</html>"))).toBeUndefined()
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

  it("searches glossary terms, rule numbers and text", () => {
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

  it("lets a search finish the index a board is preparing", async () => {
    const fresh = finish(parseMagicRules(SOURCE))!
    const preparing = prepareSearchIndex(fresh)
    expect(searchRules(fresh, "100.10")).toEqual(searchRules(rules!, "100.10"))
    await expect(preparing).resolves.toBeUndefined()
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

describe("excerptSegments", () => {
  it("starts a long rule near the match, at a word", () => {
    const text = `${"Blocking creatures ".repeat(5)}must be untapped.`
    expect(excerptSegments(text, new Set(["untap"]), undefined, 20)).toEqual([
      { text: "…", matched: false },
      { text: "creatures must be ", matched: false },
      { text: "untapped", matched: true },
      { text: ".", matched: false },
    ])
  })

  it("keeps short rules uncropped even when the match is near the end", () => {
    const text = "A commander cast from the command zone costs an additional {2} (commander tax)."
    expect(excerptSegments(text, new Set(["tax"]), undefined, 60)).toEqual([
      {
        text: "A commander cast from the command zone costs an additional {2} (commander ",
        matched: false,
      },
      { text: "tax", matched: true },
      { text: ").", matched: false },
    ])
  })

  it("keeps the whole text unhighlighted when no terms were matched", () => {
    expect(excerptSegments("Trample is a static ability.")).toEqual([
      { text: "Trample is a static ability.", matched: false },
    ])
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
      { term: "Declare Blockers Step", text: "Part of the turn. See rule 509." },
      { term: "Commander", text: "A casual variant. See rule 903." },
    ],
    notice: [],
    slang: { wrath: "destroy all creatures" },
    phrasings: { "903.8": ["recast general"] },
    references: MAGIC_RULE_REFERENCE,
  }
  const ids = (query: string) =>
    searchRules(rules, query).map((result) =>
      result.kind === "term" ? result.entry.term : result.rule.id,
    )

  it("puts a glossary term first only when the search names it in full", () => {
    expect(ids("declare blockers step")[0]).toBe("Declare Blockers Step")
    expect(ids("blockers").indexOf("Declare Blockers Step")).toBeGreaterThan(0)
    expect(ids("commander")[0]).toBe("Commander")
  })

  it("matches the words of a question and ranks the rule that has its rarest ones first", () => {
    expect(ids("does deathtouch destroy creatures")[0]).toBe("702.2b")
  })

  it("reads player slang as the rules' wording", () => {
    expect(ids("wrath")[0]).toBe("701.8b")
  })

  it("reads partly typed slang as the rules' wording", () => {
    expect(ids("wrat")[0]).toBe("701.8b")
  })

  it("finds a rule by a player's phrasing that shares none of its words", () => {
    expect(ids("recast general")[0]).toBe("903.8")
  })

  it("forgives one typo in a word the rules never use", () => {
    expect(ids("deathtuch")[0]).toBe("702.2")
  })

  it("ranks a word typed in full over longer words it starts", () => {
    const draw: ComprehensiveRules = {
      chapters: [
        {
          id: "1",
          title: "Game Concepts",
          sections: [
            { id: "100", title: "General", rules: [rule("100.1", "Drawbacks.")] },
            { id: "101", title: "Turns", rules: [rule("101.1", "Each player may draw a card.")] },
          ],
        },
      ],
      glossary: [],
      notice: [],
    }
    expect(searchRules(draw, "draw")[0]).toMatchObject({ rule: { id: "101.1" } })
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
      glossary: [{ term: "Forestcycling", text: "See rule 702.9." }],
      notice: [],
    }
    expect(searchRules(flying, "forestcycli")[0]).toMatchObject({ kind: "term" })
    expect(
      searchRules(flying, "flyi").map((result) => result.kind === "rule" && result.rule.id),
    ).toEqual(["702.9"])
  })

  it("omits rules whose screens are already opened by a higher-ranked glossary term", () => {
    expect(ids("commander tax")).toEqual(["Commander Tax", "903.3"])
    expect(ids("blockers")).toContain("509.1")
    expect(ids("903.8")).toEqual(["903.8"])
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

  it("returns matched stems from searchRules so excerpts highlight query, slang, and +1/+1 terms", () => {
    const hit = searchRules(rules, "wrath")[0]
    expect(hit).toMatchObject({ kind: "rule", rule: { id: "701.8b" } })
    const segments =
      hit?.kind === "rule" ? excerptSegments(hit.rule.text, hit.matched, hit.partial) : []
    expect(segments.filter((s) => s.matched).map((s) => s.text.toLowerCase())).toEqual([
      "destroy",
      "all",
      "creatures",
    ])

    const ptSegments = excerptSegments("Put a +1/+1 counter on it.", new Set(["+1/+1", "counter"]))
    expect(ptSegments.filter((s) => s.matched).map((s) => s.text)).toEqual(["+1/+1", "counter"])
  })

  it("picks the defining subrule over short boilerplate on concept queries, and keeps specific subrules on narrower queries", () => {
    const keywords: ComprehensiveRules = {
      chapters: [
        {
          id: "7",
          title: "Additional Rules",
          sections: [
            {
              id: "702",
              title: "Keyword Abilities",
              rules: [
                rule("702.19", "Trample"),
                rule(
                  "702.19a",
                  "Trample is a static ability that modifies the rules for assigning an attacking creature's combat damage.",
                ),
                rule(
                  "702.19g",
                  "Multiple instances of trample on the same creature are redundant. Multiple instances of trample over planeswalkers are redundant.",
                ),
              ],
            },
          ],
        },
      ],
      glossary: [],
      notice: [],
      references: MAGIC_RULE_REFERENCE,
    }
    const ruleIds = (q: string) =>
      searchRules(keywords, q)
        .filter((r) => r.kind === "rule")
        .map((r) => r.rule.id)

    expect(ruleIds("trample")).toEqual(["702.19a"])
    expect(ruleIds("multiple trample")).toEqual(["702.19g"])
    expect(ruleContext(keywords, "702.19g")?.topic).toBe("Trample")
    expect(definingRule(ruleContext(keywords, "702.19")!.group).id).toBe("702.19a")

    const fabHeading = rule("8.3.5", "Go again\nGo again is a special resolution ability.")
    expect(ruleTopic(fabHeading)).toBe("Go again")
    expect(rulePreviewText([fabHeading], fabHeading)).toBe(
      "Go again is a special resolution ability.",
    )
  })

  it("matches rule numbers prefixed with rule/§ and prioritizes base rules on bare section numbers", () => {
    expect(ids("rule 701.8")).toEqual(["701.8", "701.8a", "701.8b"])
    expect(ids("§903.8")).toEqual(["903.8"])
    expect(ids("701")).toEqual(["701.8", "701.8a", "701.8b"])
    expect(ids("903")).toEqual(["903.3", "903.8"])

    const multiBase: ComprehensiveRules = {
      chapters: [
        {
          id: "7",
          title: "Additional Rules",
          sections: [
            {
              id: "702",
              title: "Keyword Abilities",
              rules: [
                rule("702.2", "Deathtouch"),
                rule("702.2a", "Deathtouch is a static ability."),
                rule("702.3", "Defender"),
              ],
            },
          ],
        },
      ],
      glossary: [],
      notice: [],
      references: MAGIC_RULE_REFERENCE,
    }
    expect(
      searchRules(multiBase, "702")
        .filter((r) => r.kind === "rule")
        .map((r) => r.rule.id),
    ).toEqual(["702.2", "702.3", "702.2a"])
  })
})
