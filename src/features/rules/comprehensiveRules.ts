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

const BM25_K1 = 1.2
const BM25_B = 0.75
const RULE_NUMBER = /^\d+(\.\d*[a-z]*)?$/
const WORD = /[+-]?[\d*x]+\/[+-]?[\d*x]+|[a-z0-9]+/g
const STOPWORDS = new Set(
  "a an and are as at be but by can could do does did doing for from had has have how i if in into is it its me my of on or our so than that the their them then there these they this to us vs was we were what when where which while who why will with would you your".split(
    " ",
  ),
)

// why: light suffix stripping so "attacking", "attacks", and "attacked" all meet "attack" without a stemming library.
function stem(word: string) {
  let base = word
  if (base.length > 4 && base.endsWith("ies")) base = `${base.slice(0, -3)}y`
  else if (base.length > 3 && base.endsWith("s") && !/(ss|us|is)$/.test(base)) base = base.slice(0, -1)
  for (const suffix of ["ing", "ed"])
    if (base.length > suffix.length + 2 && base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length)
      if (/([b-df-hj-np-tv-z])\1$/.test(base) && !/(ll|ss|ff)$/.test(base)) base = base.slice(0, -1)
      break
    }
  return base.length > 3 && base.endsWith("e") ? base.slice(0, -1) : base
}

function words(text: string) {
  return text.toLowerCase().replace(/[’']/g, "").match(WORD) ?? []
}

type Postings = { rules: number[]; counts: number[] }
type SearchIndex = { rules: Rule[]; postings: Map<string, Postings>; lengths: number[]; average: number }
const indexes = new WeakMap<ComprehensiveRules, SearchIndex>()

function searchIndex(source: ComprehensiveRules) {
  const cached = indexes.get(source)
  if (cached) return cached
  const rules = source.chapters.flatMap((chapter) =>
    chapter.sections.flatMap((section) => section.rules),
  )
  const postings = new Map<string, Postings>()
  const stems = new Map<string, string>()
  const lengths = rules.map((rule, index) => {
    const counts = new Map<string, number>()
    const raws = words(rule.text)
    for (const raw of raws) {
      let word = stems.get(raw)
      if (word === undefined) stems.set(raw, (word = stem(raw)))
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
    for (const [word, count] of counts) {
      const list = postings.get(word) ?? { rules: [], counts: [] }
      if (list.rules.length === 0) postings.set(word, list)
      list.rules.push(index)
      list.counts.push(count)
    }
    return raws.length
  })
  const average = lengths.reduce((sum, length) => sum + length, 0) / Math.max(1, rules.length)
  const index = { rules, postings, lengths, average }
  indexes.set(source, index)
  return index
}

// why: the last word may be half typed, so it also matches as a prefix of any indexed word.
function queryWords(query: string) {
  const typed = words(query)
  const kept = typed.filter((word) => !STOPWORDS.has(word))
  const chosen = kept.length > 0 ? kept : typed
  const partial = /[a-z0-9]$/i.test(query) ? chosen.at(-1) : undefined
  return { stems: [...new Set(chosen.map(stem))], partial }
}

function matchesWord(candidate: string, wanted: string, partial: string | undefined) {
  return candidate === wanted || (partial !== undefined && candidate.startsWith(partial))
}

export function searchRules(rules: ComprehensiveRules, query: string, limit = 50) {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  if (RULE_NUMBER.test(needle))
    return searchIndex(rules)
      .rules.filter((rule) => rule.id.startsWith(needle))
      .slice(0, limit)
      .map((rule): RuleSearchResult => ({ kind: "rule", rule }))
  const { stems, partial } = queryWords(needle)
  const lastStem = partial === undefined ? undefined : stem(partial)
  const terms: RuleSearchResult[] = rules.glossary
    .filter((entry) => {
      const termWords = words(entry.term).map(stem)
      return stems.every((wanted) =>
        termWords.some((word) => matchesWord(word, wanted, wanted === lastStem ? partial : undefined)),
      )
    })
    .map((entry) => ({ kind: "term", entry }))
  const index = searchIndex(rules)
  const scores = new Map<number, number>()
  for (const wanted of stems) {
    const best = new Map<number, number>()
    const prefix = wanted === lastStem ? partial : undefined
    for (const [word, list] of index.postings) {
      if (!matchesWord(word, wanted, prefix)) continue
      const idf = Math.log(1 + (index.rules.length - list.rules.length + 0.5) / (list.rules.length + 0.5))
      list.rules.forEach((at, i) => {
        const count = list.counts[i]
        const norm = BM25_K1 * (1 - BM25_B + (BM25_B * index.lengths[at]) / index.average)
        const score = (idf * count * (BM25_K1 + 1)) / (count + norm)
        if (score > (best.get(at) ?? 0)) best.set(at, score)
      })
    }
    for (const [at, score] of best) scores.set(at, (scores.get(at) ?? 0) + score)
  }
  const matches: RuleSearchResult[] = [...scores]
    .sort(([a, scoreA], [b, scoreB]) => scoreB - scoreA || a - b)
    .map(([at]) => ({ kind: "rule", rule: index.rules[at] }))
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
