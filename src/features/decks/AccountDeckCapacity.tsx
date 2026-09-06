import { useEffect, useState } from "react"
import { ScrollView, View, type ViewStyle } from "react-native"
import { useMutation, useQuery } from "convex/react"

import { Button } from "@/components/Button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { MAX_PREMIUM_DECKS } from "../../../convex/lib/policy"

export function AccountDeckCapacity(props: { access?: CloudAccess; onArchived?: () => void }) {
  return (
    <ConvexQueryBoundary
      fallback={({ retry }) => (
        <View>
          <Text text="Deck slots unavailable. Your draft is kept." />
          <Button text="Retry" onPress={retry} />
        </View>
      )}
    >
      <AccountDeckCapacityControls {...props} />
    </ConvexQueryBoundary>
  )
}

function AccountDeckCapacityControls({
  access,
  onArchived,
}: {
  access?: CloudAccess
  onArchived?: () => void
}) {
  const { themed } = useAppTheme()
  const mine = useQuery(api.decks.listMine, access && !access.ready ? "skip" : {})
  const archive = useMutation(api.decks.archive)
  const billing = useRevenueCat()
  const [choosing, setChoosing] = useState(false)
  const [selected, setSelected] = useState<{ id: Id<"decks">; name: string }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (mine?.capacity.canCreate) onArchived?.()
  }, [mine?.capacity.canCreate, onArchived])
  async function confirm() {
    if (!selected || (access && !access.ready)) return
    setBusy(true)
    setError(undefined)
    try {
      await archive({ deckId: selected.id })
      setSelected(undefined)
      setChoosing(false)
      onArchived?.()
    } catch (cause) {
      setError(convexErrorMessage(cause, "Could not archive this deck."))
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={themed($notice)} testID="account-deck-capacity">
      <Text weight="bold" text="Your deck slots are full" />
      <Text
        size="sm"
        text={
          mine?.capacity.premium
            ? "Archive a deck to make room."
            : `Get Pro for ${MAX_PREMIUM_DECKS} decks, or archive a deck to make room.`
        }
      />
      <View style={themed($actions)}>
        {!mine?.capacity.premium && billing.configured ? (
          <Button
            text="Get Pro"
            disabled={billing.isLoading}
            onPress={() => void billing.presentPaywall()}
          />
        ) : null}
        <Button text="Choose a deck" disabled={!mine} onPress={() => setChoosing(!choosing)} />
      </View>
      {choosing ? (
        <ScrollView style={$deckChoices}>
          {mine?.decks.map((deck) => (
            <Button
              key={deck._id}
              text={`Archive ${deck.name}`}
              onPress={() => setSelected({ id: deck._id, name: deck.name })}
            />
          ))}
        </ScrollView>
      ) : null}
      {error || billing.error ? (
        <Text accessibilityRole="alert" text={error ?? billing.error ?? ""} />
      ) : null}
      <ConfirmDialog
        visible={Boolean(selected)}
        title={`Archive ${selected?.name ?? "deck"}?`}
        message="This frees a deck slot. Your new deck will stay here."
        confirmText="Archive deck"
        cancelText="Keep deck"
        busy={busy}
        onConfirm={() => void confirm()}
        onClose={() => setSelected(undefined)}
      />
    </View>
  )
}
const $notice: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderTopWidth: 1,
  borderColor: colors.separator,
  paddingVertical: spacing.sm,
  gap: spacing.xs,
})
const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  flexWrap: "wrap",
})

const $deckChoices: ViewStyle = { maxHeight: 180 }
