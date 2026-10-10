import { useEffect, useState, useSyncExternalStore } from "react"
import { useConvex } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../../convex/_generated/api"
import { pokemonCardFromCatalog } from "../../../convex/lib/table"

type SearchResult = FunctionReturnType<typeof api.cards.search>[number]
export type PokemonSearchHit = Extract<SearchResult, { cardId: string }>
export type PokemonCatalogPick = ReturnType<typeof pokemonCardFromCatalog>

const SEARCH_DEBOUNCE_MS = 350
const MIN_QUERY = 2
const noSubscription = () => {}

/**
 * why: placing a Pokémon starts from the shared card catalog so HP and prize value come from the printed card. Search results carry no HP, so a pick does one lookup; the board falls back to typed values when there is no catalog to reach.
 */
export function usePokemonCatalog(query: string) {
  const convex = useConvex()
  // why: a local game may run with no Convex client at all, which the stock connection hook treats as a bug.
  const online = useSyncExternalStore(
    (listener) => convex?.subscribeToConnectionState(listener) ?? noSubscription,
    () => convex?.connectionState().isWebSocketConnected ?? false,
    () => false,
  )
  const available = Boolean(convex) && online
  const wanted = query.trim()
  const searching = available && wanted.length >= MIN_QUERY
  const [state, setState] = useState<{
    query: string
    hits?: PokemonSearchHit[]
    error?: string
  }>({ query: "" })

  useEffect(() => {
    if (!searching || !convex) return
    let active = true
    const timer = setTimeout(async () => {
      try {
        const found = await convex.action(api.cards.search, { game: "pokemon", query: wanted })
        if (!active) return
        setState({
          query: wanted,
          hits: found.filter((card): card is PokemonSearchHit => "cardId" in card),
        })
      } catch (cause) {
        if (active)
          setState({ query: wanted, error: convexErrorMessage(cause, "Card search unavailable.") })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [convex, searching, wanted])

  const current = state.query === wanted ? state : undefined

  async function pick(hit: Pick<PokemonSearchHit, "cardId">): Promise<PokemonCatalogPick> {
    if (!convex) throw new Error("Card catalog unavailable")
    const card = await convex.action(api.cards.byCatalogId, {
      game: "pokemon",
      cardId: hit.cardId,
    })
    return pokemonCardFromCatalog(card)
  }

  return {
    available,
    searching,
    busy: searching && !current,
    hits: searching ? current?.hits : undefined,
    error: searching ? current?.error : undefined,
    pick,
  }
}
