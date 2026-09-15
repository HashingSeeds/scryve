import { useMemo } from "react"

import { isDeckSyncEnabled } from "./decksSync"
import { useDeckMetadataWrites } from "./decksSyncWrites"
import { useDeckVersionWrites } from "./decksVersionWrites"

function ActiveDeckSync({ ownerId }: { ownerId?: string }) {
  useDeckMetadataWrites(true, ownerId)
  useDeckVersionWrites(true, ownerId)
  return null
}

export function DeckSyncSession({ ownerId }: { ownerId?: string }) {
  const enabled = useMemo(() => isDeckSyncEnabled(), [])
  return enabled ? <ActiveDeckSync ownerId={ownerId} /> : null
}
