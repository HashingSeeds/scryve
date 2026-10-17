import { Alert, Linking } from "react-native"

import { translate } from "@/i18n/translate"

import type { ComprehensiveRules } from "./comprehensiveRules"
import { parseMagicRules } from "./magicRules"
import { isSystemId, type SYSTEMS, type SystemId } from "../../../convex/lib/systems"

type MagicTable = (typeof SYSTEMS)["mtg"]["table"]
type MagicTableItemId = (MagicTable["counters"] | MagicTable["designations"])[number]["id"]

export type TextRules = {
  kind: "text"
  url: string
  pageUrl: string
  cacheKey: string
  parse: (text: string) => ComprehensiveRules | undefined
  tableItemRules: Readonly<Partial<Record<string, string>>>
}
export type GameRules = TextRules | { kind: "link"; pageUrl: string }

export const GAME_RULES = {
  mtg: {
    kind: "text",
    url: "https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt",
    pageUrl: "https://magic.wizards.com/en/rules",
    cacheKey: "scryve.rules",
    parse: parseMagicRules,
    tableItemRules: {
      poison: "104.3d",
      energy: "107.14",
      commanderTax: "903.8",
    } satisfies Partial<Record<MagicTableItemId, string>>,
  },
  pokemon: { kind: "link", pageUrl: "https://www.pokemon.com/us/pokemon-tcg/rules" },
  ygo: { kind: "link", pageUrl: "https://www.yugioh-card.com/en/rulebook/" },
} satisfies Record<SystemId, GameRules>

export function gameRules(system: unknown): GameRules | undefined {
  return isSystemId(system) ? GAME_RULES[system] : undefined
}

export function tableItemRulesOf(system: unknown) {
  const rules = gameRules(system)
  return rules?.kind === "text" ? rules.tableItemRules : undefined
}

export function openRules(rules: GameRules, showText?: () => void) {
  if (rules.kind === "text") showText?.()
  else
    void Linking.openURL(rules.pageUrl).catch(() =>
      Alert.alert(translate("play:rules.openFailed"), rules.pageUrl),
    )
}
