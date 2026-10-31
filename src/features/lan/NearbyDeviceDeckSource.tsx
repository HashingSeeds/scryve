import { useEffect, useState, type ReactNode } from "react"
import { useQuery } from "convex/react"

import type { LobbyDeviceDecks } from "@/features/connected/LobbySeatList"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import type { MyDecks } from "@/features/decks/LocalDeckChoicesSource"
import { LobbyDeviceDeckSource } from "@/features/lobby/LobbyDeviceDeckSource"

import type { LanSeatDeck, LanSetup } from "./lanGame"
import { nearbySeatDeck } from "./nearbyDecks"
import { api } from "../../../convex/_generated/api"

/** why: a nearby seat carries an account deck version over the LAN, so a device deck syncs first, and the seat takes it once this device's deck list shows it. */
export function NearbyDeviceDeckSource({
  myDecks,
  setup,
  onSelect,
  children,
}: {
  myDecks: MyDecks
  setup: Pick<LanSetup, "system" | "format">
  onSelect: (deck: LanSeatDeck) => void
  children: (device: LobbyDeviceDecks) => ReactNode
}) {
  const online = useConvexOnline()
  const capacity = useQuery(api.decks.capacity)
  const [syncedVersionId, setSyncedVersionId] = useState<string>()

  useEffect(() => {
    const deck = syncedVersionId ? nearbySeatDeck(myDecks, syncedVersionId, setup) : undefined
    if (!deck) return
    setSyncedVersionId(undefined)
    onSelect(deck)
  }, [myDecks, syncedVersionId, setup, onSelect])

  return (
    <LobbyDeviceDeckSource
      online={online}
      capacity={capacity}
      onUse={async (_seat, versionId) => setSyncedVersionId(versionId)}
    >
      {children}
    </LobbyDeviceDeckSource>
  )
}
