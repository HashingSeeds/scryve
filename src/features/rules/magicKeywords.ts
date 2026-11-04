import { findRules, type ComprehensiveRules } from "./comprehensiveRules"

const KEYWORD_SECTIONS = new Set(["701", "702"])
const SEE_RULE = /\s*See rules? [\s\S]*$/

export type KeywordRule = NonNullable<ReturnType<typeof magicKeyword>>

export function magicKeyword(rules: ComprehensiveRules, keyword: string) {
  const name = keyword.trim().toLowerCase()
  const rule = rules.chapters
    .flatMap((chapter) => chapter.sections)
    .filter((section) => KEYWORD_SECTIONS.has(section.id))
    .flatMap((section) => section.rules)
    .find((candidate) => /\.\d+$/.test(candidate.id) && candidate.text.toLowerCase() === name)
  if (!rule) return undefined
  return {
    id: rule.id,
    definition: rules.glossary
      .find((entry) => entry.term.toLowerCase().split(/,\s*/).includes(name))
      ?.text.replace(SEE_RULE, ""),
    rules: findRules(rules, rule.id)?.rules.filter((sub) => sub.id !== rule.id) ?? [],
  }
}
