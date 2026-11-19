export type Rule = { id: string; text: string; examples: string[] }
export type RuleSection = { id: string; title: string; rules: Rule[] }
export type RuleChapter = { id: string; title: string; sections: RuleSection[] }
export type GlossaryEntry = { term: string; text: string }
export type ComprehensiveRules = {
  effectiveDate?: string
  chapters: RuleChapter[]
  glossary: GlossaryEntry[]
  notice: string[]
  slang?: Readonly<Record<string, string>>
  references?: RegExp
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
// why: a rule rarely repeats its section's subject, so the title stands in for it.
const TITLE_WEIGHT = 3
const TYPO_MIN_LENGTH = 5
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
  if (/^.ie[sd]$/.test(base)) base = base.slice(0, -1)
  else if (base.length > 4 && /ie[sd]$/.test(base)) base = `${base.slice(0, -3)}y`
  else if (base.length === 5 && base.endsWith("ying")) base = `${base.slice(0, -4)}ie`
  else if (base.length > 3 && base.endsWith("s") && !/(ss|us|is)$/.test(base)) base = base.slice(0, -1)
  for (const suffix of ["ing", "ed"])
    if (base.length > suffix.length + 2 && base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length)
      break
    }
  if (base.length > 3 && base.endsWith("e")) base = base.slice(0, -1)
  return base.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(base) ? base.slice(0, -1) : base
}

function words(text: string) {
  return text.toLowerCase().replace(/[’']/g, "").match(WORD) ?? []
}

type Postings = { rules: number[]; counts: number[] }
type SearchIndex = {
  rules: Rule[]
  postings: Map<string, Postings>
  lengths: number[]
  average: number
  slang: Map<string, string[]>
  spellings: Map<string, string>
  defined: { words: string[]; rules: number[] }[]
}
const indexes = new WeakMap<ComprehensiveRules, SearchIndex>()

function searchIndex(source: ComprehensiveRules) {
  const cached = indexes.get(source)
  if (cached) return cached
  const sections = source.chapters.flatMap((chapter) => chapter.sections)
  const rules = sections.flatMap((section) => section.rules)
  const titles = sections.flatMap((section) => section.rules.map(() => words(section.title)))
  const postings = new Map<string, Postings>()
  const stems = new Map<string, string>()
  const lengths = rules.map((rule, index) => {
    const counts = new Map<string, number>()
    const raws = words(rule.text)
    // why: a rule rarely repeats its section's subject, so the title's words count as its own.
    for (const raw of [...raws, ...titles[index]]) {
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
  const slang = new Map(
    Object.entries(source.slang ?? {}).map(([word, meaning]) => [stem(word), words(meaning).map(stem)]),
  )
  const at = new Map(rules.map((rule, position) => [rule, position]))
  // why: a glossary term names an idea, and the rules it cites are where that idea lives.
  const defined = source.glossary.map((entry) => ({
    words: words(entry.term)
      .filter((word) => !STOPWORDS.has(word))
      .map(stem),
    rules: citedRules(source, entry).map((rule) => at.get(rule)!),
  }))
  const index = { rules, postings, lengths, average, slang, spellings: stems, defined }
  indexes.set(source, index)
  return index
}

function citedRules(source: ComprehensiveRules, entry: GlossaryEntry) {
  if (!source.references) return []
  const cited = ruleReferences(entry.text, source.references).find((part) => typeof part !== "string")
  return (cited && findRules(source, cited.id)?.rules) || []
}

function idf(index: SearchIndex, list: Postings | undefined) {
  const found = list?.rules.length ?? 0
  return Math.log(1 + (index.rules.length - found + 0.5) / (found + 0.5))
}

// why: the last word may be half typed, so it also matches as a prefix of any indexed word.
function queryWords(query: string) {
  const typed = words(query)
  const kept = typed.filter((word) => !STOPWORDS.has(word))
  const chosen = kept.length > 0 ? kept : typed
  const partial = /[a-z0-9]$/i.test(query) ? chosen.at(-1) : undefined
  return { chosen, stems: [...new Set(chosen.map(stem))], partial }
}

function matchesWord(candidate: string, wanted: string, partial: string | undefined) {
  return candidate === wanted || (partial !== undefined && candidate.startsWith(partial))
}

// why: true when one insertion, deletion, substitution, or swap of neighbors turns a into b.
function oneEditApart(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false
  let start = 0
  while (start < a.length && a[start] === b[start]) start++
  const restA = a.slice(start + 1)
  const restB = b.slice(start + 1)
  return (
    restA === restB ||
    a.slice(start) === b.slice(start + 1) ||
    a.slice(start + 1) === b.slice(start) ||
    (a[start] === b[start + 1] && a[start + 1] === b[start] && a.slice(start + 2) === b.slice(start + 2))
  )
}

export function searchRules(rules: ComprehensiveRules, query: string, limit = 50) {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  if (RULE_NUMBER.test(needle))
    return searchIndex(rules)
      .rules.filter((rule) => rule.id.startsWith(needle))
      .slice(0, limit)
      .map((rule): RuleSearchResult => ({ kind: "rule", rule }))
  const { chosen, stems, partial } = queryWords(needle)
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
  // why: a slang word weighs as one word however many words its meaning takes.
  const weights = new Map(stems.map((word) => [word, 1]))
  for (const meaning of stems.map((word) => index.slang.get(word) ?? []))
    for (const word of meaning) weights.set(word, (weights.get(word) ?? 0) + 1 / meaning.length)
  // why: a misspelled word the rules never use searches the rules' words one typo away.
  const spelled = new Map<string, Set<string>>()
  for (const raw of chosen) {
    const wanted = stem(raw)
    if (raw.length < TYPO_MIN_LENGTH || index.slang.has(wanted)) continue
    const prefix = wanted === lastStem ? partial : undefined
    if ([...index.postings.keys()].some((word) => matchesWord(word, wanted, prefix))) continue
    const near = new Set<string>()
    for (const [spelling, word] of index.spellings) if (oneEditApart(raw, spelling)) near.add(word)
    spelled.set(wanted, near)
  }
  for (const [wanted, weight] of weights) {
    const best = new Map<number, number>()
    const prefix = wanted === lastStem ? partial : undefined
    const near = spelled.get(wanted)
    for (const [word, list] of index.postings) {
      if (!(near ? near.has(word) : matchesWord(word, wanted, prefix))) continue
      const rarity = idf(index, list)
      list.rules.forEach((at, i) => {
        const count = list.counts[i]
        const norm = BM25_K1 * (1 - BM25_B + (BM25_B * index.lengths[at]) / index.average)
        const score = (weight * rarity * count * (BM25_K1 + 1)) / (count + norm)
        if (score > (best.get(at) ?? 0)) best.set(at, score)
      })
    }
    for (const [at, score] of best) scores.set(at, (scores.get(at) ?? 0) + score)
  }
  const asked = new Set(stems)
  for (const term of index.defined) {
    if (term.words.length === 0 || !term.words.every((word) => asked.has(word))) continue
    const bonus = term.words.reduce((sum, word) => sum + idf(index, index.postings.get(word)), 0)
    for (const at of term.rules) scores.set(at, (scores.get(at) ?? 0) + bonus)
  }
  // why: a rule opens on a screen with its lettered subrules, so one result per screen keeps the list from repeating itself.
  const screens = new Set<string>()
  const matches: RuleSearchResult[] = [...scores]
    .sort(([a, scoreA], [b, scoreB]) => scoreB - scoreA || a - b)
    .map(([at]) => index.rules[at])
    .filter((rule) => {
      const screen = rule.id.replace(/[a-z]+$/, "")
      if (screens.has(screen)) return false
      screens.add(screen)
      return true
    })
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
