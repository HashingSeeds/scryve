import { useEffect } from "react"
import { useQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export type DeckStartingValue = { versionId: string; value: number }

function StartingValueQuery({
  versionId,
  onChange,
}: {
  versionId: string
  onChange: (value: DeckStartingValue | undefined) => void
}) {
  const value = useQuery(api.decks.startingValue, { versionId: versionId as Id<"deckVersions"> })
  useEffect(() => {
    onChange(typeof value === "number" ? { versionId, value } : undefined)
  }, [value, versionId, onChange])
  return null
}

export function DeckStartingValueSource(props: {
  versionId: string
  onChange: (value: DeckStartingValue | undefined) => void
}) {
  return (
    <ConvexQueryBoundary fallback={() => null}>
      <StartingValueQuery {...props} />
    </ConvexQueryBoundary>
  )
}
