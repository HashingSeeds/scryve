import { useEffect, useEffectEvent, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { Button } from "@/components/Button"
import { DialogCard } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { FREE_DECK_LIMIT, MAX_PREMIUM_DECKS } from "../../../convex/lib/policy"

type DeckCapacity = FunctionReturnType<typeof api.decks.capacity>

const PRO_COUNT_VISIBLE_REMAINING = 10

export function deckCountVisible({ premium, used, limit }: DeckCapacity) {
  return !premium || limit - used <= PRO_COUNT_VISIBLE_REMAINING
}

export function DeckCount({ access }: { access?: CloudAccess }) {
  return (
    <ConvexQueryBoundary fallback={() => null}>
      <DeckCountLabel access={access} />
    </ConvexQueryBoundary>
  )
}

function DeckCountLabel({ access }: { access?: CloudAccess }) {
  const { themed } = useAppTheme()
  const billing = useRevenueCat()
  const capacity = useQuery(api.decks.capacity, access && !access.ready ? "skip" : {})
  if (!capacity || !deckCountVisible(capacity)) return null
  const upgradable = !capacity.premium && billing.configured
  return (
    <TouchableOpacity
      testID="deck-count"
      accessibilityRole={upgradable ? "button" : "text"}
      accessibilityLabel={`${capacity.used} of ${capacity.limit} ${capacity.premium ? "" : "free "}decks used`}
      accessibilityHint={upgradable ? "Opens Scryve Pro" : undefined}
      disabled={!upgradable || billing.isLoading}
      hitSlop={12}
      onPress={() => void billing.presentPaywall()}
    >
      <Text size="md" style={themed($count)} text={`${capacity.used}/${capacity.limit}`} />
    </TouchableOpacity>
  )
}

type Step =
  { kind: "options" } | { kind: "choose" } | { kind: "confirm"; id: Id<"decks">; name: string }

export function DeckLimitDialog({
  access,
  onClose,
  onRoomMade,
}: {
  access?: CloudAccess
  onClose: () => void
  onRoomMade?: () => void
}) {
  const { themed } = useAppTheme()
  const billing = useRevenueCat()
  const deleteDeck = useMutation(api.decks.archive)
  const [step, setStep] = useState<Step>({ kind: "options" })
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const skip = access && !access.ready
  const capacity = useQuery(api.decks.capacity, skip ? "skip" : {})
  const roomMade = useEffectEvent(() => onRoomMade?.())
  useEffect(() => {
    if (capacity?.canCreate) roomMade()
  }, [capacity?.canCreate])

  async function upgrade() {
    setPaywallOpen(true)
    await billing.presentPaywall()
    setPaywallOpen(false)
  }

  async function confirmDelete(deckId: Id<"decks">) {
    if (skip) return
    setBusy(true)
    setError(undefined)
    try {
      await deleteDeck({ deckId })
      setStep({ kind: "options" })
    } catch (cause) {
      setError(convexErrorMessage(cause, "Could not delete this deck."))
    } finally {
      setBusy(false)
    }
  }

  const premium = capacity?.premium ?? false
  const limit = capacity?.limit ?? (premium ? MAX_PREMIUM_DECKS : FREE_DECK_LIMIT)
  return (
    <DialogCard
      visible={!paywallOpen}
      onClose={onClose}
      closeDisabled={busy}
      backdropAccessibilityLabel="Close deck limit"
      dialogTestID="deck-limit-dialog"
      dialogAccessibilityRole="alert"
      accessibilityViewIsModal
      style={themed($dialog)}
    >
      {step.kind === "options" ? (
        <>
          <View style={themed($copy)}>
            <Text preset="subheading" accessibilityLiveRegion="polite" text="Deck limit reached" />
            <Text
              size="sm"
              style={themed($dim)}
              text={
                premium
                  ? `Pro accounts hold ${limit} decks. Delete a deck to make room.`
                  : `Free accounts hold ${limit} decks. Get Pro for ${MAX_PREMIUM_DECKS}, or delete a deck to make room.`
              }
            />
          </View>
          <View style={themed($stack)}>
            {premium ? null : (
              <Button
                testID="deck-limit-upgrade"
                text="Upgrade to Pro"
                preset="reversed"
                disabled={!billing.configured || billing.isLoading}
                onPress={() => void upgrade()}
              />
            )}
            <Button
              testID="deck-limit-delete"
              text="Delete a deck"
              disabled={!capacity}
              onPress={() => setStep({ kind: "choose" })}
            />
            <Button testID="deck-limit-close" text="Not now" onPress={onClose} />
          </View>
          {!premium && !billing.configured ? (
            <Text
              size="xs"
              style={themed($dim)}
              text={billing.configurationMessage || "Pro purchases are unavailable in this build."}
            />
          ) : null}
        </>
      ) : null}
      {step.kind === "choose" ? (
        <>
          <Text preset="subheading" text="Delete a deck" />
          <ConvexQueryBoundary
            fallback={({ retry }) => (
              <View style={themed($stack)}>
                <Text size="sm" text="Your decks could not load." />
                <Button text="Retry" onPress={retry} />
              </View>
            )}
          >
            <DeckChoices
              access={access}
              onChoose={(id, name) => setStep({ kind: "confirm", id, name })}
            />
          </ConvexQueryBoundary>
          <Button text="Back" onPress={() => setStep({ kind: "options" })} />
        </>
      ) : null}
      {step.kind === "confirm" ? (
        <>
          <View style={themed($copy)}>
            <Text preset="subheading" text={`Delete ${step.name}?`} />
            <Text
              size="sm"
              style={themed($dim)}
              text="Past games keep their record of this deck, but it will no longer be available to pick or edit."
            />
          </View>
          <View style={themed($row)}>
            <Button
              text="Back"
              style={$flex1}
              disabled={busy}
              onPress={() => setStep({ kind: "choose" })}
            />
            <Button
              testID="deck-limit-confirm-delete"
              text={busy ? "Deleting…" : "Delete"}
              style={[$flex1, themed($destructive)]}
              textStyle={themed($destructiveText)}
              disabled={busy}
              onPress={() => void confirmDelete(step.id)}
            />
          </View>
        </>
      ) : null}
      {error || billing.error ? (
        <Text accessibilityRole="alert" size="sm" text={error ?? billing.error ?? ""} />
      ) : null}
    </DialogCard>
  )
}

function DeckChoices({
  access,
  onChoose,
}: {
  access?: CloudAccess
  onChoose: (deckId: Id<"decks">, name: string) => void
}) {
  const { themed } = useAppTheme()
  const mine = useQuery(api.decks.listMine, access && !access.ready ? "skip" : {})
  if (!mine) return <Text size="sm" style={themed($dim)} text="Loading decks…" />
  return (
    <ScrollView style={$choices} testID="deck-limit-choices">
      {mine.decks.map((deck) => (
        <TouchableOpacity
          key={deck._id}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${deck.name}`}
          style={themed($choice)}
          onPress={() => onChoose(deck._id, deck.name)}
        >
          <Text numberOfLines={1} text={deck.name} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const $dialog: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $copy: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flexDirection: "row", gap: spacing.xs })
const $flex1: ViewStyle = { flex: 1 }
const $choices: ViewStyle = { maxHeight: 280 }
const $choice: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 48,
  justifyContent: "center",
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $dim: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $count: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $destructive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.errorBackground,
  borderColor: colors.error,
  borderWidth: 1,
})
const $destructiveText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
