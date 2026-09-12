import { useMemo } from "react"

import { isDeckSyncEnabled } from "./decksSync"
import { useDeckMetadataWrites } from "./decksSyncWrites"

function ActiveDeckSync({ ownerId }: { ownerId?: string }) {
  useDeckMetadataWrites(true, ownerId)
  return null
}

export function DeckSyncSession({ ownerId }: { ownerId?: string }) {
  const enabled = useMemo(() => isDeckSyncEnabled(), [])
  return enabled ? <ActiveDeckSync ownerId={ownerId} /> : null
}
