import { useEffect } from "react"
import { useQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import {
  ConnectedProfileProvider,
  useConnectedProfile,
} from "@/features/connected/useConnectedProfile"
import type { DeckChoice } from "@/screens/NewGameScreen"

import { api } from "../../../convex/_generated/api"

export type DeckChoices = DeckChoice[] | "unavailable" | undefined

// why: the "This is me" seat offers the account's decks, read once the user row is synced.
function DeckChoicesQuery({ onChange }: { onChange: (decks: DeckChoices) => void }) {
  const profile = useConnectedProfile()
  const mine = useQuery(api.decks.listMine, profile.status === "ready" ? {} : "skip")
  const unreachable = profile.status === "offline" || profile.status === "error"
  useEffect(() => {
    if (!mine) {
      if (unreachable) onChange("unavailable")
      return
    }
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
  }, [mine, onChange, unreachable])
  return null
}

function ReportUnavailable({ onChange }: { onChange: (decks: DeckChoices) => void }) {
  useEffect(() => onChange("unavailable"), [onChange])
  return null
}

export function LocalDeckChoicesSource({ onChange }: { onChange: (decks: DeckChoices) => void }) {
  return (
    <ConvexQueryBoundary fallback={() => <ReportUnavailable onChange={onChange} />}>
      <ConnectedProfileProvider>
        <DeckChoicesQuery onChange={onChange} />
      </ConnectedProfileProvider>
    </ConvexQueryBoundary>
  )
}
