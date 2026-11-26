import { findRules, type ComprehensiveRules } from "./comprehensiveRules"

/**
 * why: a keyword's rule opens with its name, alone in Magic ("702.9 Flying") and as a title line
 * in Flesh and Blood ("8.3.5 Go again"), so both games find it the same way. A card's value
 * ("Arcane Barrier 1") is dropped, since the rule covers every value.
 */
function sectionKeyword(sections: ReadonlySet<string>, glossaryReference: RegExp) {
  return (rules: ComprehensiveRules, keyword: string) => {
    const name = keyword
      .trim()
      .toLowerCase()
      .replace(/\s+\d+$/, "")
    const rule = rules.chapters
      .flatMap((chapter) => chapter.sections)
      .filter((section) => sections.has(section.id))
      .flatMap((section) => section.rules)
      .find(
        (candidate) =>
          /\.\d+$/.test(candidate.id) && candidate.text.split("\n", 1)[0].toLowerCase() === name,
      )
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
export const fabKeyword = sectionKeyword(new Set(["8.3", "8.4", "8.5"]), /(?:\[[^\]]+\])+$/)

export type KeywordRule = NonNullable<ReturnType<typeof magicKeyword>>
