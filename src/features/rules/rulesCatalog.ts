// why: kept free of React Native so Node scripts can load the same rules the app does.
import type { ComprehensiveRules } from "./comprehensiveRules"
import { FAB_RULE_REFERENCE, parseFabRules } from "./fabRules"
import { magicKeyword, type KeywordRule } from "./magicKeywords"
import { MAGIC_RULE_REFERENCE, parseMagicRules } from "./magicRules"
import { FAB_SLANG, MAGIC_SLANG } from "./slang"
import type { SYSTEMS, SystemId } from "../../../convex/lib/systems"

type MagicTable = (typeof SYSTEMS)["mtg"]["table"]
type MagicTableItemId = (MagicTable["counters"] | MagicTable["designations"])[number]["id"]
type FabTableItemId = (typeof SYSTEMS)["fab"]["table"]["designations"][number]["id"]

export type TextRules = {
  kind: "text"
  url: string
  pageUrl: string
  publisher: string
  cacheKey: string
  parse: (text: string) => ComprehensiveRules | undefined
  references: RegExp
  revalidate?: true
  keyword?: (rules: ComprehensiveRules, name: string) => KeywordRule | undefined
  tableItemRules: Readonly<Partial<Record<string, string>>>
}
export type GameRules = TextRules | { kind: "link"; pageUrl: string }

// why: search needs each game's slang and citation format, and the rules object is all it receives.
function searchable(
  rules: ComprehensiveRules | undefined,
  slang: Record<string, string>,
  references: RegExp,
) {
  return rules && { ...rules, slang, references }
}

export const GAME_RULES = {
  mtg: {
    kind: "text",
    url: "https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt",
    pageUrl: "https://magic.wizards.com/en/rules",
    publisher: "Wizards of the Coast",
    cacheKey: "scryve.rules",
    parse: (text) => searchable(parseMagicRules(text), MAGIC_SLANG, MAGIC_RULE_REFERENCE),
    references: MAGIC_RULE_REFERENCE,
    keyword: magicKeyword,
    tableItemRules: {
      poison: "104.3d",
      energy: "107.14",
      commanderTax: "903.8",
      monarch: "725",
      initiative: "726",
    } satisfies Partial<Record<MagicTableItemId, string>>,
  },
  pokemon: { kind: "link", pageUrl: "https://www.pokemon.com/us/pokemon-tcg/rules" },
  ygo: { kind: "link", pageUrl: "https://www.yugioh-card.com/en/rulebook/" },
  lorcana: { kind: "link", pageUrl: "https://www.disneylorcana.com/en-US/resources" },
  fab: {
    kind: "text",
    url: "https://rules.fabtcg.com/txt/latest/en-fab-cr.txt",
    pageUrl: "https://rules.fabtcg.com/en/",
    publisher: "Legend Story Studios",
    cacheKey: "scryve.rules.fab",
    parse: (text) => searchable(parseFabRules(text), FAB_SLANG, FAB_RULE_REFERENCE),
    references: FAB_RULE_REFERENCE,
    revalidate: true,
    tableItemRules: { marked: "9.3" } satisfies Partial<Record<FabTableItemId, string>>,
  },
  riftbound: {
    kind: "link",
    pageUrl: "https://playriftbound.com/en-us/news/rules-and-releases/",
  },
} satisfies Record<SystemId, GameRules>
