import { View } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import type { CloudAccess } from "@/features/auth/CloudScreen"

import { AccountDeckCapacity } from "./AccountDeckCapacity"
import { useGuestDeckImport } from "./useGuestDeckImport"

function deckCount(count: number) {
  return `${count} ${count === 1 ? "deck" : "decks"}`
}

export function GuestDeckImportNotice({
  access,
  transfer,
}: {
  access?: CloudAccess
  transfer: ReturnType<typeof useGuestDeckImport>
}) {
  if (!transfer.guestDecks.length || !access?.ready) return null
  const kept = transfer.result?.limitReached ?? 0
  const imported = transfer.result?.imported ?? 0
  return (
    <View>
      {transfer.importing ? (
        <Text
          accessibilityLiveRegion="polite"
          text={
            transfer.guestDecks.length > 1
              ? "Syncing your saved decks…"
              : "Syncing your saved deck…"
          }
        />
      ) : null}
      {transfer.error ? (
        <View>
          <Text accessibilityRole="alert" text={transfer.error} />
          <Button
            text="Retry sync"
            disabled={transfer.importing}
            onPress={() => void transfer.retry()}
          />
        </View>
      ) : null}
      {kept > 0 ? (
        <>
          <Text
            size="sm"
            text={[
              imported > 0 ? `Synced ${deckCount(imported)}.` : undefined,
              `${deckCount(kept)} did not fit and ${kept > 1 ? "are" : "is"} still saved on this device.`,
            ]
              .filter(Boolean)
              .join(" ")}
          />
          <AccountDeckCapacity access={access} onArchived={() => void transfer.retry()} />
        </>
      ) : null}
    </View>
  )
}

export function GuestDeckTransfer({ access }: { access: CloudAccess }) {
  const transfer = useGuestDeckImport(access)
  return <GuestDeckImportNotice access={access} transfer={transfer} />
}
