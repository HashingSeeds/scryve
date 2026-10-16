import { useState } from "react"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { translate } from "@/i18n/translate"

import { DeckLimitDialog } from "./DeckLimit"
import { useGuestDeckImport } from "./useGuestDeckImport"

export function GuestDeckImportNotice({
  access,
  transfer,
}: {
  access?: CloudAccess
  transfer: ReturnType<typeof useGuestDeckImport>
}) {
  const [makingRoom, setMakingRoom] = useState(false)
  if (!transfer.guestDecks.length || !access?.ready) return null
  const kept = transfer.result?.limitReached ?? 0
  const imported = transfer.result?.imported ?? 0
  const keptSummary = [
    imported > 0 ? translate("decks:guestImport.synced", { count: imported }) : undefined,
    translate("decks:guestImport.didNotFit", { count: kept }),
  ]
    .filter(Boolean)
    .join(" ")
  return (
    <View>
      {transfer.importing ? (
        <Text
          accessibilityLiveRegion="polite"
          tx="decks:guestImport.syncing"
          txOptions={{ count: transfer.guestDecks.length }}
        />
      ) : null}
      {transfer.error ? (
        <View>
          <Text accessibilityRole="alert" text={transfer.error} />
          <Button
            tx="decks:guestImport.retrySync"
            disabled={transfer.importing}
            onPress={() => void transfer.retry()}
          />
        </View>
      ) : null}
      {kept > 0 ? (
        <>
          <Text size="sm" text={keptSummary} />
          <Button tx="decks:guestImport.makeRoom" onPress={() => setMakingRoom(true)} />
          {makingRoom ? (
            <DeckLimitDialog
              access={access}
              onClose={() => setMakingRoom(false)}
              onRoomMade={() => {
                setMakingRoom(false)
                void transfer.retry()
              }}
            />
          ) : null}
        </>
      ) : null}
    </View>
  )
}

export function GuestDeckTransfer({ access }: { access: CloudAccess }) {
  const transfer = useGuestDeckImport(access)
  return <GuestDeckImportNotice access={access} transfer={transfer} />
}
