import { normalizeCardName } from "./games/cards"
import { formatDefinition, systemDefinition, type DeckCheckId, type DeckRule } from "./systems"

export type CardFacets = readonly { key: string; value: string }[]

export type RuleCard = {
  name: string
  quantity: number
  section?: string
  board?: string
  commanderColor?: string
}

type FacetsFor<Card extends RuleCard> = (card: Card) => CardFacets | undefined

export type DeckIssue =
  | { code: "size"; sections: readonly string[]; count: number; target: number; exact: boolean }
  | { code: "copies"; name: string; count: number; max: number }
  | { code: "unique"; section: string; name: string; count: number }
  | { code: "legality"; name: string; format: string; status: string }
  | { code: "domain"; name: string; domains: string[]; identity: string[] }
  | { code: "champion"; name: string; champion: string[] }
  | { code: "signatureCount"; count: number; max: number }
  | { code: "signatureChampion"; name: string; champion: string[] }
  | { code: "colorIdentity"; name: string; colors: string; identity: string }

const SIGNATURE_LIMIT = 3

const sectionOf = (card: RuleCard) => card.section ?? card.board ?? "main"

function namedCounts<Card extends RuleCard>(cards: readonly Card[]) {
  const counts = new Map<string, { card: Card; count: number }>()
  for (const card of cards) {
    const key = normalizeCardName(card.name)
    const entry = counts.get(key)
    counts.set(key, { card: entry?.card ?? card, count: (entry?.count ?? 0) + card.quantity })
  }
  return [...counts.values()]
}

function facetValue(facets: CardFacets, key: string) {
  return facets.find((facet) => facet.key === key)?.value
}

function facetList(facets: CardFacets, key: string) {
  return (facetValue(facets, key) ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
}

const MTG_BASIC_LAND = /^(snow-covered )?(plains|island|swamp|mountain|forest|wastes)$/i
const NUMBER_WORDS: Partial<Record<string, number>> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

/** why: basic lands and cards like Relentless Rats or Seven Dwarves set their own copy limit in Magic; unknown until the card text loads. */
function mtgCopyLimit(name: string, facets: CardFacets | undefined, max: number) {
  if (MTG_BASIC_LAND.test(name.trim())) return Infinity
  if (!facets) return undefined
  if (/\bBasic\b/.test(facetValue(facets, "typeLine") ?? "")) return Infinity
  const text = facetValue(facets, "oracleText") ?? ""
  if (/a deck can have any number of cards named/i.test(text)) return Infinity
  const upTo = /a deck can have up to (\w+) cards named/i.exec(text)?.[1]?.toLowerCase()
  return (upTo && NUMBER_WORDS[upTo]) || max
}

function riftboundIdentity<Card extends RuleCard>(
  cards: readonly Card[],
  facetsFor: FacetsFor<Card>,
): DeckIssue[] {
  const legend = cards.find((card) => sectionOf(card) === "legend")
  const legendFacets = legend && facetsFor(legend)
  const identity = legendFacets ? facetList(legendFacets, "domains") : []
  const champion = legendFacets ? facetList(legendFacets, "tags") : []
  const issues: DeckIssue[] = []
  const flagged = new Set<string>()
  const flag = (issue: Extract<DeckIssue, { name: string }>) => {
    const key = `${issue.code}:${normalizeCardName(issue.name)}`
    if (flagged.has(key)) return
    flagged.add(key)
    issues.push(issue)
  }
  let signatures = 0
  for (const card of cards) {
    const section = sectionOf(card)
    const facets = section === "legend" ? undefined : facetsFor(card)
    if (!facets) continue
    const supertype = facetValue(facets, "supertype")
    if (supertype === "Signature") signatures += card.quantity
    if (!legendFacets) continue
    const domains = facetList(facets, "domains").filter((domain) => domain !== "Colorless")
    if (domains.some((domain) => !identity.includes(domain)))
      flag({ code: "domain", name: card.name, domains, identity })
    const championCard =
      champion.length === 0 || facetList(facets, "tags").some((tag) => champion.includes(tag))
    if (section === "champion" && (supertype !== "Champion" || !championCard))
      flag({ code: "champion", name: card.name, champion })
    if (supertype === "Signature" && !championCard)
      flag({ code: "signatureChampion", name: card.name, champion })
  }
  return signatures > SIGNATURE_LIMIT
    ? [{ code: "signatureCount", count: signatures, max: SIGNATURE_LIMIT }, ...issues]
    : issues
}

function commanderIdentity<Card extends RuleCard>(
  cards: readonly Card[],
  facetsFor: FacetsFor<Card>,
): DeckIssue[] {
  const commanders = cards.filter((card) => sectionOf(card) === "commander")
  const identities = commanders.map((card) => {
    const facets = facetsFor(card)
    return facets && facetValue(facets, "colorIdentity")
  })
  if (commanders.length === 0 || identities.some((colors) => colors === undefined)) return []
  const identity = new Set([
    ...identities.join(""),
    ...commanders.flatMap((card) => card.commanderColor ?? []),
  ])
  const shown = [...identity].join("")
  return namedCounts(cards.filter((card) => sectionOf(card) === "main")).flatMap(({ card }) => {
    const facets = facetsFor(card)
    const colors = facets && facetValue(facets, "colorIdentity")
    return colors !== undefined && [...colors].some((color) => !identity.has(color))
      ? [{ code: "colorIdentity" as const, name: card.name, colors, identity: shown }]
      : []
  })
}

const DECK_CHECKS = { riftboundIdentity, commanderIdentity } satisfies Record<
  DeckCheckId,
  <Card extends RuleCard>(cards: readonly Card[], facetsFor: FacetsFor<Card>) => DeckIssue[]
>

function ruleIssues<Card extends RuleCard>(
  rule: DeckRule,
  cards: readonly Card[],
  facetsFor: FacetsFor<Card>,
): DeckIssue[] {
  switch (rule.kind) {
    case "size": {
      const { sections, min, max } = rule
      const count = cards.reduce(
        (total, card) => total + (sections.includes(sectionOf(card)) ? card.quantity : 0),
        0,
      )
      const target =
        min !== undefined && count < min ? min : max !== undefined && count > max ? max : undefined
      return target === undefined
        ? []
        : [{ code: "size", sections, count, target, exact: min === max }]
    }
    case "copies":
      return namedCounts(cards.filter((card) => rule.sections.includes(sectionOf(card)))).flatMap(
        ({ card, count }) => {
          const max = rule.allowance ? mtgCopyLimit(card.name, facetsFor(card), rule.max) : rule.max
          return max !== undefined && count > max
            ? [{ code: "copies" as const, name: card.name, count, max }]
            : []
        },
      )
    case "unique":
      return namedCounts(cards.filter((card) => sectionOf(card) === rule.section))
        .filter(({ count }) => count > 1)
        .map(({ card, count }) => ({
          code: "unique",
          section: rule.section,
          name: card.name,
          count,
        }))
    case "legal":
      return namedCounts(cards).flatMap(({ card }) => {
        const facets = facetsFor(card)
        const status = facets && facetValue(facets, `legality:${rule.format}`)
        return status && status !== "legal"
          ? [{ code: "legality" as const, name: card.name, format: rule.format, status }]
          : []
      })
    case "check":
      return DECK_CHECKS[rule.check](cards, facetsFor)
  }
}

export function deckIssues<Card extends RuleCard>(
  game: string,
  format: string,
  cards: readonly Card[],
  facetsFor: FacetsFor<Card>,
): DeckIssue[] {
  return (formatDefinition(game, format)?.rules ?? []).flatMap((rule) =>
    ruleIssues(rule, cards, facetsFor),
  )
}

export function readsCardDetails(game: string, format?: string) {
  const formats = systemDefinition(game)?.formats ?? []
  return formats.some(
    (candidate) =>
      (format === undefined || candidate.id === format) &&
      candidate.rules?.some(
        (rule) =>
          rule.kind === "check" ||
          rule.kind === "legal" ||
          (rule.kind === "copies" && rule.allowance !== undefined),
      ),
  )
}
