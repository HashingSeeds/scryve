import { useCallback, useEffect } from "react"
import { useConvex, useQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import {
  ConnectedProfileProvider,
  useConnectedProfile,
} from "@/features/connected/useConnectedProfile"
import {
  DeckSyncRepository,
  getDeckSyncController,
  isDeckSyncEnabled,
  type MineDeck,
} from "@/features/decks/decksSync"
import type { DeckChoice } from "@/screens/NewGameScreen"

import { api } from "../../../convex/_generated/api"

export type MyDecks = readonly MineDeck[] | "unavailable" | undefined
export type DeckChoices = DeckChoice[] | "unavailable" | undefined

function MyDecksQuery({
  ownerId,
  onChange,
}: {
  ownerId: string
  onChange: (decks: MyDecks) => void
}) {
  const client = useConvex()
  const profile = useConnectedProfile()
  const mine = useQuery(api.decks.listMine, profile.status === "ready" ? {} : "skip")
  const unreachable = profile.status === "offline" || profile.status === "error"
  useEffect(() => {
    if (mine) {
      if (isDeckSyncEnabled()) getDeckSyncController(client, ownerId).saveShelf(mine.decks)
      return onChange(mine.decks)
    }
    if (!unreachable) return
    const cached = new DeckSyncRepository(ownerId, undefined, client.url).loadShelf()
    onChange(cached.length > 0 ? cached : "unavailable")
  }, [client, mine, onChange, ownerId, unreachable])
  return null
}

function ReportCached({
  ownerId,
  onChange,
}: {
  ownerId: string
  onChange: (decks: MyDecks) => void
}) {
  const client = useConvex()
  useEffect(() => {
    const cached = new DeckSyncRepository(ownerId, undefined, client.url).loadShelf()
    onChange(cached.length > 0 ? cached : "unavailable")
  }, [client, onChange, ownerId])
  return null
}

export function MyDecksSource({
  ownerId,
  onChange,
}: {
  ownerId: string
  onChange: (decks: MyDecks) => void
}) {
  return (
    <ConvexQueryBoundary fallback={() => <ReportCached ownerId={ownerId} onChange={onChange} />}>
      <ConnectedProfileProvider>
        <MyDecksQuery ownerId={ownerId} onChange={onChange} />
      </ConnectedProfileProvider>
    </ConvexQueryBoundary>
  )
}

const deckChoicesOf = (decks: MyDecks): DeckChoices =>
  decks === undefined || decks === "unavailable"
    ? decks
    : decks.flatMap((deck) =>
        deck.latestVersionId
          ? [
              {
                versionId: deck.latestVersionId,
                name: deck.name,
                system: deck.game,
                format: deck.format,
                startingValue: deck.startingValue,
              },
            ]
          : [],
      )

export function LocalDeckChoicesSource({
  ownerId,
  onChange,
}: {
  ownerId: string
  onChange: (decks: DeckChoices) => void
}) {
  const reportChoices = useCallback((decks: MyDecks) => onChange(deckChoicesOf(decks)), [onChange])
  return <MyDecksSource ownerId={ownerId} onChange={reportChoices} />
}
