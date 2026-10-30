import { useState } from "react"
import { useQuery } from "convex/react"

import type { CloudAccess } from "@/features/auth/CloudScreen"
import { translate } from "@/i18n/translate"
import { convexErrorMessage } from "@/utils/convexError"

import { DeckLimitDialog } from "./DeckLimit"
import { LocalDeckAccountDialog } from "./LocalDeckAccountDialog"
import { useLocalDeckSync, type LocalDeckSyncResult } from "./localDeckSync"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

// why: render `dialogs` outside the sheet that starts the sync, or closing the sheet drops them mid-sync.
export function useLocalDeckSyncAction({
  access,
  localId,
  onSynced,
  onSyncingChange,
}: {
  access?: CloudAccess
  localId: string
  onSynced: (deckId: Id<"decks">) => void
  onSyncingChange: (syncing: boolean) => void
}) {
  const { sync } = useLocalDeckSync(access?.ownerId)
  const capacity = useQuery(api.decks.capacity, access?.ready ? {} : "skip")
  const [busy, setBusy] = useState(false)
  const [otherAccount, setOtherAccount] =
    useState<Extract<LocalDeckSyncResult, { status: "other_account" }>>()
  const [error, setError] = useState<string>()
  const [makingRoom, setMakingRoom] = useState(false)

  async function syncDeck() {
    setBusy(true)
    onSyncingChange(true)
    setError(undefined)
    try {
      const result = await sync(localId)
      if (result.status === "synced") onSynced(result.deckId)
      else if (result.status === "other_account") setOtherAccount(result)
      else if (result.status === "limit_reached") setMakingRoom(true)
      else setError(translate(`decks:localSync.${result.status}`))
    } catch (cause) {
      setError(convexErrorMessage(cause, translate("decks:localSync.failed")))
    } finally {
      setBusy(false)
      onSyncingChange(false)
    }
  }

  return {
    busy,
    error,
    capacityLabel: capacity
      ? translate("decks:deckLimit.countLabel", { used: capacity.used, limit: capacity.limit })
      : undefined,
    sync: () => void syncDeck(),
    dialogs: (
      <>
        {otherAccount ? (
          <LocalDeckAccountDialog
            result={otherAccount}
            onClose={() => setOtherAccount(undefined)}
            onSynced={(deckId) => {
              setOtherAccount(undefined)
              onSynced(deckId)
            }}
            onSyncingChange={onSyncingChange}
          />
        ) : null}
        {makingRoom ? (
          <DeckLimitDialog
            access={access}
            onClose={() => setMakingRoom(false)}
            onRoomMade={() => {
              setMakingRoom(false)
              void syncDeck()
            }}
          />
        ) : null}
      </>
    ),
  }
}
