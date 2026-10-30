import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Platform, ScrollView, TouchableOpacity, View } from "react-native"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { Button } from "@/components/Button"
import { DialogCard } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { useDecksWithQueuedEdits, useLocalDeckSync } from "./localDeckSync"
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
      accessibilityLabel={translate(
        capacity.premium ? "decks:deckLimit.countLabel" : "decks:deckLimit.countLabelFree",
        { used: capacity.used, limit: capacity.limit },
      )}
      accessibilityHint={upgradable ? translate("decks:deckLimit.opensPro") : undefined}
      disabled={!upgradable || billing.isLoading}
      hitSlop={12}
      onPress={() => void billing.presentPaywall()}
    >
      <Text
        size="md"
        maxFontSizeMultiplier={1.5}
        style={themed($count)}
        text={`${capacity.used}/${capacity.limit}`}
      />
    </TouchableOpacity>
  )
}

type Step =
  { kind: "options" } | { kind: "choose" } | { kind: "confirm"; id: Id<"decks">; name: string }

type DeckLimitDialogProps = {
  access?: CloudAccess
  onClose: () => void
  onRoomMade?: () => void
}

type PaywallState = "closed" | "waitingForDismiss" | "open"

export function DeckLimitDialog(props: DeckLimitDialogProps) {
  const { themed } = useAppTheme()
  const billing = useRevenueCat()
  const [paywall, setPaywall] = useState<PaywallState>("closed")
  const [busy, setBusy] = useState(false)

  async function presentPaywall() {
    setPaywall("open")
    await billing.presentPaywall({ showsErrorInline: true })
    setPaywall("closed")
  }

  function upgrade() {
    if (Platform.OS === "ios") setPaywall("waitingForDismiss")
    else void presentPaywall()
  }

  return (
    <DialogCard
      visible={paywall === "closed"}
      onDismissed={paywall === "waitingForDismiss" ? () => void presentPaywall() : undefined}
      onClose={props.onClose}
      closeDisabled={busy}
      backdropAccessibilityLabel={translate("decks:deckLimit.close")}
      dialogTestID="deck-limit-dialog"
      dialogAccessibilityRole="alert"
      accessibilityViewIsModal
      style={themed($dialog)}
    >
      <ConvexQueryBoundary
        fallback={({ retry }) => (
          <>
            <Text size="sm" tx="decks:deckLimit.unavailable" />
            <View style={themed($row)}>
              <Button tx="common:close" style={$flex1} onPress={props.onClose} />
              <Button tx="common:retry" style={$flex1} onPress={retry} />
            </View>
          </>
        )}
      >
        <DeckLimitOptions {...props} busy={busy} setBusy={setBusy} onUpgrade={upgrade} />
      </ConvexQueryBoundary>
    </DialogCard>
  )
}

function DeckLimitOptions({
  access,
  onClose,
  onRoomMade,
  busy,
  setBusy,
  onUpgrade,
}: DeckLimitDialogProps & {
  busy: boolean
  setBusy: (busy: boolean) => void
  onUpgrade: () => void
}) {
  const { themed } = useAppTheme()
  const billing = useRevenueCat()
  const { keepOnDevice: moveToDevice } = useLocalDeckSync(access?.ownerId)
  const [step, setStep] = useState<Step>({ kind: "options" })
  const [error, setError] = useState<string>()
  const skip = access && !access.ready
  const capacity = useQuery(api.decks.capacity, skip ? "skip" : {})
  async function confirmMove(deckId: Id<"decks">) {
    if (skip) return
    setBusy(true)
    setError(undefined)
    try {
      await moveToDevice(deckId)
      setStep({ kind: "options" })
      onRoomMade?.()
    } catch (cause) {
      setError(convexErrorMessage(cause, translate("decks:deckLimit.moveFailed")))
    } finally {
      setBusy(false)
    }
  }

  const premium = capacity?.premium ?? false
  const limit = capacity?.limit ?? (premium ? MAX_PREMIUM_DECKS : FREE_DECK_LIMIT)
  return (
    <>
      {step.kind === "options" ? (
        <>
          <View style={themed($copy)}>
            <Text preset="subheading" accessibilityLiveRegion="polite" tx="decks:deckLimit.title" />
            <Text
              size="sm"
              style={themed($dim)}
              tx={premium ? "decks:deckLimit.proBody" : "decks:deckLimit.freeBody"}
              txOptions={{ limit, premiumLimit: MAX_PREMIUM_DECKS }}
            />
          </View>
          <View style={themed($stack)}>
            {premium ? null : (
              <Button
                testID="deck-limit-upgrade"
                tx="decks:deckLimit.upgrade"
                preset="primary"
                disabled={!billing.configured || billing.isLoading}
                onPress={onUpgrade}
              />
            )}
            <Button
              testID="deck-limit-move"
              tx="decks:deckLimit.moveADeck"
              disabled={!capacity}
              onPress={() => setStep({ kind: "choose" })}
            />
            <Button testID="deck-limit-close" tx="decks:deckLimit.notNow" onPress={onClose} />
          </View>
          {!premium && !billing.configured ? (
            <Text
              size="xs"
              style={themed($dim)}
              text={billing.configurationMessage || translate("decks:deckLimit.proUnavailable")}
            />
          ) : null}
        </>
      ) : null}
      {step.kind === "choose" ? (
        <>
          <Text preset="subheading" tx="decks:deckLimit.moveADeck" />
          <ConvexQueryBoundary
            fallback={({ retry }) => (
              <View style={themed($stack)}>
                <Text size="sm" tx="decks:deckLimit.decksFailed" />
                <Button tx="common:retry" onPress={retry} />
              </View>
            )}
          >
            <DeckChoices
              access={access}
              onChoose={(id, name) => setStep({ kind: "confirm", id, name })}
            />
          </ConvexQueryBoundary>
          <Button tx="common:back" onPress={() => setStep({ kind: "options" })} />
        </>
      ) : null}
      {step.kind === "confirm" ? (
        <>
          <View style={themed($copy)}>
            <Text
              preset="subheading"
              tx="decks:deckLimit.confirmTitle"
              txOptions={{ name: step.name }}
            />
            <Text size="sm" style={themed($dim)} tx="decks:deckLimit.moveBody" />
          </View>
          <View style={themed($row)}>
            <Button
              testID="deck-limit-cancel-move"
              tx="common:back"
              style={$flex1}
              disabled={busy}
              onPress={() => setStep({ kind: "choose" })}
            />
            <Button
              testID="deck-limit-confirm-move"
              tx={busy ? "decks:deckLimit.moving" : "decks:deckLimit.move"}
              preset="primary"
              style={$flex1}
              disabled={busy}
              onPress={() => void confirmMove(step.id)}
            />
          </View>
        </>
      ) : null}
      {error || billing.error ? (
        <Text accessibilityRole="alert" size="sm" text={error ?? billing.error ?? ""} />
      ) : null}
    </>
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
  const queuedEdits = useDecksWithQueuedEdits(access?.ownerId, access?.ready ?? false)
  if (!mine) return <Text size="sm" style={themed($dim)} tx="decks:deckLimit.loading" />
  return (
    <ScrollView style={$choices} testID="deck-limit-choices">
      {mine.decks
        .filter((deck) => !queuedEdits.has(deck._id))
        .map((deck) => (
          <TouchableOpacity
            key={deck._id}
            accessibilityRole="button"
            accessibilityLabel={translate("decks:deckLimit.moveNamed", { name: deck.name })}
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
