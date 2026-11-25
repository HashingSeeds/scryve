import { useSyncExternalStore } from "react"
import { router, useLocalSearchParams } from "expo-router"

import { CardSearch } from "@/features/decks/CardSearchScreen"
import { useDeckSearchHost, type DeckSearchHost } from "@/features/decks/deckSearchHost"
import { useBackToBoard } from "@/features/game/useBackToBoard"
import { LibraryTabs } from "@/features/library/LibraryTabs"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/"))

export default function CardsRoute() {
  const { game, deckId } = useLocalSearchParams<{ game?: string; deckId?: string }>()
  const host = useDeckSearchHost(deckId)
  const back = useBackToBoard()
  if (host) return <DeckCardsRoute key={host.game} host={host} />
  return <LibraryTabs initial="cards" back={back} cardsGame={game} />
}

function DeckCardsRoute({ host }: { host: DeckSearchHost }) {
  const cards = useSyncExternalStore(host.subscribe, host.cards, host.cards)
  return (
    <CardSearch
      game={host.game}
      format={host.format}
      presentation="screen"
      offlineCandidates={host.offlineCandidates}
      commanderCards={cards}
      deckCards={cards}
      onAdd={host.onAdd}
      onRemove={host.onRemove}
      onReplace={host.onReplace}
      onClose={leave}
    />
  )
}
