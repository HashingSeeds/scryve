import { useState } from "react"
import { Platform, TouchableOpacity, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { DialogCard } from "@/components/DialogCard"
import { Icon } from "@/components/Icon"
import { TrailingNumber } from "@/components/NumberLane"
import { Text } from "@/components/Text"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { i18n } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { formatCardChange } from "./cardChanges"
import { honestRate, recordText, type listStats, type RecordCounts } from "./deckStatsMath"
import type { LabeledList } from "./listLabels"

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

export function listLabel(row: LabeledList) {
  if (row.kind === "dated") return listDateSpan(row)
  return translate(row.kind === "current" ? "decks:stats.current" : "decks:stats.notTracked")
}

const SHOWN_CHANGES = 3

export function listDetail(row: LabeledList) {
  const shown = row.changes.slice(0, SHOWN_CHANGES).map(formatCardChange)
  const more = row.changes.length - shown.length
  const changes = [...shown, more > 0 ? translate("decks:stats.moreChanges", { count: more }) : ""]
    .filter(Boolean)
    .join(", ")
  return [row.kind === "dated" ? "" : listDateSpan(row), changes].filter(Boolean).join(" · ")
}

function PreviewRow({ label, values }: { label: string; values: string[] }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($previewRow)}>
      <Text size="xs" text={label} tone="dim" style={$flex} />
      {values.map((value, index) => (
        <Text key={index} size="sm" text={value} style={[$previewValue, $numbers]} />
      ))}
    </View>
  )
}

function ComparePreview({ lists }: { lists: ComparePreviewLists }) {
  const { themed } = useAppTheme()
  return (
    <View testID="compare-preview" style={themed($preview)}>
      <View style={themed($previewRow)}>
        <View style={$flex} />
        {lists.map((list) => (
          <Text key={list.fingerprint} size="xs" style={$previewValue} text={listLabel(list)} />
        ))}
      </View>
      <PreviewRow
        label={translate("decks:stats.games")}
        values={lists.map((list) => String(list.record.games))}
      />
      <PreviewRow
        label={translate("decks:stats.record")}
        values={lists.map((list) => recordText(list.record))}
      />
      <Text size="xs" tx="decks:stats.cardChanges" tone="dim" />
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {PREVIEW_CHANGE_WIDTHS.map((width) => (
          <View key={width} style={themed($previewChange)}>
            <View style={[themed($previewBar), { width: `${width}%` }]} />
          </View>
        ))}
      </View>
    </View>
  )
}

function HonestRate({ record }: { record: RecordCounts }) {
  const rate = honestRate(record)
  return (
    <View style={rate.tooFew && $fewRate}>
      <TrailingNumber weight="medium" value={rate.text} />
      {rate.tooFew ? null : (
        <TrailingNumber
          size="xxs"
          tone="dim"
          value={translate("decks:stats.ofGames", { count: rate.games })}
        />
      )}
    </View>
  )
}

/** why: rows with and without a chevron keep their numbers in the same lane. */
export function ChevronSlot({ shown }: { shown: boolean }) {
  const { theme } = useAppTheme()
  return (
    <View style={$chevron}>
      {shown ? <Icon icon="caretRight" size={16} color={theme.colors.textDim} /> : null}
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
        <Text text={label} size="sm" weight="medium" />
        {detail ? <Text text={detail} size="meta" tone="dim" /> : null}
      </View>
      <HonestRate record={record} />
      <ChevronSlot shown={Boolean(onPress)} />
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

export type ComparePreviewLists = readonly [LabeledList, LabeledList]

export function DeckComparePrompt({
  onClose,
  preview,
}: {
  onClose: () => void
  preview?: ComparePreviewLists
}) {
  const billing = useRevenueCat()
  const [state, setState] = useState<"prompt" | "dismiss" | "paywall">("prompt")
  async function paywall() {
    setState("paywall")
    if ((await billing.presentPaywall({ showsErrorInline: true })) === "error") setState("prompt")
    else onClose()
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
      {preview ? <ComparePreview lists={preview} /> : null}
      {billing.error ? <AlertNote text={billing.error} /> : null}
      <Button
        tx="decks:localSync.seePro"
        preset="primary"
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
export const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ marginTop: spacing.lg })
const $fewRate: ViewStyle = { opacity: 0.55 }
const $chevron: ViewStyle = { width: 16, alignItems: "center" }
const PREVIEW_CHANGE_WIDTHS = [70, 45, 60]
const $preview: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs, width: "100%" })
const $previewRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $previewValue: TextStyle = { flex: 1, textAlign: "right" }
const $previewChange: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  height: spacing.lg,
  justifyContent: "center",
})
const $previewBar: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  height: 10,
  borderRadius: radius.full,
  backgroundColor: colors.separator,
})
