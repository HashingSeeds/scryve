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
const BM25_B = 0.5
const TYPO_MIN_LENGTH = 6
const INHERITED_WEIGHT = 0.5
const TERM_WEIGHT = 0.4
// why: a player who has typed a whole word means that word, so longer words it only starts ("block" in "blockers") still match while typing but rank below it.
const COMPLETION_WEIGHT = 0.3
const RULE_NUMBER = /^\d+(\.\d*)*[a-z]*$/
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
  postings: Map<string, Postings>
  lengths: number[]
  average: number
  slang: Map<string, string[]>
  slangSpellings: Map<string, string>
  spellings: Map<string, string>
  defined: { entry: GlossaryEntry; words: string[]; rules: number[]; opens?: string }[]
}
const indexes = new WeakMap<ComprehensiveRules, SearchIndex>()

export function searchIndex(source: ComprehensiveRules) {
  const cached = indexes.get(source)
  if (cached) return cached
  const sections = source.chapters.flatMap((chapter) => chapter.sections)
  const rules = sections.flatMap((section) => section.rules)
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
  const texts = new Map(rules.map((rule) => [rule.id, listsOf(rule.text)]))
  const phrasings = new Map(
    Object.entries(source.phrasings ?? {}).map(([id, said]) => [id, listsOf(said.join(" "))]),
  )
  const lengths: number[] = []
  const screens = new Map<string, number[]>()
  const screenOf = (id: string) => {
    const screen = screens.get(id) ?? []
    if (screen.length === 0) screens.set(id, screen)
    return screen
  }
  for (const section of sections) {
    const title = listsOf(section.title)
    for (const rule of section.rules) {
      const index = lengths.length
      const own = texts.get(rule.id) ?? []
      const baseId = rule.id.replace(/[a-z]+$/, "")
      screenOf(section.id).push(index)
      screenOf(baseId).push(index)
      for (const [found, weight] of [
        [own, 1],
        [title, INHERITED_WEIGHT],
        [baseId === rule.id ? [] : (texts.get(baseId) ?? []), INHERITED_WEIGHT],
        [phrasings.get(rule.id) ?? [], 1],
      ] as const)
        for (const list of found)
          if (list.rules[list.rules.length - 1] === index)
            list.counts[list.counts.length - 1] += weight
          else {
            list.rules.push(index)
            list.counts.push(weight)
          }
      lengths.push(own.length)
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
  const defined = source.glossary.map((entry) => {
    const cited = source.references
      ? ruleReferences(entry.text, source.references).find((part) => typeof part !== "string")?.id
      : undefined
    const opens = cited && known.has(cited) ? cited.replace(/[a-z]+$/, "") : cited
    return {
      entry,
      words: words(entry.term)
        .filter((word) => !STOPWORDS.has(word))
        .map(stem),
      rules: (opens && screens.get(opens)) || [],
      opens: cited && known.has(cited) ? opens : undefined,
    }
  })
  const index = {
    rules,
    postings,
    lengths,
    average,
    slang,
    slangSpellings,
    spellings: stems,
    defined,
  }
  indexes.set(source, index)
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
  if (RULE_NUMBER.test(needle))
    return searchIndex(rules)
      .rules.filter((rule) => rule.id.startsWith(needle))
      .slice(0, limit)
      .map((rule): RuleSearchResult => ({ kind: "rule", rule }))
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
      const rarity = idf(index, list) * (near || word === wanted ? 1 : COMPLETION_WEIGHT)
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
    ranked.push({ result: { kind: "rule", rule }, score })
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

function firstMatch(text: string, query: string) {
  const at = text.toLowerCase().indexOf(query)
  if (at >= 0) return { at, length: query.length }
  if (RULE_NUMBER.test(query)) return undefined
  const { stems, partial } = queryWords(query)
  for (const token of text.matchAll(WORD)) {
    const raw = normalized(token[0])
    if ((partial !== undefined && raw.startsWith(partial)) || stems.includes(stem(raw)))
      return { at: token.index, length: token[0].length }
  }
  return undefined
}

export function matchExcerpt(text: string, query: string, lead = 60) {
  const needle = query.trim().toLowerCase()
  const found = needle ? firstMatch(text, needle) : undefined
  if (!found) return { before: text, match: "", after: "" }
  const { at, length } = found
  const space = text.indexOf(" ", at - lead)
  const start = at > lead && space >= 0 && space < at ? space + 1 : 0
  return {
    before: `${start > 0 ? "…" : ""}${text.slice(start, at)}`,
    match: text.slice(at, at + length),
    after: text.slice(at + length),
  }
}
