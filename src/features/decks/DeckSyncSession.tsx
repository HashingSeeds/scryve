import { useMemo } from "react"

import {
  ConnectedProfileProvider,
  useConnectedProfile,
} from "@/features/connected/useConnectedProfile"

import { isDeckSyncEnabled } from "./decksSync"
import { useDeckMetadataWrites } from "./decksSyncWrites"
import { useDeckVersionWrites } from "./decksVersionWrites"

function ActiveDeckSync({ ownerId }: { ownerId?: string }) {
  const profile = useConnectedProfile()
  const ready = profile.status === "ready" && profile.profile.userId === ownerId
  useDeckMetadataWrites(true, ownerId, ready)
  useDeckVersionWrites(true, ownerId, ready)
  return null
}

export function DeckSyncSession({ ownerId }: { ownerId?: string }) {
  const enabled = useMemo(() => isDeckSyncEnabled(), [])
  return enabled ? (
    <ConnectedProfileProvider>
      <ActiveDeckSync ownerId={ownerId} />
    </ConnectedProfileProvider>
  ) : null
}
