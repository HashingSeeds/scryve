import { useState, type ReactNode } from "react"
import { Platform, TouchableOpacity, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { DialogCard } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { i18n } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { honestRate, type listStats, type RecordCounts } from "./deckStatsMath"

export type DeckStatsParams = { deckKey: string; deckName: string; game: string; format: string }

export function statsDate(time: number) {
  return new Date(time).toLocaleDateString(i18n.language, { month: "short", day: "numeric" })
}

export function listDateSpan(row: ReturnType<typeof listStats>[number]) {
  if (row.firstAt === undefined || row.lastAt === undefined)
    return translate("decks:stats.datesMissing")
  const first = statsDate(row.firstAt)
  const last = statsDate(row.lastAt)
  return first === last ? first : translate("decks:stats.dateSpan", { first, last })
}

export function listLabel(row: ReturnType<typeof listStats>[number]) {
  return row.label === "dated"
    ? listDateSpan(row)
    : translate(`decks:stats.${row.label === "untracked" ? "notTracked" : row.label}`)
}

export function HonestRate({ record }: { record: RecordCounts }) {
  const { themed } = useAppTheme()
  const rate = honestRate(record)
  return (
    <View style={$rate}>
      <Text weight="medium" text={rate.text} style={$numbers} />
      <Text
        size="xxs"
        style={themed($dim)}
        text={
          rate.tooFew
            ? translate("decks:stats.tooFew")
            : translate("decks:stats.ofGames", { count: rate.games })
        }
      />
    </View>
  )
}

export function StatsRow({
  label,
  detail,
  record,
  onPress,
  testID,
}: {
  label: string
  detail?: string
  record: RecordCounts
  onPress?: () => void
  testID?: string
}) {
  const { themed } = useAppTheme()
  const contents = (
    <>
      <View style={$flex}>
        <Text text={label} size="sm" />
        {detail ? <Text text={detail} size="xs" style={themed($dim)} /> : null}
      </View>
      <HonestRate record={record} />
      {onPress ? <Text text="›" style={themed($dim)} /> : null}
    </>
  )
  return onPress ? (
    <TouchableOpacity
      accessibilityRole="button"
      testID={testID}
      style={themed($statsRow)}
      onPress={onPress}
    >
      {contents}
    </TouchableOpacity>
  ) : (
    <View style={themed($statsRow)}>{contents}</View>
  )
}

export function StatsSection({ title, action }: { title: string; action?: ReactNode }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($section)}>
      <Text text={title} weight="medium" size="sm" />
      {action}
    </View>
  )
}

export function DeckComparePrompt({ onClose }: { onClose: () => void }) {
  const billing = useRevenueCat()
  const [state, setState] = useState<"prompt" | "dismiss" | "paywall">("prompt")
  const [error, setError] = useState<string>()
  async function paywall() {
    setState("paywall")
    try {
      await billing.presentPaywall()
      onClose()
    } catch {
      setError(translate("decks:deckLimit.proUnavailable"))
      setState("prompt")
    }
  }
  return (
    <DialogCard
      visible={state === "prompt"}
      onClose={onClose}
      onDismissed={state === "dismiss" ? () => void paywall() : undefined}
      backdropAccessibilityLabel={translate("common:close")}
      dialogTestID="compare-pro-prompt"
      accessibilityViewIsModal
    >
      <Text tx="decks:stats.comparePro" />
      {error ? <AlertNote text={error} /> : null}
      <Button
        tx="decks:localSync.seePro"
        disabled={!billing.configured || billing.isLoading}
        onPress={() => (Platform.OS === "ios" ? setState("dismiss") : void paywall())}
      />
      {!billing.configured ? <Text size="xs" tx="decks:deckLimit.proUnavailable" /> : null}
      <Button tx="common:close" onPress={onClose} />
    </DialogCard>
  )
}

export const $flex: ViewStyle = { flex: 1 }
export const $numbers: TextStyle = { fontVariant: ["tabular-nums"] }
export const $dim: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
export const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.xl,
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
})
export const $statsRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 64,
  paddingVertical: spacing.sm,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $rate: ViewStyle = { alignItems: "flex-end" }
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  marginTop: spacing.lg,
  minHeight: 44,
})
