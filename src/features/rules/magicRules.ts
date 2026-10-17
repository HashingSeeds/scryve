import type { ComprehensiveRules, Rule, RuleChapter } from "./comprehensiveRules"

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

export function parseMagicRules(source: string): ComprehensiveRules | undefined {
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
    else if (rule?.examples.length) rule.examples[rule.examples.length - 1] += `\n${line}`
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
