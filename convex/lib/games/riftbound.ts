import {
  compact,
  facet,
  fetchDatasetJson,
  finiteNumber,
  httpsUrl,
  normalizeCardName,
  objectRecord,
  SCRYVE_USER_AGENT,
  stringList,
  stringValue,
  type BulkDataset,
  type DatasetCard,
} from "./cards"
import type { DeckListRules } from "./decks"
import { env } from "../../_generated/server"

const RIFTHUNT_CARDS_URL = "https://api.rifthunt.com/bulk/cards"
export const RIFTBOUND_NAMESPACE = "riftbound-card"

const VARIANT_SUFFIX = /\s*\([^)]*\)\s*$/
/** why: the dataset also links TCGplayer product photos, which are TCGplayer's, not card images we can show. */
const IMAGE_HOSTS = new Set(["cmsassets.rgpub.io", "rifthunt.com"])
const ENTITIES: Record<string, string> = { amp: "&", gt: ">", lt: "<", quot: '"', apos: "'" }

const baseName = (name: string) => name.replace(VARIANT_SUFFIX, "")

/** why: a review deployment can show Riot a short demo list instead of the whole community catalog. Names are `;` separated, since card names hold commas. */
function cardAllowlist() {
  const names = env.RIFTBOUND_CARDS?.split(";").map((name) => normalizeCardName(name.trim()))
  return names?.some(Boolean) ? new Set(names.filter(Boolean)) : undefined
}

export function riftboundText(card: Record<string, unknown>) {
  const rich = stringValue(card.rich)
  const text = rich
    ? rich
        .replace(/<br\s*\/?>|<\/p>\s*<p>|<\/li>/g, "\n")
        .replace(/<li>/g, "• ")
        .replace(/<[^>]+>/g, "")
        .replace(/&(\w+);/g, (entity, name: string) => ENTITIES[name] ?? entity)
    : stringValue(card.text)
  return text
    ?.replace(/:rb_(?:energy_|rune_)?([a-z0-9]+):/g, "{$1}")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .replace(/^\[NO TEXT\]$/, "")
}

function imageUrl(value: unknown) {
  const url = httpsUrl(value)
  return url && IMAGE_HOSTS.has(new URL(url).hostname) ? url : undefined
}

function riftboundPrinting(card: Record<string, unknown>, printingId: string) {
  const name = baseName(stringValue(card.name) ?? "")
  const image = imageUrl(card.imgUrl)
  return {
    provider: "rifthunt",
    providerCardId: printingId,
    printingId,
    setCode: stringValue(card.set),
    collectorNumber: finiteNumber(card.num)?.toString(),
    rarity: stringValue(card.rarity),
    typeLabel: compact([stringValue(card.supertype), stringValue(card.type)]).join(" "),
    costLabel: finiteNumber(card.energy)?.toString(),
    faces: [
      {
        index: 0,
        name,
        text: riftboundText(card) || undefined,
        imageUrl: image,
        smallImageUrl: image,
      },
    ],
  }
}

export function normalizeRiftHuntCards(value: unknown, only = cardAllowlist()): DatasetCard[] {
  const dataset = objectRecord(value)
  const released = new Map(
    (Array.isArray(dataset?.sets) ? dataset.sets : []).flatMap((raw) => {
      const set = objectRecord(raw)
      const id = stringValue(set?.id)
      return id ? [[id, stringValue(set?.released) ?? ""] as const] : []
    }),
  )
  const groups = new Map<string, Array<{ id: string; card: Record<string, unknown> }>>()
  for (const raw of Array.isArray(dataset?.cards) ? dataset.cards : []) {
    const card = objectRecord(raw)
    const id = stringValue(card?.id)
    const name = stringValue(card?.name)?.trim()
    if (!card || !id || !name || card.supertype === "Token") continue
    const key = normalizeCardName(baseName(name))
    if (only && !only.has(key)) continue
    groups.set(key, [...(groups.get(key) ?? []), { id, card }])
  }
  const order = ({ card }: { card: Record<string, unknown> }) =>
    [
      (VARIANT_SUFFIX.test(String(card.name)) ? 2 : 0) + (imageUrl(card.imgUrl) ? 0 : 1),
      released.get(String(card.set)) ?? "",
      finiteNumber(card.num) ?? 0,
    ] as const
  return [...groups.values()].map((printings) => {
    printings.sort((a, b) => {
      const [x, y] = [order(a), order(b)]
      return x[0] - y[0] || x[1].localeCompare(y[1]) || x[2] - y[2]
    })
    const { card } = printings[0]
    const name = baseName(String(card.name))
    return {
      identityNamespace: RIFTBOUND_NAMESPACE,
      cardId: normalizeCardName(name)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      name,
      nameNormalized: normalizeCardName(name),
      category: stringValue(card.type),
      facets: compact([
        facet("energy", card.energy),
        facet("power", card.power),
        facet("might", card.might),
        facet("domains", stringList(card.domains).join(", ")),
        facet("supertype", card.supertype),
        facet("tags", stringList(card.tags).join(", ")),
      ]),
      printings: printings.map(({ id, card: printing }) => riftboundPrinting(printing, id)),
    }
  })
}

export const RIFTHUNT_DATASET = {
  version: async () => {
    const response = await fetch(RIFTHUNT_CARDS_URL, {
      method: "HEAD",
      headers: { "User-Agent": SCRYVE_USER_AGENT },
    })
    const modified = response.ok ? response.headers.get("last-modified") : null
    if (!modified) throw new Error(`RiftHunt bulk cards returned ${response.status} without a date`)
    // why: changing the allowlist must resync, and the sweep then prunes cards left off it.
    const only = cardAllowlist()
    return only ? `${modified} cards:${[...only].sort().join(";")}` : modified
  },
  load: async () => normalizeRiftHuntCards(await fetchDatasetJson(RIFTHUNT_CARDS_URL)),
} satisfies BulkDataset

const SECTION_BY_TYPE: Partial<Record<string, string>> = {
  Legend: "legend",
  Battlefield: "battlefields",
  Rune: "runes",
}

export const RIFTBOUND_DECK_LIST = {
  sectionHeadings: {
    legend: ["legend"],
    champion: ["champion", "chosen champion"],
    main: ["main deck", "maindeck", "main", "deck"],
    battlefields: ["battlefields", "battlefield"],
    runes: ["runes", "rune deck", "rune"],
    sideboard: ["sideboard", "side deck"],
  },
  defaultSection: (card) => SECTION_BY_TYPE[card.category ?? ""] ?? "main",
} satisfies DeckListRules
