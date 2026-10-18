import { findRules, ruleReferences, searchRules } from "./comprehensiveRules"
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
