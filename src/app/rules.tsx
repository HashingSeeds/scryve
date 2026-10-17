import { useEffect } from "react"
import { router, useLocalSearchParams } from "expo-router"

import { GAME_RULES, gameRules, openRules } from "@/features/rules/gameRules"
import { RulesScreen } from "@/screens/RulesScreen"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/"))

export default function RulesRoute() {
  const { system, rule, glossary } = useLocalSearchParams<{
    system?: string
    rule?: string
    glossary?: string
  }>()
  const rules = gameRules(system)
  useEffect(() => {
    if (rules?.kind !== "link") return
    openRules(rules)
    leave()
  }, [rules])
  if (rules?.kind === "link") return null
  const source = rules ?? GAME_RULES.mtg
  const params = system ? { system } : {}
  return (
    <RulesScreen
      source={source}
      ruleId={rule}
      glossary={glossary !== undefined}
      onBack={leave}
      onOpenRule={(id) => router.push({ pathname: "/rules", params: { ...params, rule: id } })}
      onOpenGlossary={() =>
        router.push({ pathname: "/rules", params: { ...params, glossary: "1" } })
      }
    />
  )
}
