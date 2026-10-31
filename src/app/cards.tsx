import { useState, useSyncExternalStore } from "react"
import { router, useLocalSearchParams } from "expo-router"

import { CardSearch } from "@/features/decks/CardSearchScreen"
import { useDeckSearchHost, type DeckSearchHost } from "@/features/decks/deckSearchHost"
import { localGameRepository } from "@/features/game/localPersistence"
import { playSystemFormat, playSystemId } from "@/features/game/playSystems"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/"))

export default function CardsRoute() {
  const { game, deckId } = useLocalSearchParams<{ game?: string; deckId?: string }>()
  const [system] = useState(() =>
    playSystemId(game ?? localGameRepository.loadActiveGame()?.system),
  )
  // why: a cold open has no deck screen in Build, so there is no loaded draft to add to.
  const host = useDeckSearchHost(deckId)
  if (host) return <DeckCardsRoute key={host.game} host={host} />
  return (
    <CardSearch
      key={system}
      game={system}
      format={playSystemFormat(system)}
      presentation="screen"
      onClose={leave}
    />
  )
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
      onClose={leave}
    />
  )
}
