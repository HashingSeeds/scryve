export type Rule = { id: string; text: string; examples: string[] }
export type RuleSection = { id: string; title: string; rules: Rule[] }
export type RuleChapter = { id: string; title: string; sections: RuleSection[] }
export type GlossaryEntry = { term: string; text: string }
export type ComprehensiveRules = {
  effectiveDate?: string
  chapters: RuleChapter[]
  glossary: GlossaryEntry[]
  notice: string[]
}

export function findRules(rules: ComprehensiveRules, id: string) {
  const section = rules.chapters
    .flatMap((chapter) => chapter.sections)
    .find((candidate) => id === candidate.id || id.startsWith(`${candidate.id}.`))
  if (!section) return undefined
  if (id === section.id) return { section, rules: section.rules }
  const base = id.replace(/[a-z]+$/, "")
  const group = section.rules.filter(
    (rule) =>
      rule.id === base || (rule.id.startsWith(base) && /^[a-z]+$/.test(rule.id.slice(base.length))),
  )
  return group.some((rule) => rule.id === id) ? { section, rules: group } : undefined
}

export type RuleSearchResult = { kind: "term"; entry: GlossaryEntry } | { kind: "rule"; rule: Rule }

export function searchRules(rules: ComprehensiveRules, query: string, limit = 50) {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const terms: RuleSearchResult[] = rules.glossary
    .filter((entry) => entry.term.toLowerCase().includes(needle))
    .map((entry) => ({ kind: "term", entry }))
  const matches: RuleSearchResult[] = rules.chapters
    .flatMap((chapter) => chapter.sections.flatMap((section) => section.rules))
    .filter((rule) => rule.id.startsWith(needle) || rule.text.toLowerCase().includes(needle))
    .map((rule) => ({ kind: "rule", rule }))
  return [...terms, ...matches].slice(0, limit)
}

export function ruleReferences(text: string, reference: RegExp) {
  const parts: (string | { id: string })[] = []
  let last = 0
  for (const match of text.matchAll(reference)) {
    const id = match.slice(1).find((group) => group !== undefined)
    if (!id) continue
    const start = match.index + match[0].indexOf(id)
    parts.push(text.slice(last, start), { id })
    last = start + id.length
  }
  parts.push(text.slice(last))
  return parts.filter((part) => part !== "")
}

export function adjacentSections(rules: ComprehensiveRules, id: string) {
  const sections = rules.chapters.flatMap((chapter) => chapter.sections)
  const index = sections.findIndex((section) => section.id === id)
  if (index < 0) return {}
  return { previous: index > 0 ? sections[index - 1] : undefined, next: sections.at(index + 1) }
}

export function matchExcerpt(text: string, query: string, lead = 60) {
  const needle = query.trim().toLowerCase()
  const at = needle ? text.toLowerCase().indexOf(needle) : -1
  if (at < 0) return { before: text, match: "", after: "" }
  const space = text.indexOf(" ", at - lead)
  const start = at > lead && space >= 0 && space < at ? space + 1 : 0
  return {
    before: `${start > 0 ? "…" : ""}${text.slice(start, at)}`,
    match: text.slice(at, at + needle.length),
    after: text.slice(at + needle.length),
  }
}
