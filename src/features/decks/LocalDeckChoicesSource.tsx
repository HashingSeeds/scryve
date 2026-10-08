import { useEffect } from "react"
import { useQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import {
  ConnectedProfileProvider,
  useConnectedProfile,
} from "@/features/connected/useConnectedProfile"
import type { DeckChoice } from "@/screens/NewGameScreen"

import { api } from "../../../convex/_generated/api"

// why: the "This is me" seat offers the account's decks, read once the user row is synced.
function DeckChoicesQuery({ onChange }: { onChange: (decks?: DeckChoice[]) => void }) {
  const profile = useConnectedProfile()
  const mine = useQuery(api.decks.listMine, profile.status === "ready" ? {} : "skip")
  useEffect(() => {
    if (!mine) return
    onChange(
      mine.decks.flatMap((deck) =>
        deck.latestVersionId
          ? [
              {
                versionId: deck.latestVersionId,
                name: deck.name,
                system: deck.game,
                format: deck.format,
              },
            ]
          : [],
      ),
    )
  }, [mine, onChange])
  return null
}

export function LocalDeckChoicesSource({ onChange }: { onChange: (decks?: DeckChoice[]) => void }) {
  return (
    <ConvexQueryBoundary fallback={() => null}>
      <ConnectedProfileProvider>
        <DeckChoicesQuery onChange={onChange} />
      </ConnectedProfileProvider>
    </ConvexQueryBoundary>
  )
}
