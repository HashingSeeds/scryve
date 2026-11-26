import { findRules, type ComprehensiveRules } from "./comprehensiveRules"

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
      definition:
        rules.glossary
          .find((entry) => entry.term.toLowerCase().split(/,\s*/).includes(name))
          ?.text.replace(glossaryReference, "") ??
        (rule.text.split("\n").slice(1).join("\n") || undefined),
      rules: findRules(rules, rule.id)?.rules.filter((sub) => sub.id !== rule.id) ?? [],
    }
  }
}

export const magicKeyword = sectionKeyword(new Set(["701", "702"]), /\s*See rules? [\s\S]*$/)

export const fabKeyword = sectionKeyword(
  new Set(["8.3", "8.4", "8.5"]),
  /(?:\[[^\]]+\])+$/,
  (keyword) => {
    const words = keyword.split(" ")
    return [keyword, words[0], words[words.length - 1]]
  },
)

export type KeywordRule = NonNullable<ReturnType<typeof magicKeyword>>
