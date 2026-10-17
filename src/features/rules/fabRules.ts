import type { ComprehensiveRules, GlossaryEntry, Rule, RuleChapter } from "./comprehensiveRules"

const CHAPTER = /^(\d{1,2}) ([A-Z][^.]*)$/
const SECTION = /^(\d{1,2}\.\d{1,2}) (.+)$/
const RULE = /^(\d{1,2}\.\d{1,2}\.\d{1,3}[a-z]{0,2}) (.+)$/
const GLOSSARY_TERM = /^1\.-1\.\d+ (.+)$/

export const FAB_RULE_REFERENCE = /\[(\d{1,2}\.\d{1,2}(?:\.\d{1,3}[a-z]{0,2})?)\]/g

export function parseFabRules(source: string): ComprehensiveRules | undefined {
  const chapters: RuleChapter[] = []
  const glossary: GlossaryEntry[] = []
  const notice: string[] = []
  let mode: "preface" | "rules" | "glossary" | "credits" = "preface"
  let rule: Rule | undefined
  let entry: GlossaryEntry | undefined

  for (const raw of source.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const chapter = CHAPTER.exec(line)
    if (chapter) {
      const [, id, title] = chapter
      mode =
        title === "Preface"
          ? "preface"
          : title === "Glossary"
            ? "glossary"
            : title === "Acknowledgments"
              ? "credits"
              : "rules"
      if (mode === "rules") chapters.push({ id, title, sections: [] })
      rule = undefined
      continue
    }
    if (mode === "glossary") {
      const term = GLOSSARY_TERM.exec(line)?.[1]
      if (term) {
        entry = { term, text: "" }
        glossary.push(entry)
      } else if (entry) entry.text = entry.text ? `${entry.text}\n${line}` : line
    } else if (mode === "credits") {
      if (line.startsWith("©")) notice.push(line)
    } else if (mode === "rules") {
      const ruleMatch = RULE.exec(line)
      const sectionMatch = SECTION.exec(line)
      const sections = chapters.at(-1)?.sections
      if (ruleMatch) {
        rule = { id: ruleMatch[1], text: ruleMatch[2], examples: [] }
        sections?.at(-1)?.rules.push(rule)
      } else if (sectionMatch) {
        sections?.push({ id: sectionMatch[1], title: sectionMatch[2], rules: [] })
        rule = undefined
      } else if (rule && line.startsWith("Example:")) rule.examples.push(line)
      else if (rule?.examples.length) rule.examples[rule.examples.length - 1] += `\n${line}`
      else if (rule) rule.text += `\n${line}`
    }
  }

  if (chapters.length === 0 || glossary.length === 0) return undefined
  return { chapters, glossary, notice }
}
