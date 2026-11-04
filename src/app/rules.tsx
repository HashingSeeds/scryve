import { useEffect } from "react"
import { router, useLocalSearchParams } from "expo-router"

import { useBackToBoard } from "@/features/game/useBackToBoard"
import { GAME_RULES, openRules, useGameRules } from "@/features/rules/gameRules"
import { RulesScreen } from "@/screens/RulesScreen"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/"))

export default function RulesRoute() {
  const { system, rule, glossary } = useLocalSearchParams<{
    system?: string
    rule?: string
    glossary?: string
  }>()
  const rules = useGameRules(system)
  const back = useBackToBoard()
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
      key={source.cacheKey}
      source={source}
      system={rules && system ? system : "mtg"}
      ruleId={rule}
      glossary={glossary !== undefined}
      back={back}
      onOpenRule={(id) => router.push({ pathname: "/rules", params: { ...params, rule: id } })}
      onCards={() => router.push({ pathname: "/cards", params: { game: rules ? system : "mtg" } })}
    />
  )
}
