import { useState, useSyncExternalStore } from "react"
import { router, useLocalSearchParams } from "expo-router"

import { CardSearch } from "@/features/decks/CardSearchScreen"
import { useDeckSearchHost, type DeckSearchHost } from "@/features/decks/deckSearchHost"
import { localGameRepository } from "@/features/game/localPersistence"
import { playSystemFormat, playSystemId } from "@/features/game/playSystems"
import { gameRules, RULES_TEXT_IN_APP, rulesHref } from "@/features/rules/gameRules"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/"))

export default function CardsRoute() {
  const { game, deckId } = useLocalSearchParams<{ game?: string; deckId?: string }>()
  const [system, setSystem] = useState(() =>
    playSystemId(game ?? localGameRepository.loadActiveGame()?.system),
  )
  const host = useDeckSearchHost(deckId)
  if (host) return <DeckCardsRoute key={host.game} host={host} />
  const onOpenRules =
    RULES_TEXT_IN_APP && gameRules(system)?.kind === "text"
      ? (options?: { query?: string; rule?: string }) =>
          router.push(rulesHref(system, options?.rule, options?.query))
      : undefined
  return (
    <CardSearch
      key={system}
      game={system}
      format={playSystemFormat(system)}
      presentation="screen"
      onGameChange={setSystem}
      onOpenRules={onOpenRules}
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
