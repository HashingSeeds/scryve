import { router, useLocalSearchParams } from "expo-router"

import { GAME_RULES, gameRules } from "@/features/rules/gameRules"
import { RulesScreen } from "@/screens/RulesScreen"

export default function RulesRoute() {
  const { system, rule, glossary } = useLocalSearchParams<{
    system?: string
    rule?: string
    glossary?: string
  }>()
  const rules = gameRules(system)
  const source = rules?.kind === "text" ? rules : GAME_RULES.mtg
  const params = system ? { system } : {}
  return (
    <RulesScreen
      source={source}
      ruleId={rule}
      glossary={glossary !== undefined}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onOpenRule={(id) => router.push({ pathname: "/rules", params: { ...params, rule: id } })}
      onOpenGlossary={() =>
        router.push({ pathname: "/rules", params: { ...params, glossary: "1" } })
      }
    />
  )
}
