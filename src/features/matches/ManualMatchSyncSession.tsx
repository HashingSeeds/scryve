import {
  ConnectedProfileProvider,
  useConnectedProfile,
} from "@/features/connected/useConnectedProfile"

import { useManualMatchOutbox } from "./matchOutbox"

function ActiveManualMatchSync({ ownerId }: { ownerId?: string }) {
  const profile = useConnectedProfile()
  useManualMatchOutbox(ownerId, profile.status === "ready" && profile.profile.userId === ownerId)
  return null
}

export function ManualMatchSyncSession({ ownerId }: { ownerId?: string }) {
  return (
    <ConnectedProfileProvider>
      <ActiveManualMatchSync ownerId={ownerId} />
    </ConnectedProfileProvider>
  )
}
