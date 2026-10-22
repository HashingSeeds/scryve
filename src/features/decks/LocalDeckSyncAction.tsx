import { useState } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"
import { useQuery } from "convex/react"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { DeckLimitDialog } from "./DeckLimit"
import { LocalDeckAccountDialog } from "./LocalDeckAccountDialog"
import { useLocalDeckSync, type LocalDeckSyncResult } from "./localDeckSync"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export function LocalDeckSyncAction({
  access,
  localId,
  disabled,
  onSynced,
  onSyncingChange,
}: {
  access?: CloudAccess
  localId: string
  disabled: boolean
  onSynced: (deckId: Id<"decks">) => void
  onSyncingChange: (syncing: boolean) => void
}) {
  const { themed } = useAppTheme()
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

  return (
    <View testID="local-deck-sync" style={themed($row)}>
      <Text
        size="xs"
        style={$flex1}
        text={
          capacity
            ? translate("decks:localSync.onDeviceCount", {
                used: capacity.used,
                limit: capacity.limit,
              })
            : translate("decks:shelf.onDevice")
        }
      />
      {access?.ready ? (
        <Button
          testID="local-deck-sync-button"
          tx={busy ? "decks:localSync.syncing" : "decks:localSync.sync"}
          disabled={busy || disabled}
          onPress={() => void syncDeck()}
        />
      ) : null}
      {error ? <Text accessibilityRole="alert" size="xs" text={error} /> : null}
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
    </View>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "center",
  gap: spacing.xs,
})
const $flex1: ViewStyle = { flex: 1 }
