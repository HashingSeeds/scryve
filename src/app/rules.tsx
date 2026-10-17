import { router, useLocalSearchParams } from "expo-router"

import { GAME_RULES } from "@/features/rules/gameRules"
import { RulesScreen } from "@/screens/RulesScreen"

export default function RulesRoute() {
  const { rule, glossary } = useLocalSearchParams<{ rule?: string; glossary?: string }>()
  return (
    <RulesScreen
      source={GAME_RULES.mtg}
      ruleId={rule}
      glossary={glossary !== undefined}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onOpenRule={(id) => router.push({ pathname: "/rules", params: { rule: id } })}
      onOpenGlossary={() => router.push({ pathname: "/rules", params: { glossary: "1" } })}
    />
  )
}
