import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
import { $dialogActions, $dialogButton, DialogCard } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import {
  draftOf,
  swapCount,
  swapsOf,
  type MatchSwaps,
  type SwapDraft,
  type SwapLine,
  type SwapPool,
} from "./matchSideboard"

export function SideboardSwapSheet({
  pool,
  swaps,
  onApply,
  onClose,
}: {
  pool: SwapPool
  swaps: MatchSwaps
  onApply: (swaps: MatchSwaps) => void
  onClose: () => void
}) {
  const { themed } = useAppTheme()
  const [draft, setDraft] = useState(() => draftOf(swaps))
  const next = swapsOf(draft, pool)
  const inCount = swapCount(next.in)
  const outCount = swapCount(next.out)
  const built = swapCount(pool.main)
  const main = built - outCount + inCount
  const short = main < built
  const step = (bag: keyof SwapDraft, line: SwapLine, delta: number) =>
    setDraft((current) => {
      const quantity = Math.min(line.quantity, Math.max(0, (current[bag][line.key] ?? 0) + delta))
      return { ...current, [bag]: { ...current[bag], [line.key]: quantity } }
    })
  const rowsFor = (bag: keyof SwapDraft, lines: readonly SwapLine[]) =>
    lines.map((line) => {
      const moved = Math.min(draft[bag][line.key] ?? 0, line.quantity)
      return (
        <SwapRow
          key={line.key}
          line={line}
          moved={moved}
          sign={bag === "in" ? "+" : "−"}
          detail={translate(
            bag === "in" ? "decks:sideboard.leftInSide" : "decks:sideboard.leftInMain",
            { left: line.quantity - moved, total: line.quantity },
          )}
          onStep={(delta) => step(bag, line, delta)}
        />
      )
    })

  const inRows = rowsFor("in", pool.side)
  const outRows = rowsFor("out", pool.main)

  return (
    <DialogCard
      visible
      onClose={onClose}
      backdropTestID="sideboard-backdrop"
      backdropAccessibilityLabel={translate("decks:sideboard.close")}
      dialogTestID="sideboard-sheet"
      accessibilityViewIsModal
      placement="bottom"
      wide
      style={themed($sheet)}
    >
      <View>
        <Text preset="subheading" tx="decks:sideboard.title" />
        <Text
          testID="sideboard-counts"
          size="xs"
          tone="dim"
          style={$tabular}
          text={translate("decks:sideboard.counts", { in: inCount, out: outCount, main })}
        />
      </View>
      <ScrollView style={$flexShrink}>
        <Section tx="decks:sideboard.inFromSide" />
        {inRows}
        <Section tx="decks:sideboard.outOfMain" />
        {outRows}
      </ScrollView>
      {short ? (
        <Text
          testID="sideboard-short"
          size="xs"
          style={themed($short)}
          text={translate("decks:sideboard.short", { count: main })}
        />
      ) : null}
      <View style={themed($dialogActions)}>
        <Button tx="common:cancel" style={themed($dialogButton)} onPress={onClose} />
        <Button
          testID="sideboard-apply"
          tx="decks:sideboard.apply"
          preset="primary"
          disabled={short}
          style={themed($dialogButton)}
          onPress={() => onApply(next)}
        />
      </View>
    </DialogCard>
  )
}

function Section({ tx }: { tx: "decks:sideboard.inFromSide" | "decks:sideboard.outOfMain" }) {
  const { themed } = useAppTheme()
  return <Text size="xxs" weight="semiBold" tone="dim" tx={tx} style={themed($section)} />
}

function SwapRow({
  line,
  moved,
  sign,
  detail,
  onStep,
}: {
  line: SwapLine
  moved: number
  sign: "+" | "−"
  detail: string
  onStep: (delta: number) => void
}) {
  const { themed } = useAppTheme()
  return (
    <View testID={`sideboard-row-${line.key}`} style={themed($row)}>
      <View style={$flex}>
        <Text size="sm" text={line.name} numberOfLines={1} />
        <Text size="xs" tone="dim" text={detail} />
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={translate("decks:sideboard.fewer", { card: line.name })}
        disabled={moved === 0}
        style={[themed($stepButton), moved === 0 && $disabled]}
        onPress={() => onStep(-1)}
      >
        <Text text="−" />
      </TouchableOpacity>
      <Text
        size="sm"
        weight="medium"
        style={[$quantity, moved ? themed($moved) : undefined]}
        text={moved ? `${sign}${moved}` : "0"}
      />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={translate("decks:sideboard.more", { card: line.name })}
        disabled={moved >= line.quantity}
        style={[themed($stepButton), moved >= line.quantity && $disabled]}
        onPress={() => onStep(1)}
      >
        <Text text="+" />
      </TouchableOpacity>
    </View>
  )
}

const $flex: ViewStyle = { flex: 1, minWidth: 0 }
const $flexShrink: ViewStyle = { flexShrink: 1 }
const $tabular: TextStyle = { fontVariant: ["tabular-nums"] }
const $disabled: ViewStyle = { opacity: 0.35 }
const $quantity: TextStyle = { minWidth: 28, textAlign: "center", fontVariant: ["tabular-nums"] }
const $sheet: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm, maxHeight: "90%" })
const $section: ThemedStyle<TextStyle> = ({ spacing }) => ({
  textTransform: "uppercase",
  letterSpacing: 0.8,
  paddingTop: spacing.sm,
  paddingBottom: spacing.xxs,
})
const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
  minHeight: 48,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $stepButton: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 36,
  height: 36,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: colors.border,
  alignItems: "center",
  justifyContent: "center",
})
const $moved: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $short: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
