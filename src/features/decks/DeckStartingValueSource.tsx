import { useEffect } from "react"
import { useQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { useConvexOnline } from "@/features/connected/useConvexOnline"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export type DeckStartingValue = { versionId: string; value: number | null }

type SourceProps = {
  versionId: string
  onChange: (value: DeckStartingValue | undefined) => void
}

function StartingValueQuery({ versionId, onChange }: SourceProps) {
  const online = useConvexOnline()
  const value = useQuery(api.decks.startingValue, { versionId: versionId as Id<"deckVersions"> })
  useEffect(() => {
    onChange(value !== undefined || !online ? { versionId, value: value ?? null } : undefined)
  }, [value, versionId, online, onChange])
  return null
}

function ReportUnknown({ versionId, onChange }: SourceProps) {
  useEffect(() => onChange({ versionId, value: null }), [versionId, onChange])
  return null
}

export function DeckStartingValueSource(props: SourceProps) {
  return (
    <ConvexQueryBoundary fallback={() => <ReportUnknown {...props} />}>
      <StartingValueQuery {...props} />
    </ConvexQueryBoundary>
  )
}
