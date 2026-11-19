import { useMemo } from "react"
import { Alert, Linking, Platform } from "react-native"

import { useCapabilityReleased } from "@/features/decks/useCapabilityReleased"
import { translate } from "@/i18n/translate"

import { GAME_RULES, type GameRules } from "./rulesCatalog"
import { isSystemId, type SystemId } from "../../../convex/lib/systems"

export { GAME_RULES, type GameRules, type TextRules } from "./rulesCatalog"

export const RULES_TEXT_IN_APP = Platform.OS !== "web"

export function gameRules(system: unknown): GameRules | undefined {
  return isSystemId(system) ? GAME_RULES[system] : undefined
}

export function useGameRules(system: unknown): GameRules | undefined {
  const rules = gameRules(system)
  const shown = useCapabilityReleased("rules")(String(system))
  return useMemo(
    () => (rules?.kind === "text" && !shown ? { kind: "link", pageUrl: rules.pageUrl } : rules),
    [rules, shown],
  )
}

export function rulesHref(system: SystemId, rule?: string) {
  return { pathname: "/rules", params: { system, ...(rule ? { rule } : {}) } } as const
}

export function tableItemRulesOf(system: unknown) {
  const rules = gameRules(system)
  return RULES_TEXT_IN_APP && rules?.kind === "text" ? rules.tableItemRules : undefined
}

export function openRules(rules: GameRules, showText?: () => void) {
  if (rules.kind === "text") showText?.()
  else
    void Linking.openURL(rules.pageUrl).catch(() =>
      Alert.alert(translate("play:rules.openFailed"), rules.pageUrl),
    )
}
