export type Rule = { id: string; text: string; examples: string[] }
export type RuleSection = { id: string; title: string; rules: Rule[] }
export type RuleChapter = { id: string; title: string; sections: RuleSection[] }
export type GlossaryEntry = { term: string; text: string }
export type ComprehensiveRules = {
  effectiveDate: string
  chapters: RuleChapter[]
  glossary: GlossaryEntry[]
  notice: string[]
}

const CHAPTER = /^(\d)\. (.+)$/
const SECTION = /^(\d{3})\. (.+)$/
const RULE = /^(\d{3}\.\d+[a-z]{0,2})\.? (.+)$/
const EFFECTIVE = /^These rules are effective as of (.+)\.$/

function paragraphs(lines: string[]) {
  const groups: string[][] = [[]]
  for (const line of lines) {
    if (line) groups[groups.length - 1].push(line)
    else if (groups[groups.length - 1].length > 0) groups.push([])
  }
  return groups.filter((group) => group.length > 0)
}

export function parseComprehensiveRules(source: string): ComprehensiveRules | undefined {
  const lines = source
    .replace(/^\uFEFF/, "")
    .split(/\r?\n|\u2028/)
    .map((line) => line.trim())
  const effectiveDate = lines.map((line) => EFFECTIVE.exec(line)?.[1]).find(Boolean)
  const rulesStart = lines.indexOf("Credits") + 1
  const glossaryStart = lines.lastIndexOf("Glossary")
  const creditsStart = lines.lastIndexOf("Credits")
  if (!effectiveDate || rulesStart === 0 || glossaryStart < rulesStart) return undefined
  if (creditsStart <= glossaryStart) return undefined

  const chapters: RuleChapter[] = []
  let rule: Rule | undefined
  for (const line of lines.slice(rulesStart, glossaryStart)) {
    if (!line) continue
    const section = chapters.at(-1)?.sections.at(-1)
    const ruleMatch = RULE.exec(line)
    const sectionMatch = SECTION.exec(line)
    const chapterMatch = CHAPTER.exec(line)
    if (ruleMatch && section) {
      rule = { id: ruleMatch[1], text: ruleMatch[2], examples: [] }
      section.rules.push(rule)
    } else if (sectionMatch && chapters.length > 0) {
      chapters.at(-1)?.sections.push({ id: sectionMatch[1], title: sectionMatch[2], rules: [] })
      rule = undefined
    } else if (chapterMatch) {
      chapters.push({ id: chapterMatch[1], title: chapterMatch[2], sections: [] })
      rule = undefined
    } else if (rule && line.startsWith("Example:")) rule.examples.push(line)
    else if (rule) rule.text += `\n${line}`
  }
  if (chapters.length === 0) return undefined

  return {
    effectiveDate,
    chapters,
    glossary: paragraphs(lines.slice(glossaryStart + 1, creditsStart)).map(([term, ...text]) => ({
      term,
      text: text.join("\n"),
    })),
    notice: lines.slice(creditsStart).filter(Boolean),
  }
}

export function findRules(rules: ComprehensiveRules, id: string) {
  const sectionId = id.slice(0, 3)
  const section = rules.chapters
    .flatMap((chapter) => chapter.sections)
    .find((candidate) => candidate.id === sectionId)
  if (!section) return undefined
  if (id === sectionId) return { section, rules: section.rules }
  const base = id.replace(/[a-z]+$/, "")
  const group = section.rules.filter(
    (rule) =>
      rule.id === base || (rule.id.startsWith(base) && /^[a-z]+$/.test(rule.id.slice(base.length))),
  )
  return group.length > 0 ? { section, rules: group } : undefined
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

const REFERENCE = /\b(\d{3}\.\d+[a-z]{0,2})\b|\b(rules? )(\d{3})\b(?!\.\d)/g

export function ruleReferences(text: string) {
  const parts: (string | { id: string })[] = []
  let last = 0
  for (const match of text.matchAll(REFERENCE)) {
    const start = match.index + (match[2]?.length ?? 0)
    const id = match[1] ?? match[3]
    parts.push(text.slice(last, start), { id })
    last = start + id.length
  }
  parts.push(text.slice(last))
  return parts.filter((part) => part !== "")
}
