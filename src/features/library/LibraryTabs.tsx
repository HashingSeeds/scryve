import { Activity, memo, useCallback, useRef, useState } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"
import { router, useFocusEffect } from "expo-router"

import { AppTabBar, type AppTab } from "@/components/AppTabBar"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { CloudScreen, type CloudAccess } from "@/features/auth/CloudScreen"
import { useAccountEntry } from "@/features/auth/useAccountEntry"
import { CardsCollection } from "@/features/collection/CardsCollection"
import { CardSearch } from "@/features/decks/CardSearchScreen"
import { localGameRepository } from "@/features/game/localPersistence"
import {
  isPlaySystemId,
  playSystemFormat,
  playSystemId,
  type PlaySystemId,
} from "@/features/game/playSystems"
import type { BackAction } from "@/features/game/useBackToBoard"
import { gameRules, RULES_TEXT_IN_APP, rulesHref } from "@/features/rules/gameRules"
import { prereleaseBuild } from "@/features/updates/appUpdate"
import { translate } from "@/i18n/translate"
import { DecksScreen } from "@/screens/DecksScreen"
import { captureAnalytics } from "@/utils/analytics"

export function LibraryTabs({
  initial,
  back,
  decksSystem,
  cardsGame,
}: {
  initial: AppTab
  back: BackAction
  decksSystem?: string
  cardsGame?: string
}) {
  const [tab, setTab] = useState(initial)
  const [opened, setOpened] = useState<ReadonlySet<AppTab>>(() => new Set([initial]))
  const account = useAccountEntry()
  const [cardsSystem, setCardsSystem] = useState(() =>
    playSystemId(cardsGame ?? localGameRepository.loadActiveGame()?.system),
  )
  const shelfSystem = useRef<string>(undefined)
  const rememberShelfSystem = useCallback((system: string) => {
    shelfSystem.current = system
  }, [])
  useFocusEffect(
    useCallback(() => {
      if (tab === "decks") captureAnalytics("deck_used", { feature: "library" })
    }, [tab]),
  )

  return (
    <View style={$fill}>
      {TABS.map((id) => (
        // why: a tab not yet opened renders at idle priority while hidden, so its first tap only shows it; once opened it stays mounted, since hiding it again would drop its Convex subscriptions.
        <Activity key={id} mode={opened.has(id) ? "visible" : "hidden"}>
          <View style={tab === id ? $fill : $hidden}>
            {id === "decks" ? (
              <DecksTab
                back={back}
                initialSystem={decksSystem}
                onSystemChange={rememberShelfSystem}
              />
            ) : (
              <CardsTab back={back} system={cardsSystem} onSystemChange={setCardsSystem} />
            )}
          </View>
        </Activity>
      ))}
      <AppTabBar
        tab={tab}
        onSelect={(next) => {
          if (next === "cards" && !opened.has("cards") && isPlaySystemId(shelfSystem.current))
            setCardsSystem(shelfSystem.current)
          setOpened((current) => (current.has(next) ? current : new Set([...current, next])))
          setTab(next)
        }}
        utility={{
          accountEntry: account.accountEntry,
          onAccount: account.onAccount,
          onHistory: () => router.push("/history"),
          onSettings: () => router.push("/settings"),
          onSupport: () => router.push("/support"),
        }}
      />
    </View>
  )
}

const DecksTab = memo(function DecksTab({
  back,
  initialSystem,
  onSystemChange,
}: {
  back: BackAction
  initialSystem?: string
  onSystemChange: (system: string) => void
}) {
  const auth = useAuthAccess()
  const screen = (access?: CloudAccess) => (
    <DecksScreen
      access={access}
      initialSystem={initialSystem}
      back={back}
      onAddDeck={() => router.push("/connected/decks/add")}
      onSystemChange={onSystemChange}
      onSelect={(deck) =>
        router.push({
          pathname: "/connected/decks/[deckId]",
          params: {
            deckId: deck.deckId,
            ...(deck.reviewChanges ? { reviewChanges: "true" } : {}),
            deckName: deck.name,
            deckGame: deck.game,
            deckFormat: deck.format,
            ...(deck.cardQuantity !== undefined
              ? { deckCardQuantity: String(deck.cardQuantity) }
              : {}),
          },
        })
      }
      unavailableMessage={
        !auth.configured
          ? auth.configurationMessage || translate("decks:shelf.syncUnavailable")
          : undefined
      }
    />
  )
  if (!auth.configured) return screen()
  return <CloudScreen onBack={() => router.back()}>{screen}</CloudScreen>
})

const CardsTab = memo(function CardsTab({
  back,
  system,
  onSystemChange,
}: {
  back: BackAction
  system: PlaySystemId
  onSystemChange: (system: PlaySystemId) => void
}) {
  const onOpenRules =
    RULES_TEXT_IN_APP && gameRules(system)?.kind === "text"
      ? (options?: { query?: string; rule?: string }) =>
          router.push(rulesHref(system, options?.rule, options?.query))
      : undefined
  const shared = {
    game: system,
    format: playSystemFormat(system),
    back,
    onGameChange: onSystemChange,
    onOpenRules,
  }
  return prereleaseBuild() ? (
    <CardsCollection key={system} {...shared} />
  ) : (
    <CardSearch key={system} {...shared} presentation="screen" onClose={back.onPress} />
  )
})

const TABS: readonly AppTab[] = ["decks", "cards"]

const $fill: ViewStyle = { flex: 1 }
const $hidden: ViewStyle = { display: "none" }
