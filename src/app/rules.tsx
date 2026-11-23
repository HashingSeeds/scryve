import { useContext, useEffect, useMemo, useSyncExternalStore } from "react"
import { router, useLocalSearchParams } from "expo-router"
import { NavigationContext, NavigationRouteContext } from "expo-router/react-navigation"

import { localGameRepository } from "@/features/game/localPersistence"
import { useBackToBoard } from "@/features/game/useBackToBoard"
import { GAME_RULES, openRules, useGameRules } from "@/features/rules/gameRules"
import { RulesScreen } from "@/screens/RulesScreen"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/"))
const GAME_ROUTES = new Set(["game/current", "connected/game/[gameId]", "lan/game"])

function depthToGame(routes: readonly { key: string; name: string }[], currentKey?: string) {
  const currentIndex = currentKey
    ? routes.findIndex((route) => route.key === currentKey)
    : routes.length - 1
  if (currentIndex < 2) return undefined
  let lookupBelow = 0
  for (let i = currentIndex - 1; i >= 0; i--) {
    const name = routes[i].name
    if (name === "rules" || name === "cards") {
      lookupBelow++
      continue
    }
    const isGame =
      GAME_ROUTES.has(name) || (name === "index" && localGameRepository.loadActiveGame())
    if (isGame && lookupBelow >= 1) return currentIndex - i
    break
  }
  return undefined
}

export default function RulesRoute() {
  const { system, rule, glossary, query } = useLocalSearchParams<{
    system?: string
    rule?: string
    glossary?: string
    query?: string
  }>()
  const rules = useGameRules(system)
  const back = useBackToBoard()
  const navigation = useContext(NavigationContext)
  const route = useContext(NavigationRouteContext)
  const dismissDepth = useSyncExternalStore(
    (onChange) => navigation?.addListener("state", onChange) ?? (() => {}),
    () => depthToGame(navigation?.getState()?.routes ?? [], route?.key),
  )
  const onReturnToGame = useMemo(
    () => (rule && dismissDepth ? () => router.dismiss(dismissDepth) : undefined),
    [rule, dismissDepth],
  )
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
      initialQuery={query}
      back={back}
      onOpenRule={(id) => router.push({ pathname: "/rules", params: { ...params, rule: id } })}
      onReturnToGame={onReturnToGame}
      onCards={() => router.push({ pathname: "/cards", params: { game: rules ? system : "mtg" } })}
    />
  )
}
