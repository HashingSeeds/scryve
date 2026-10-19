import type { ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { ChoiceButton } from "./ChoiceButton"
import { useRevealSelected } from "./useRevealSelected"

export type FilterChip = {
  id: string
  label: string
  detail?: string
  accessibilityLabel?: string
  disabled?: boolean
}

export interface FilterChipsProps {
  chips: readonly FilterChip[]
  selectedId: string
  onSelect: (id: string) => void
  testID?: string
  accessibilityLabel?: string
  edgeInset?: number
}

export function FilterChips({
  chips,
  selectedId,
  onSelect,
  testID,
  accessibilityLabel,
  edgeInset,
}: FilterChipsProps) {
  const { themed } = useAppTheme()
  const { scrollProps, itemLayout } = useRevealSelected(selectedId)
  return (
    <ScrollView
      {...scrollProps}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        themed($row),
        edgeInset === undefined ? undefined : { paddingHorizontal: edgeInset },
      ]}
    >
      {chips.map((chip) => (
        <View key={chip.id} onLayout={itemLayout(chip.id)}>
          <ChoiceButton
            compact
            testID={`${testID ?? "filter"}-${chip.id}`}
            text={chip.label}
            detail={chip.detail}
            accessibilityLabel={chip.accessibilityLabel}
            selected={chip.id === selectedId}
            disabled={chip.disabled}
            style={chip.disabled ? themed($disabled) : undefined}
            onPress={() => onSelect(chip.id)}
          />
        </View>
      ))}
    </ScrollView>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.xxs,
  paddingEnd: spacing.xs,
})
const $disabled: ThemedStyle<ViewStyle> = () => ({ opacity: 0.5 })
