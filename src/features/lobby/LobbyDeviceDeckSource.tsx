import { useRef, useState, type ReactNode } from "react"
import { useUser } from "@clerk/expo"
import { useConvex } from "convex/react"

import type { LobbyDeviceDecks } from "@/features/connected/LobbySeatList"
import { useGuestDecks } from "@/features/decks/guestDeck"
import { LocalDeckAccountDialog } from "@/features/decks/LocalDeckAccountDialog"
import { useLocalDeckSync, type LocalDeckSyncResult } from "@/features/decks/localDeckSync"
import { translate } from "@/i18n/translate"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

type OtherAccount = {
  seat: number
  result: Extract<LocalDeckSyncResult, { status: "other_account" }>
}

export function LobbyDeviceDeckSource({
  online,
  capacity,
  onUse,
  children,
}: {
  online: boolean
  capacity?: { canCreate: boolean }
  onUse: (seat: number, deckVersionId: string) => Promise<void>
  children: (device: LobbyDeviceDecks) => ReactNode
}) {
  const convex = useConvex()
  const { user } = useUser()
  const locals = useGuestDecks()
  const { sync } = useLocalDeckSync(user?.id)
  const [syncingLocalId, setSyncingLocalId] = useState<string>()
  const syncingRef = useRef<string>(undefined)
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  const [otherAccount, setOtherAccount] = useState<OtherAccount>()

  function setSyncing(localId: string | undefined) {
    syncingRef.current = localId
    setSyncingLocalId(localId)
  }

  function setError(localId: string, error?: string) {
    setErrors(({ [localId]: _previous, ...rest }) => (error ? { ...rest, [localId]: error } : rest))
  }

  async function pickSynced(seat: number, deckId: Id<"decks">) {
    const { version } = await convex.query(api.decks.detail, { deckId })
    if (version) await onUse(seat, version._id)
  }

  async function syncAndUse(seat: number, localId: string) {
    if (syncingRef.current) return
    setSyncing(localId)
    setError(localId)
    try {
      const result = await sync(localId)
      // why: once synced, the deck is listed under Account, so a failed pick there is a tap away.
      if (result.status === "synced") await pickSynced(seat, result.deckId).catch(() => undefined)
      else if (result.status === "other_account") setOtherAccount({ seat, result })
      else
        setError(
          localId,
          result.status === "limit_reached"
            ? translate("connected:seats.accountFull")
            : translate(`decks:localSync.${result.status}`),
        )
    } catch (cause) {
      setError(localId, convexErrorMessage(cause, translate("decks:localSync.failed")))
    } finally {
      setSyncing(undefined)
    }
  }

  const syncBlockedReason = !online
    ? translate("connected:seats.reconnectToSync")
    : capacity?.canCreate === false
      ? translate("connected:seats.accountFull")
      : undefined

  return (
    <>
      {children({
        decks: locals.map((local) => ({
          localId: local.localId,
          deckKey: local.deckKey ?? local.localId,
          game: local.deck.game,
          format: local.deck.format,
          name: local.deck.name,
          cardQuantity: local.deck.cards.reduce((total, card) => total + card.quantity, 0),
          syncBlockedReason,
          error: errors[local.localId],
        })),
        syncingLocalId,
        onSyncAndUse: (seat, localId) => void syncAndUse(seat, localId),
      })}
      {otherAccount ? (
        <LocalDeckAccountDialog
          result={otherAccount.result}
          onClose={() => setOtherAccount(undefined)}
          onSynced={(deckId) => {
            const { seat } = otherAccount
            setOtherAccount(undefined)
            void pickSynced(seat, deckId).catch(() => undefined)
          }}
        />
      ) : null}
    </>
  )
}
