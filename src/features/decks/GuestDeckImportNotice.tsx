import { View } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import type { CloudAccess } from "@/features/auth/CloudScreen"

import { AccountDeckCapacity } from "./AccountDeckCapacity"
import { useGuestDeckImport } from "./useGuestDeckImport"

export function GuestDeckImportNotice({
  access,
  transfer,
}: {
  access?: CloudAccess
  transfer: ReturnType<typeof useGuestDeckImport>
}) {
  if (!transfer.guestDeck || !access?.ready) return null
  return (
    <View>
      {transfer.importing ? (
        <Text accessibilityLiveRegion="polite" text="Syncing your saved deck…" />
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
      {transfer.result?.status === "limit_reached" ? (
        <>
          <Text size="sm" text="Your deck is still saved on this device." />
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
