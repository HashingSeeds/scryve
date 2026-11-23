import { finish, runInSlices, type Sliced } from "./slices"

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
  phrasings?: Readonly<Record<string, readonly string[]>>
  references?: RegExp
}

export type RuleContext = {
  section: RuleSection
  baseRule: Rule
  topic?: string
  group: Rule[]
  rule?: Rule
}

export function findRules(rules: ComprehensiveRules, id: string) {
  const index = searchIndex(rules)
  const section = index.sectionById.get(id)
  if (section) return { section, rules: section.rules }
  const at = index.ruleIndexById.get(id)
  if (at === undefined) return undefined
  const baseId = id.replace(/[a-z]+$/, "")
  return { section: index.sectionByRule[at], rules: index.groupByBase.get(baseId) ?? [] }
}

export function ruleTopic(rule: Rule): string | undefined {
  const firstLine = rule.text.split("\n", 1)[0].trim()
  return firstLine && !/[.:!?]/.test(firstLine) ? firstLine : undefined
}

function isHeadingOnlyRule(rule: Rule): boolean {
  const topic = ruleTopic(rule)
  return topic !== undefined && topic === rule.text.trim()
}

export function definingRule(group: readonly Rule[]): Rule {
  return group.length > 1 && isHeadingOnlyRule(group[0]) ? group[1] : group[0]
}

export function rulePreviewText(group: readonly Rule[], rule: Rule): string {
  if (group.length > 1 && isHeadingOnlyRule(rule)) return group[1].text
  if (ruleTopic(rule) && rule.text.includes("\n"))
    return rule.text.slice(rule.text.indexOf("\n") + 1).trim()
  return rule.text
}

export function ruleContext(rules: ComprehensiveRules, id: string): RuleContext | undefined {
  const index = searchIndex(rules)
  const section = index.sectionById.get(id)
  if (section) {
    const first = section.rules[0]
    return first ? { section, baseRule: first, group: section.rules } : undefined
  }
  const at = index.ruleIndexById.get(id)
  if (at === undefined) return undefined
  const baseRule = index.baseRuleByRule[at]
  const baseId = baseRule.id.replace(/[a-z]+$/, "")
  return {
    section: index.sectionByRule[at],
    baseRule,
    topic: ruleTopic(baseRule),
    group: index.groupByBase.get(baseId) ?? [index.rules[at]],
    rule: index.rules[at],
  }
}

export type RuleSearchResult =
  | { kind: "term"; entry: GlossaryEntry }
  | { kind: "rule"; rule: Rule; matched?: ReadonlySet<string>; partial?: string }

const BM25_K1 = 1.2
const BM25_B = 0.5
const TYPO_MIN_LENGTH = 6
const INHERITED_WEIGHT = 0.5
const TERM_WEIGHT = 0.4
// why: a player who has typed a whole word means that word, so longer words it only starts ("block" in "blockers") still match while typing but rank below it.
const COMPLETION_WEIGHT = 0.3
const RULE_NUMBER = /^\d+(\.\d*)*[a-z]*$/
const RULE_NUMBER_PREFIX = /^(?:rules?\s+|§\s*|#\s*)/

function normalizeRuleNumber(needle: string): string | undefined {
  const stripped = needle.replace(RULE_NUMBER_PREFIX, "")
  return RULE_NUMBER.test(stripped) ? stripped : undefined
}
const WORD = /[+-]?[\d*x]+\/[+-]?[\d*x]+|[a-z0-9][a-z0-9’']*/gi
const STOPWORDS = new Set(
  "a an and are as at be but by can could do does did doing for from had has have how i if in into is it its me my of on or our so than that the their them then there these they this to us vs was we were what when where which while who why will with would you your".split(
    " ",
  ),
)

function stem(word: string) {
  let base = word
  if (/^.ie[sd]$/.test(base)) base = base.slice(0, -1)
  else if (base.length > 4 && /ie[sd]$/.test(base)) base = `${base.slice(0, -3)}y`
  else if (base.length === 5 && base.endsWith("ying")) base = `${base.slice(0, -4)}ie`
  else if (base.length > 3 && base.endsWith("s") && !/(ss|us|is)$/.test(base))
    base = base.slice(0, -1)
  for (const suffix of ["ing", "ed"])
    if (base.length > suffix.length + 2 && base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length)
      break
    }
  if (base.length > 3 && base.endsWith("e")) base = base.slice(0, -1)
  return base.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(base) ? base.slice(0, -1) : base
}

function normalized(word: string) {
  return word.toLowerCase().replace(/[’']/g, "")
}

function words(text: string) {
  return (text.match(WORD) ?? []).map(normalized)
}

type Postings = { rules: number[]; counts: number[] }
type SearchIndex = {
  rules: Rule[]
  sectionByRule: RuleSection[]
  baseRuleByRule: Rule[]
  groupByBase: Map<string, Rule[]>
  ruleIndexById: Map<string, number>
  sectionById: Map<string, RuleSection>
  phrasingRules: Set<number>
  postings: Map<string, Postings>
  lengths: number[]
  average: number
  slang: Map<string, string[]>
  slangSpellings: Map<string, string>
  spellings: Map<string, string>
  defined: { entry: GlossaryEntry; words: string[]; rules: number[]; opens?: string }[]
}
const indexes = new WeakMap<ComprehensiveRules, SearchIndex>()
const builds = new WeakMap<ComprehensiveRules, Sliced<SearchIndex>>()

function buildOf(source: ComprehensiveRules) {
  const existing = builds.get(source)
  if (existing) return existing
  const created = buildSearchIndex(source)
  builds.set(source, created)
  return created
}

export function searchIndex(source: ComprehensiveRules) {
  return indexes.get(source) ?? finish(buildOf(source))
}

const preparing = new WeakMap<ComprehensiveRules, Promise<void>>()

// why: a phone takes well over 100 ms to index the Magic rules, so a board builds the index ahead of Rules a few ms per frame. A search before it finishes completes the same build at once.
export function prepareSearchIndex(source: ComprehensiveRules) {
  const existing = preparing.get(source)
  if (existing) return existing
  const created = runInSlices(buildOf(source)).then(() => {})
  preparing.set(source, created)
  return created
}

function* buildSearchIndex(source: ComprehensiveRules): Sliced<SearchIndex> {
  const sections = source.chapters.flatMap((chapter) => chapter.sections)
  const rules = sections.flatMap((section) => section.rules)
  const sectionById = new Map(sections.map((section) => [section.id, section]))
  const ruleIndexById = new Map(rules.map((rule, index) => [rule.id, index]))
  const sectionByRule: RuleSection[] = []
  const baseRuleByRule: Rule[] = []
  const groupByBase = new Map<string, Rule[]>()
  const phrasingRules = new Set<number>()
  const stems = new Map<string, string>()
  const postings = new Map<string, Postings>()
  const lists = new Map<string, Postings>()
  const listsOf = (text: string) =>
    words(text).map((raw) => {
      let list = lists.get(raw)
      if (list) return list
      const word = stem(raw)
      stems.set(raw, word)
      list = postings.get(word)
      if (!list) postings.set(word, (list = { rules: [], counts: [] }))
      lists.set(raw, list)
      return list
    })
  const texts = new Map<string, Postings[]>()
  for (const rule of rules) {
    texts.set(rule.id, listsOf(rule.text))
    yield
  }
  const phrasings = new Map(
    Object.entries(source.phrasings ?? {}).map(([id, said]) => [id, listsOf(said.join(" "))]),
  )
  yield
  const lengths: number[] = []
  const screens = new Map<string, number[]>()
  const screenOf = (id: string) => {
    const screen = screens.get(id) ?? []
    if (screen.length === 0) screens.set(id, screen)
    return screen
  }
  const baseRules = new Map<string, Rule>()
  for (const section of sections) {
    const title = listsOf(section.title)
    for (const rule of section.rules) {
      const index = lengths.length
      const own = texts.get(rule.id) ?? []
      const baseId = rule.id.replace(/[a-z]+$/, "")
      if (rule.id === baseId) baseRules.set(baseId, rule)
      sectionByRule.push(section)
      baseRuleByRule.push(baseRules.get(baseId) ?? rule)
      const group = groupByBase.get(baseId) ?? []
      if (group.length === 0) groupByBase.set(baseId, group)
      group.push(rule)
      const rulePhrasings = phrasings.get(rule.id) ?? []
      if (rulePhrasings.length > 0) phrasingRules.add(index)
      screenOf(section.id).push(index)
      screenOf(baseId).push(index)
      for (const [found, weight] of [
        [own, 1],
        [title, INHERITED_WEIGHT],
        [baseId === rule.id ? [] : (texts.get(baseId) ?? []), INHERITED_WEIGHT],
        [rulePhrasings, 1],
      ] as const)
        for (const list of found)
          if (list.rules[list.rules.length - 1] === index)
            list.counts[list.counts.length - 1] += weight
          else {
            list.rules.push(index)
            list.counts.push(weight)
          }
      lengths.push(own.length)
      yield
    }
  }
  const average = lengths.reduce((sum, length) => sum + length, 0) / Math.max(1, rules.length)
  const slang = new Map(
    Object.entries(source.slang ?? {}).map(([word, meaning]) => [
      stem(word),
      words(meaning).map(stem),
    ]),
  )
  const slangSpellings = new Map(Object.keys(source.slang ?? {}).map((word) => [word, stem(word)]))
  const known = new Set(rules.map((rule) => rule.id))
  for (const entry of source.glossary)
    for (const raw of words(entry.term)) if (!stems.has(raw)) stems.set(raw, stem(raw))
  const defined: SearchIndex["defined"] = []
  for (const entry of source.glossary) {
    const cited = source.references
      ? ruleReferences(entry.text, source.references).find((part) => typeof part !== "string")?.id
      : undefined
    const opens = cited && known.has(cited) ? cited.replace(/[a-z]+$/, "") : cited
    defined.push({
      entry,
      words: words(entry.term)
        .filter((word) => !STOPWORDS.has(word))
        .map(stem),
      rules: (opens && screens.get(opens)) || [],
      opens: cited && known.has(cited) ? opens : undefined,
    })
    yield
  }
  const index: SearchIndex = {
    rules,
    sectionByRule,
    baseRuleByRule,
    groupByBase,
    ruleIndexById,
    sectionById,
    phrasingRules,
    postings,
    lengths,
    average,
    slang,
    slangSpellings,
    spellings: stems,
    defined,
  }
  indexes.set(source, index)
  builds.delete(source)
  return index
}

function idf(index: SearchIndex, list: Postings | undefined) {
  const found = list?.rules.length ?? 0
  return Math.log(1 + (index.rules.length - found + 0.5) / (found + 0.5))
}

function queryWords(query: string) {
  const typed = words(query)
  const kept = typed.filter((word) => !STOPWORDS.has(word))
  const chosen = kept.length > 0 ? kept : typed
  const partial = /[a-z0-9]$/i.test(query) ? chosen.at(-1) : undefined
  return { chosen, stems: [...new Set(chosen.map(stem))], partial }
}

type Prefix = { partial: string; completions: ReadonlySet<string> }

function matchesWord(candidate: string, wanted: string, prefix: Prefix | undefined) {
  return (
    candidate === wanted ||
    (prefix !== undefined &&
      (prefix.completions.has(candidate) || candidate.startsWith(prefix.partial)))
  )
}

function completionsOf(spellings: Map<string, string>, partial: string | undefined) {
  if (partial === undefined) return undefined
  const completions = new Set<string>()
  for (const [spelling, word] of spellings) if (spelling.startsWith(partial)) completions.add(word)
  return { partial, completions }
}

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
    (a[start] === b[start + 1] &&
      a[start + 1] === b[start] &&
      a.slice(start + 2) === b.slice(start + 2))
  )
}

export function searchRules(rules: ComprehensiveRules, query: string, limit = 50) {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const ruleNumber = normalizeRuleNumber(needle)
  if (ruleNumber) {
    const index = searchIndex(rules)
    const matching = index.rules.filter((rule) => rule.id.startsWith(ruleNumber))
    const bareSection = ruleNumber.replace(/\.$/, "")
    if (index.sectionById.has(bareSection)) {
      const baseOnly = matching.filter((rule) => !/[a-z]+$/.test(rule.id))
      const subrules = matching.filter((rule) => /[a-z]+$/.test(rule.id))
      return [...baseOnly, ...subrules]
        .slice(0, limit)
        .map((rule): RuleSearchResult => ({ kind: "rule", rule }))
    }
    return matching.slice(0, limit).map((rule): RuleSearchResult => ({ kind: "rule", rule }))
  }
  const { chosen, stems, partial } = queryWords(needle)
  if (stems.length === 0) return []
  const lastStem = partial === undefined ? undefined : stem(partial)
  const index = searchIndex(rules)
  const completions = completionsOf(index.spellings, partial)
  const ranked: { result: RuleSearchResult; score: number; opens?: string }[] = []
  terms: for (const term of index.defined) {
    let score = 0
    let named = term.words.length === stems.length
    for (const wanted of stems) {
      const word =
        term.words.find((candidate) => candidate === wanted) ??
        (wanted === lastStem
          ? term.words.find((candidate) => matchesWord(candidate, wanted, completions))
          : undefined)
      if (word === undefined) continue terms
      named &&= word === wanted
      score +=
        (idf(index, index.postings.get(word)) * Math.min(wanted.length, word.length)) / word.length
    }
    ranked.push({
      result: { kind: "term", entry: term.entry },
      score: named ? Infinity : (score * stems.length) / term.words.length,
      opens: term.opens,
    })
  }
  const scores = new Map<number, number>()
  const stemHits = new Map<number, number>()
  const matched = new Set<string>()
  const weights = new Map(stems.map((word) => [word, 1]))
  const slang = new Set(stems)
  if (partial !== undefined)
    for (const [spelling, word] of index.slangSpellings)
      if (spelling.startsWith(partial)) slang.add(word)
  for (const meaning of [...slang].map((word) => index.slang.get(word) ?? []))
    for (const word of meaning) weights.set(word, (weights.get(word) ?? 0) + 1 / meaning.length)
  const spelled = new Map<string, Set<string>>()
  for (const raw of chosen) {
    const wanted = stem(raw)
    if (raw.length < TYPO_MIN_LENGTH || index.slang.has(wanted)) continue
    const prefix = wanted === lastStem ? completions : undefined
    if ([...index.postings.keys()].some((word) => matchesWord(word, wanted, prefix))) continue
    const near = new Set<string>()
    for (const [spelling, word] of index.spellings) if (oneEditApart(raw, spelling)) near.add(word)
    spelled.set(wanted, near)
  }
  for (const [wanted, weight] of weights) {
    const best = new Map<number, number>()
    const prefix = wanted === lastStem ? completions : undefined
    const near = spelled.get(wanted)
    for (const [word, list] of index.postings) {
      if (!(near ? near.has(word) : matchesWord(word, wanted, prefix))) continue
      matched.add(word)
      const rarity = idf(index, list) * (near || word === wanted ? 1 : COMPLETION_WEIGHT)
      list.rules.forEach((at, i) => {
        const count = list.counts[i]
        const norm = BM25_K1 * (1 - BM25_B + (BM25_B * index.lengths[at]) / index.average)
        const score = (weight * rarity * count * (BM25_K1 + 1)) / (count + norm)
        if (score > (best.get(at) ?? 0)) best.set(at, score)
      })
    }
    for (const [at, score] of best) {
      scores.set(at, (scores.get(at) ?? 0) + score)
      stemHits.set(at, (stemHits.get(at) ?? 0) + 1)
    }
  }
  const asked = new Set(stems)
  for (const term of index.defined) {
    if (term.words.length === 0 || !term.words.every((word) => asked.has(word))) continue
    const bonus =
      TERM_WEIGHT * term.words.reduce((sum, word) => sum + idf(index, index.postings.get(word)), 0)
    for (const at of term.rules) scores.set(at, (scores.get(at) ?? 0) + bonus)
  }
  const screens = new Set<string>()
  for (const [at, score] of [...scores].sort(
    ([a, scoreA], [b, scoreB]) => scoreB - scoreA || a - b,
  )) {
    const rule = index.rules[at]
    const screen = rule.id.replace(/[a-z]+$/, "")
    if (screens.has(screen)) continue
    screens.add(screen)
    let representative = rule
    if (rule.id !== screen && !index.phrasingRules.has(at)) {
      const group = index.groupByBase.get(screen)
      if (group && group.length > 1) {
        const defining = definingRule(group)
        const definingAt = index.ruleIndexById.get(defining.id)
        if (
          definingAt !== undefined &&
          definingAt !== at &&
          (stemHits.get(definingAt) ?? 0) >= (stemHits.get(at) ?? 0)
        )
          representative = defining
      }
    }
    ranked.push({ result: { kind: "rule", rule: representative, matched, partial }, score })
  }
  // why: a term that cites one rule opens that rule's screen, so the rule listed again below it would only spend a visible slot. A term citing a whole section keeps its rules listed.
  const covered = new Set<string>()
  return ranked
    .sort((a, b) => b.score - a.score)
    .filter(({ result, opens }) => {
      if (result.kind === "rule") return !covered.has(result.rule.id.replace(/[a-z]+$/, ""))
      if (opens) covered.add(opens)
      return true
    })
    .slice(0, limit)
    .map(({ result }) => result)
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

export type ExcerptSegment = { text: string; matched: boolean }

export function excerptSegments(
  text: string,
  matched?: ReadonlySet<string>,
  partial?: string,
  lead = 60,
): ExcerptSegment[] {
  if (!matched?.size && !partial) return [{ text, matched: false }]
  const hits: { start: number; end: number }[] = []
  for (const token of text.matchAll(WORD)) {
    const raw = normalized(token[0])
    if (matched?.has(stem(raw)) || (partial !== undefined && raw.startsWith(partial)))
      hits.push({ start: token.index, end: token.index + token[0].length })
  }
  if (hits.length === 0) return [{ text, matched: false }]
  const anchor = hits[0].start
  const space = text.indexOf(" ", anchor - lead)
  const start =
    text.length > lead * 2 && anchor > lead && space >= 0 && space < anchor ? space + 1 : 0
  const segments: ExcerptSegment[] = []
  let cursor = start
  if (start > 0) segments.push({ text: "…", matched: false })
  for (const hit of hits) {
    if (hit.end <= cursor) continue
    const hitStart = Math.max(hit.start, cursor)
    if (hitStart > cursor) segments.push({ text: text.slice(cursor, hitStart), matched: false })
    segments.push({ text: text.slice(hitStart, hit.end), matched: true })
    cursor = hit.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), matched: false })
  return segments
}
