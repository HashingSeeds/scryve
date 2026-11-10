import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { ChoiceButton } from "./ChoiceButton"
import { Icon } from "./Icon"
import { Text } from "./Text"
import { TextField } from "./TextField"

export interface OptionGridProps {
  label: string
  options: readonly number[]
  value: number
  onSelect: (value: number) => void
  testID: string
  isDisabled?: (option: number) => boolean
  custom?: { min: number; max: number }
  more?: readonly number[]
}

export function OptionGrid({
  label,
  options,
  value,
  onSelect,
  testID,
  isDisabled,
  custom,
  more,
}: OptionGridProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const [draft, setDraft] = useState<string>()
  const [expanded, setExpanded] = useState(false)
  const showMore = more !== undefined && (expanded || more.includes(value))
  const shown = more && showMore ? [...options, ...more] : options
  const customValue = custom && !options.includes(value) ? value : undefined

  function pick(next: number) {
    if (next !== value) onSelect(next)
  }

  // why: Start/Done can sit outside the scroll view, so a tap can land before the field blurs; pick in-range keystrokes at once.
  function type(text: string) {
    if (!custom) return
    const digits = text.replace(/\D/g, "").slice(0, String(custom.max).length)
    setDraft(digits)
    const typed = Number(digits)
    if (digits && typed >= custom.min && typed <= custom.max) pick(typed)
  }

  function finish() {
    if (custom && draft) pick(Math.min(custom.max, Math.max(custom.min, Number(draft))))
    setDraft(undefined)
  }

  return (
    <View style={themed($section)}>
      <Text text={label} preset="subheading" accessibilityRole="header" />
      <View testID={testID} accessibilityLabel={label} style={themed($grid)}>
        {shown.map((option) => (
          <ChoiceButton
            key={option}
            compact
            testID={`${testID}-${option}`}
            text={String(option)}
            selected={draft === undefined && option === value}
            disabled={isDisabled?.(option)}
            style={[
              themed($cell),
              more && !showMore && $moreRowCell,
              isDisabled?.(option) && $disabled,
            ]}
            onPress={() => pick(option)}
          />
        ))}
        {custom && draft !== undefined ? (
          <TextField
            testID={`${testID}-custom-input`}
            accessibilityLabel={label}
            autoFocus
            selectTextOnFocus
            keyboardType="number-pad"
            returnKeyType="done"
            value={draft}
            onChangeText={type}
            onSubmitEditing={finish}
            onBlur={finish}
            containerStyle={themed($cell)}
            inputWrapperStyle={[themed($input), { borderColor: colors.tint }]}
            style={$inputText}
          />
        ) : custom ? (
          <ChoiceButton
            compact
            testID={`${testID}-custom`}
            text={customValue === undefined ? undefined : String(customValue)}
            accessibilityLabel={
              customValue === undefined ? translate("common:optionGrid.other") : undefined
            }
            selected={customValue !== undefined}
            Leading={
              customValue === undefined
                ? ({ color }) => <Icon icon="pencil" size={18} color={color} />
                : undefined
            }
            style={themed($cell)}
            onPress={() => setDraft(customValue === undefined ? "" : String(customValue))}
          />
        ) : null}
        {more?.length && !showMore ? (
          <ChoiceButton
            compact
            testID={`${testID}-more`}
            text={`${more[0]}+`}
            selected={false}
            accessibilityLabel={translate("common:optionGrid.more", { label, from: more[0] })}
            style={[themed($cell), $moreRowCell]}
            onPress={() => setExpanded(true)}
          />
        ) : null}
      </View>
    </View>
  )
}

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $grid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
// why: equal growth from one basis keeps chips in a row the same width and wraps big text instead of clipping.
const $cell: ThemedStyle<ViewStyle> = () => ({ flexGrow: 1, flexBasis: 56 })
// why: six chips must share a phone-width row so "7+" stays beside 2–6 instead of wrapping alone.
const $moreRowCell: ViewStyle = { flexBasis: 44, minWidth: 44 }
const $input: ThemedStyle<ViewStyle> = ({ radius }) => ({
  minHeight: 48,
  borderWidth: 2,
  borderRadius: radius.xl,
})
const $inputText: TextStyle = { textAlign: "center" }
const $disabled: ViewStyle = { opacity: 0.5 }
