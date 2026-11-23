import { useState } from "react"
import { Pressable, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { Icon, PressableIcon } from "@/components/Icon"
import { Text } from "@/components/Text"
import type { KeywordRule } from "@/features/rules/magicKeywords"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { startFromLeft, towardEnd } from "@/theme/direction"
import type { ThemedStyle } from "@/theme/types"

export type KeywordAnchor = { top: number; left: number }

const ARROW = 12
export const KEYWORD_GAP = 16

export function popoverScroll({
  top,
  height,
  scrolled,
  visible,
}: {
  top: number
  height: number
  scrolled: number
  visible: number
}) {
  const wordTop = top - KEYWORD_GAP * 2
  if (wordTop < scrolled) return Math.max(0, wordTop)
  const bottom = top + height + KEYWORD_GAP
  if (bottom > scrolled + visible) return Math.min(bottom - visible, wordTop)
  return undefined
}

export function KeywordPopover({
  name,
  rule,
  anchor,
  onClose,
  onOpenRule,
  onHeight,
}: {
  name: string
  rule: KeywordRule
  anchor?: KeywordAnchor
  onClose: () => void
  onOpenRule?: (id: string) => void
  onHeight?: (height: number) => void
}) {
  const { theme, themed } = useAppTheme()
  const [expanded, setExpanded] = useState(false)
  const [width, setWidth] = useState(0)
  const [lead, ...rest] = rule.rules
  const definition = rule.definition ?? lead?.text
  const rules = rule.definition ? rule.rules : rest
  const inset = theme.spacing.sm
  const arrowLeft = anchor
    ? Math.min(Math.max(anchor.left - inset - ARROW / 2, ARROW), Math.max(ARROW, width - ARROW * 2))
    : undefined
  return (
    <View
      style={[
        themed($popover),
        anchor && [$anchored, { top: anchor.top, start: inset, end: inset }],
      ]}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width)
        onHeight?.(event.nativeEvent.layout.height)
      }}
      testID="card-focus-keyword"
    >
      {arrowLeft !== undefined && width > 0 ? (
        <View style={[themed($arrow), { start: startFromLeft(arrowLeft, ARROW, width) }]} />
      ) : null}
      <View style={themed($header)}>
        <Text size="sm" weight="medium" style={$shrink} text={name} />
        <Text size="xs" tone="dim" style={$flex} text={rule.id} />
        <PressableIcon
          icon="x"
          size={18}
          color={theme.colors.textDim}
          accessibilityRole="button"
          accessibilityLabel={translate("decks:cardFocus.closeKeyword")}
          containerStyle={$close}
          onPress={onClose}
        />
      </View>
      {definition ? <Text size="xs" text={definition} /> : null}
      {expanded
        ? rules.map((sub) => (
            <View key={sub.id} style={$rule}>
              <Text size="xs" style={$ruleId} text={sub.id} />
              <Text size="xs" tone="dim" style={$flex} text={sub.text} />
            </View>
          ))
        : null}
      {rules.length > 0 || onOpenRule ? (
        <View style={themed($actions)}>
          {rules.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((current) => !current)}
              style={$toggle}
            >
              <Text
                size="xs"
                style={themed($link)}
                tx={expanded ? "decks:cardFocus.hideRules" : "decks:cardFocus.showRules"}
              />
            </Pressable>
          ) : null}
          {onOpenRule ? (
            <Pressable
              testID="card-focus-keyword-open-rules"
              accessibilityRole="link"
              onPress={() => onOpenRule(rule.id)}
              style={$openLink}
            >
              <Text size="xs" style={themed($link)} tx="play:rules.title" />
              <Icon icon="caretRight" size={14} color={theme.colors.tint} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const $flex: TextStyle = { flex: 1 }
const $anchored: ViewStyle = { position: "absolute" }
const $shrink: TextStyle = { flexShrink: 1 }
const $rule: ViewStyle = { flexDirection: "row" }
const $ruleId: TextStyle = { width: 80, fontVariant: ["tabular-nums"] }
const $toggle: ViewStyle = { alignSelf: "flex-start", minHeight: 36, justifyContent: "center" }
const $openLink: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  minHeight: 36,
  gap: 2,
}
const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: spacing.md,
})
const $close: ViewStyle = {
  minWidth: 36,
  minHeight: 36,
  alignItems: "flex-end",
  justifyContent: "center",
}
const $popover: ThemedStyle<ViewStyle> = ({ colors, radius, spacing }) => ({
  zIndex: 10,
  elevation: 8,
  gap: spacing.xxs,
  paddingTop: spacing.xxs,
  paddingBottom: spacing.xs,
  paddingHorizontal: spacing.md,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.field,
  shadowColor: colors.shadow,
  shadowOpacity: 0.5,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
})
const $arrow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: -ARROW / 2 - 1,
  width: ARROW,
  height: ARROW,
  backgroundColor: colors.field,
  borderStartWidth: 1,
  borderTopWidth: 1,
  borderColor: colors.border,
  // why: the start and top borders meet at the tip only when it turns toward the start edge.
  transform: [{ rotate: `${towardEnd * 45}deg` }],
})
const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
