import { useEffect, useState, type ReactNode } from "react"
import { useQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { LobbyDeviceDecks } from "@/features/connected/LobbySeatList"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import type { MyDecks } from "@/features/decks/LocalDeckChoicesSource"
import { LobbyDeviceDeckSource } from "@/features/lobby/LobbyDeviceDeckSource"

import type { LanSeatDeck, LanSetup } from "./lanGame"
import { nearbySeatDeck } from "./nearbyDecks"
import { api } from "../../../convex/_generated/api"

type SyncedPick = { versionId: string; done: () => void }

// why: a deck list that never shows the synced deck must not keep the seat's choices locked.
const SYNCED_PICK_TIMEOUT_MS = 15_000

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
  const [canCreate, setCanCreate] = useState<boolean>()
  const [syncedPick, setSyncedPick] = useState<SyncedPick>()

  useEffect(() => {
    const deck = syncedPick ? nearbySeatDeck(myDecks, syncedPick.versionId, setup) : undefined
    if (!syncedPick || !deck) return
    setSyncedPick(undefined)
    onSelect(deck)
    syncedPick.done()
  }, [myDecks, syncedPick, setup, onSelect])

  return (
    <>
      {/* why: without a capacity the deck still syncs, and the server's limit answer says the account is full. */}
      <ConvexQueryBoundary fallback={() => null}>
        <CanCreateQuery onChange={setCanCreate} />
      </ConvexQueryBoundary>
      <LobbyDeviceDeckSource
        online={online}
        capacity={canCreate === undefined ? undefined : { canCreate }}
        // why: the sync stays in progress until the seat takes the deck, so a pick made meanwhile isn't replaced.
        onUse={(_seat, versionId) =>
          new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              setSyncedPick((pick) => (pick?.versionId === versionId ? undefined : pick))
              resolve()
            }, SYNCED_PICK_TIMEOUT_MS)
            setSyncedPick({
              versionId,
              done: () => {
                clearTimeout(timeout)
                resolve()
              },
            })
          })
        }
      >
        {children}
      </LobbyDeviceDeckSource>
    </>
  )
}

function CanCreateQuery({ onChange }: { onChange: (canCreate?: boolean) => void }) {
  const canCreate = useQuery(api.decks.capacity)?.canCreate
  useEffect(() => onChange(canCreate), [canCreate, onChange])
  return null
}
