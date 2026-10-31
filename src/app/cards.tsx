import { useState } from "react"
import { router, useLocalSearchParams } from "expo-router"

import { CardSearch } from "@/features/decks/CardSearchScreen"
import { localGameRepository } from "@/features/game/localPersistence"
import { playSystemFormat, playSystemId } from "@/features/game/playSystems"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/"))

export default function CardsRoute() {
  const { game } = useLocalSearchParams<{ game?: string; deckId?: string }>()
  const [system] = useState(() =>
    playSystemId(game ?? localGameRepository.loadActiveGame()?.system),
  )
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
