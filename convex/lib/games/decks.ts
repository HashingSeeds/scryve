import type { ActionCtx } from "../../_generated/server"
import type { DeckSource } from "../deckSources"
import type { NormalizedCard, ProviderCards } from "./cards"

export type SectionCard = Pick<NormalizedCard, "category" | "facets">

export const MAX_FEED_DECKS = 20
export const FEED_REQUEST_TIMEOUT_MS = 10_000

export type DeckListEntry = {
  name: string
  quantity: number
  section: string
  originalReference: string
  providerCardId?: string
  sectionExplicit: boolean
}

export type ParsedDeckList = { entries: DeckListEntry[]; invalidLines: string[] }

type DeckListReference = { name: string; providerCardId?: string; key: string }

export function nameReference(reference: string): DeckListReference {
  return { name: reference, key: reference.toLocaleLowerCase() }
}

export type DeckListRules = {
  readonly sectionHeadings: Readonly<Record<string, readonly string[]>>
  readonly skipsLine?: (line: string) => boolean
  readonly headerCard?: (line: string) => { section: string; reference: string } | undefined
  readonly shareCode?: (list: string) => ParsedDeckList | undefined
  readonly bareCardId?: (line: string) => string | undefined
  readonly reference?: (reference: string) => DeckListReference | undefined
  readonly lookupKey?: (entry: DeckListEntry) => string
  readonly prefetch?: (
    ctx: ActionCtx,
    entries: readonly DeckListEntry[],
    includeImages: boolean,
  ) => Promise<NormalizedCard[]>
  readonly printingLookup?: (
    entry: DeckListEntry,
  ) => ((ctx: ActionCtx, includeImages: boolean) => ProviderCards) | undefined
  readonly defaultSection?: (card: SectionCard) => string
}

export type LinkedDeck = {
  name: string
  author?: string
  entries: DeckListEntry[]
  invalidLines: string[]
}

export type DeckLinkSource = {
  readonly source: DeckSource
  readonly sourceName: string
  readonly open: (url: string) => { sourceUrl: string; load: () => Promise<LinkedDeck> }
  readonly throttle?: (ctx: ActionCtx) => Promise<void>
}

export type DeckFeed = {
  readonly source: string
  readonly formats: readonly string[]
  readonly operation: (format: string) => string
  readonly refresh: (
    ctx: ActionCtx,
    includeImages: boolean,
    format: string,
  ) => Promise<{ count: number; status: number }>
  readonly refreshMayCacheNothing?: true
}
