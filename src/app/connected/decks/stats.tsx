import { router, useLocalSearchParams } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import { translate } from "@/i18n/translate"
import { DeckStatsScreen } from "@/screens/DeckStatsScreen"

export default function DeckStatsScreenRoute() {
  const params = useLocalSearchParams<{
    deckKey?: string
    deckName?: string
    game?: string
    format?: string
    source?: string
  }>()
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/connected/decks"))
  return (
    <CloudScreen onBack={leave}>
      {(access) => (
        <DeckStatsScreen
          deckKey={params.deckKey ?? ""}
          deckName={params.deckName ?? translate("decks:deckView.title")}
          game={params.game ?? ""}
          format={params.format ?? ""}
          access={access}
          onBack={leave}
        />
      )}
    </CloudScreen>
  )
}
