import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { useQuery } from "convex/react"

import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { DialogCard } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"
import { storage } from "@/utils/storage"

import { useGuestDecks } from "./guestDeck"
import { syncsBackFor, useLocalDeckSync } from "./localDeckSync"
import { api } from "../../../convex/_generated/api"
import { MAX_PREMIUM_DECKS } from "../../../convex/lib/policy"

function dismissedKey(ownerId: string) {
  return `scryve.decks.syncPickerDismissed.v1.${ownerId}`
}

export function LocalDeckSyncNotice({ access }: { access: CloudAccess }) {
  const { themed } = useAppTheme()
  const ownerId = access.ownerId
  const localDecks = useGuestDecks().filter((local) => !syncsBackFor(local, ownerId))
  const capacity = useQuery(api.decks.capacity, access.ready && ownerId ? {} : "skip")
  const [dismissed, setDismissed] = useState(
    () => ownerId !== undefined && storage.getBoolean(dismissedKey(ownerId)) === true,
  )
  const [picking, setPicking] = useState(false)
  const free = capacity ? capacity.limit - capacity.used : 0
  if (!ownerId || !capacity || dismissed || free < 1 || !localDecks.length) return null
  return (
    <View testID="local-deck-sync-notice" style={themed($notice)}>
      <Text size="sm" tx="decks:localSync.notice" txOptions={{ count: localDecks.length, free }} />
      <View style={themed($row)}>
        <Button
          testID="local-deck-sync-choose"
          tx="decks:localSync.choose"
          preset="reversed"
          style={$flex1}
          onPress={() => setPicking(true)}
        />
        <Button
          testID="local-deck-sync-dismiss"
          tx="decks:localSync.keepLocal"
          style={$flex1}
          onPress={() => {
            storage.set(dismissedKey(ownerId), true)
            setDismissed(true)
          }}
        />
      </View>
      {picking ? (
        <LocalDeckSyncPicker
          ownerId={ownerId}
          free={free}
          premium={capacity.premium}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </View>
  )
}

function LocalDeckSyncPicker({
  ownerId,
  free,
  premium,
  onClose,
}: {
  ownerId: string
  free: number
  premium: boolean
  onClose: () => void
}) {
  const { themed } = useAppTheme()
  const billing = useRevenueCat()
  const { sync } = useLocalDeckSync(ownerId)
  const localDecks = useGuestDecks().filter((local) => !syncsBackFor(local, ownerId))
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  function toggle(localId: string) {
    setSelected((current) =>
      current.includes(localId)
        ? current.filter((id) => id !== localId)
        : current.length < free
          ? [...current, localId]
          : current,
    )
  }

  async function syncSelected() {
    setBusy(true)
    setError(undefined)
    try {
      for (const localId of selected) {
        const result = await sync(localId)
        if (result.status !== "synced") {
          setError(translate(`decks:localSync.${result.status}`))
          return
        }
        setSelected((current) => current.filter((id) => id !== localId))
      }
      onClose()
    } catch (cause) {
      setError(convexErrorMessage(cause, translate("decks:localSync.failed")))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogCard
      visible
      onClose={onClose}
      closeDisabled={busy}
      backdropAccessibilityLabel={translate("common:close")}
      dialogTestID="local-deck-sync-picker"
      accessibilityViewIsModal
      style={themed($dialog)}
    >
      <Text preset="subheading" tx="decks:localSync.pickTitle" txOptions={{ count: free }} />
      <ScrollView style={$choices}>
        <View style={themed($stack)}>
          {localDecks.map((local) => (
            <ChoiceButton
              key={local.localId}
              testID={`local-deck-sync-choice-${local.localId}`}
              selected={selected.includes(local.localId)}
              disabled={busy || (!selected.includes(local.localId) && selected.length >= free)}
              text={local.deck.name}
              onPress={() => toggle(local.localId)}
            />
          ))}
        </View>
      </ScrollView>
      {premium ? null : (
        <View style={themed($row)}>
          <Text
            size="xs"
            style={[themed($dim), $flex1]}
            tx="decks:localSync.pro"
            txOptions={{ premiumLimit: MAX_PREMIUM_DECKS }}
          />
          {billing.configured ? (
            <Button
              testID="local-deck-sync-pro"
              tx="decks:localSync.seePro"
              disabled={busy || billing.isLoading}
              onPress={() => void billing.presentPaywall()}
            />
          ) : null}
        </View>
      )}
      {error ? <Text accessibilityRole="alert" size="sm" text={error} /> : null}
      <View style={themed($row)}>
        <Button tx="common:cancel" style={$flex1} disabled={busy} onPress={onClose} />
        <Button
          testID="local-deck-sync-confirm"
          tx={busy ? "decks:localSync.syncing" : "decks:localSync.sync"}
          preset="reversed"
          style={$flex1}
          disabled={busy || !selected.length}
          onPress={() => void syncSelected()}
        />
      </View>
    </DialogCard>
  )
}

const $notice: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $dialog: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
const $flex1: ViewStyle = { flex: 1 }
const $choices: ViewStyle = { maxHeight: 280 }
const $dim: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
