import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Keyboard, Platform } from "react-native"
import { router, useLocalSearchParams } from "expo-router"

import { useBackToBoard } from "@/features/game/useBackToBoard"
import { GAME_RULES, openRules, useGameRules } from "@/features/rules/gameRules"
import { translate } from "@/i18n/translate"
import { RulesScreen } from "@/screens/RulesScreen"
import { RulesSheet, type RulesSheetLayer } from "@/screens/RulesSheet"
import { fitBackLabel } from "@/utils/useBackLabel"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/"))

interface HistoryEntry {
  key: string
  ruleId?: string
}

export default function RulesRoute() {
  const { system, rule, glossary, query } = useLocalSearchParams<{
    system?: string
    rule?: string
    glossary?: string
    query?: string
  }>()
  const rules = useGameRules(system)
  const dismissBack = useBackToBoard()
  const nextId = useRef(1)
  const [history, setHistory] = useState<readonly HistoryEntry[]>(() => [
    { key: "root", ruleId: rule },
  ])
  const [poppingKey, setPoppingKey] = useState<string | undefined>()
  const isSheet = Platform.OS !== "web"

  const requestPop = useCallback(() => {
    Keyboard.dismiss()
    setHistory((current) => {
      if (current.length <= 1) return current
      if (!isSheet) return current.slice(0, -1)
      const top = current[current.length - 1]
      setPoppingKey((activePop) => activePop ?? top.key)
      return current
    })
  }, [isSheet])

  const finishPop = useCallback((key: string) => {
    setPoppingKey((current) => (current === key ? undefined : current))
    setHistory((current) =>
      current.length > 1 && current[current.length - 1]?.key === key
        ? current.slice(0, -1)
        : current,
    )
  }, [])

  const openRule = useCallback((id: string) => {
    Keyboard.dismiss()
    setPoppingKey(undefined)
    setHistory((current) => {
      if (current[current.length - 1]?.ruleId === id) return current
      const key = `${id}-${nextId.current++}`
      return [...current, { key, ruleId: id }]
    })
  }, [])

  useEffect(() => {
    if (rules?.kind !== "link") return
    openRules(rules)
    leave()
  }, [rules])

  const source = rules?.kind === "text" ? rules : GAME_RULES.mtg
  const activeSystem = rules && system ? system : "mtg"
  const glossaryOpen = glossary !== undefined

  const layers = useMemo<readonly RulesSheetLayer[]>(
    () =>
      history.map((entry, index) => {
        const previous = index > 0 ? history[index - 1] : undefined
        const back = previous
          ? {
              label: previous.ruleId
                ? fitBackLabel(previous.ruleId)
                : translate("common:appNavigation.rules"),
              onPress: requestPop,
            }
          : undefined
        return {
          key: entry.key,
          render: ({ active, opened, dragGesture, onOverscrollDismiss }) => (
            <RulesScreen
              source={source}
              system={activeSystem}
              ruleId={entry.ruleId}
              glossary={index === 0 ? glossaryOpen : false}
              initialQuery={index === 0 ? query : undefined}
              active={active}
              sheet
              sheetOpened={opened}
              back={back}
              dragGesture={dragGesture}
              onOverscrollDismiss={onOverscrollDismiss}
              onOpenRule={openRule}
            />
          ),
        }
      }),
    [activeSystem, glossaryOpen, history, openRule, query, requestPop, source],
  )

  if (rules?.kind === "link") return null

  if (isSheet) {
    return (
      <RulesSheet
        key={source.cacheKey}
        layers={layers}
        poppingKey={poppingKey}
        onRequestPop={requestPop}
        onPopped={finishPop}
        onDismiss={dismissBack.onPress}
      />
    )
  }

  const top = history[history.length - 1]
  const previous = history.length > 1 ? history[history.length - 2] : undefined
  const webBack = previous
    ? {
        label: previous.ruleId
          ? fitBackLabel(previous.ruleId)
          : translate("common:appNavigation.rules"),
        onPress: requestPop,
      }
    : dismissBack

  return (
    <RulesScreen
      key={source.cacheKey}
      source={source}
      system={activeSystem}
      ruleId={top?.ruleId}
      glossary={glossaryOpen}
      initialQuery={query}
      back={webBack}
      onOpenRule={openRule}
      onCards={() => router.push({ pathname: "/cards", params: { game: activeSystem } })}
    />
  )
}
