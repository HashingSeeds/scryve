import { findRules, type ComprehensiveRules } from "./comprehensiveRules"

/**
 * why: a keyword's rule opens with its name, alone in Magic ("702.9 Flying") and as a title line
 * in Flesh and Blood ("8.3.5 Go again"), so both games find it the same way. A card's value
 * ("Arcane Barrier 1", "Ward X") is dropped, since the rule covers every value.
 */
function sectionKeyword(
  sections: ReadonlySet<string>,
  glossaryReference: RegExp,
  names: (keyword: string) => string[] = (keyword) => [keyword],
) {
  return (rules: ComprehensiveRules, keyword: string) => {
    const titled = new Map(
      rules.chapters
        .flatMap((chapter) => chapter.sections)
        .filter((section) => sections.has(section.id))
        .flatMap((section) => section.rules)
        .filter((rule) => /\.\d+$/.test(rule.id))
        .map(
          (rule) =>
            [
              rule.text
                .split("\n", 1)[0]
                .replace(/\s*\[.*\]$/, "")
                .toLowerCase(),
              rule,
            ] as const,
        )
        .reverse(),
    )
    const printed = keyword
      .trim()
      .toLowerCase()
      .replace(/\s+(?:\d+|x)$/, "")
    const name = names(printed).find((candidate) => titled.has(candidate))
    const rule = name && titled.get(name)
    if (!rule) return undefined
    return {
      id: rule.id,
      definition: rules.glossary
        .find((entry) => entry.term.toLowerCase().split(/,\s*/).includes(name))
        ?.text.replace(glossaryReference, ""),
      rules: findRules(rules, rule.id)?.rules.filter((sub) => sub.id !== rule.id) ?? [],
    }
  }
}

export const magicKeyword = sectionKeyword(new Set(["701", "702"]), /\s*See rules? [\s\S]*$/)

/** why: FaB prints a keyword's element or hero around it ("Ice Fusion", "Essence of Lightning", "Kano Specialization"), and the rule is titled with the keyword alone. */
export const fabKeyword = sectionKeyword(
  new Set(["8.3", "8.4", "8.5"]),
  /(?:\[[^\]]+\])+$/,
  (keyword) => {
    const words = keyword.split(" ")
    return [keyword, words[0], words[words.length - 1]]
  },
)

export type KeywordRule = NonNullable<ReturnType<typeof magicKeyword>>
