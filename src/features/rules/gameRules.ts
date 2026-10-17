import { Alert, Linking } from "react-native"

import { translate } from "@/i18n/translate"

import type { ComprehensiveRules } from "./comprehensiveRules"
import { FAB_RULE_REFERENCE, parseFabRules } from "./fabRules"
import { MAGIC_RULE_REFERENCE, parseMagicRules } from "./magicRules"
import { isSystemId, type SystemId } from "../../../convex/lib/systems"

export type TextRules = {
  kind: "text"
  url: string
  pageUrl: string
  publisher: string
  cacheKey: string
  parse: (text: string) => ComprehensiveRules | undefined
  references: RegExp
  revalidate?: true
}
export type GameRules = TextRules | { kind: "link"; pageUrl: string }

export const GAME_RULES = {
  mtg: {
    kind: "text",
    url: "https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt",
    pageUrl: "https://magic.wizards.com/en/rules",
    publisher: "Wizards of the Coast",
    cacheKey: "scryve.rules",
    parse: parseMagicRules,
    references: MAGIC_RULE_REFERENCE,
  },
  pokemon: { kind: "link", pageUrl: "https://www.pokemon.com/us/pokemon-tcg/rules" },
  ygo: { kind: "link", pageUrl: "https://www.yugioh-card.com/en/rulebook/" },
  fab: {
    kind: "text",
    url: "https://rules.fabtcg.com/txt/latest/en-fab-cr.txt",
    pageUrl: "https://rules.fabtcg.com/en/",
    publisher: "Legend Story Studios",
    cacheKey: "scryve.rules.fab",
    parse: parseFabRules,
    references: FAB_RULE_REFERENCE,
    revalidate: true,
  },
} satisfies Record<SystemId, GameRules>

export function gameRules(system: unknown): GameRules | undefined {
  return isSystemId(system) ? GAME_RULES[system] : undefined
}

export function openRules(rules: GameRules, showText?: () => void) {
  if (rules.kind === "text") showText?.()
  else
    void Linking.openURL(rules.pageUrl).catch(() =>
      Alert.alert(translate("play:rules.openFailed"), rules.pageUrl),
    )
}
