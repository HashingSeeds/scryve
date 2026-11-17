import { useState, type ReactNode } from "react"
import { Keyboard, ScrollView, View } from "react-native"
import type { StyleProp, ViewStyle } from "react-native"

import { CardSymbolText } from "@/components/CardSymbolText"
import { FilterGroup, FilterPill } from "@/components/FilterPill"
import { PressableIcon } from "@/components/Icon"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { cardFilterLabel } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { rangeOptions, rangeValue, toggleOption, type RangeMode } from "./cardFilters"
import type { CardFilterDefinition } from "../../../convex/lib/systems"

const TOP_OPTIONS = 12
const MATCHES_SHOWN = 20
const MAX_STAT = 99
const RANGE_MODES = [
  { id: "<=", label: "≤" },
  { id: "=", label: "=" },
  { id: ">=", label: "≥" },
] as const satisfies readonly { id: RangeMode; label: string }[]

/** why: `heading` is left out for a filter that shows as a later row of its group's section. */
export function CardFilterGroup({
  game,
  filter,
  heading,
  color,
  options,
  optionLabel = (option) => option,
  picked,
  onChange,
}: {
  /** why: a count filter's options are card symbols, drawn the way the game prints them. */
  game: string
  filter: CardFilterDefinition
  heading?: string
  /** why: the section's color, which its terms also wear in the search bar. */
  color?: string
  options: readonly string[]
  optionLabel?: (option: string) => string
  picked: readonly string[]
  onChange: (picked: readonly string[]) => void
}) {
  const [search, setSearch] = useState("")
  // why: the comparison a range takes once a number is picked; the picked bounds win after that.
  const [mode, setMode] = useState<RangeMode>("=")
  const { themed } = useAppTheme()
  const label = cardFilterLabel(filter)
  const rowLabel = filter.group ? label : undefined
  if (filter.match === "count")
    return (
      <FilterGroup heading={heading} headingColor={color} label={rowLabel}>
        {filter.options.map((option) => {
          const count = picked.filter((value) => value === option).length
          const symbol = `{${option}}`
          return (
            <Stepper
              key={option}
              testID={`card-filter-${filter.id}-${option}`}
              label={optionLabel(option)}
              value={count}
              active={count > 0}
              color={color}
              style={$countCell}
              onAdd={() => onChange([...picked, option])}
              onRemove={() => {
                const at = picked.lastIndexOf(option)
                if (at >= 0) onChange(picked.filter((_, index) => index !== at))
              }}
            >
              <CardSymbolText game={game} size="sm" text={symbol} />
            </Stepper>
          )
        })}
      </FilterGroup>
    )
  if (filter.options === "range") {
    const current = rangeValue(picked)
    const shown = current?.mode ?? mode
    const pick = (next: RangeMode, value: number | undefined) => {
      setMode(next)
      onChange(rangeOptions(next, value))
    }
    return (
      <FilterGroup heading={heading} headingColor={color} label={rowLabel}>
        <View style={$rangeRow}>
          <View style={$rangeModes}>
            <SegmentedControl
              testID={`card-filter-${filter.id}-mode`}
              accessibilityLabel={label}
              segments={RANGE_MODES}
              selectedId={shown}
              onSelect={(id) => {
                const next = RANGE_MODES.find((option) => option.id === id)
                if (next) pick(next.id, current?.value)
              }}
            />
          </View>
          <Stepper
            testID={`card-filter-${filter.id}`}
            label={label}
            value={current?.value}
            active={current !== undefined}
            color={color}
            style={$rangeStepper}
            onAdd={() => pick(shown, current ? Math.min(MAX_STAT, current.value + 1) : 1)}
            onRemove={() => {
              if (current) pick(shown, current.value > 0 ? current.value - 1 : undefined)
            }}
          />
        </View>
      </FilterGroup>
    )
  }
  const searchable = filter.options === "cards"
  if (!options.length && !picked.length) return null
  const needle = search.trim().toLocaleLowerCase()
  const open = options.filter((option) => !picked.includes(option))
  const suggested = needle
    ? [
        ...open.filter((option) => option.toLocaleLowerCase().startsWith(needle)),
        ...open.filter((option) => option.toLocaleLowerCase().indexOf(needle) > 0),
      ].slice(0, MATCHES_SHOWN)
    : open.slice(0, TOP_OPTIONS)
  const pill = (option: string) => (
    <FilterPill
      key={option}
      testID={`card-filter-${filter.id}-${option}`}
      label={optionLabel(option)}
      selected={picked.includes(option)}
      color={picked.includes(option) ? color : undefined}
      onPress={() => {
        setSearch("")
        onChange(toggleOption(picked, option))
      }}
    />
  )
  return (
    <FilterGroup
      heading={heading}
      headingColor={color}
      label={rowLabel}
      search={
        searchable ? (
          <TextField
            testID={`card-filter-search-${filter.id}`}
            accessibilityLabel={translate("decks:cardSearch.searchFilter", {
              filter: label.toLocaleLowerCase(),
            })}
            placeholder={translate("decks:cardSearch.searchFilter", {
              filter: label.toLocaleLowerCase(),
            })}
            value={search}
            onChangeText={setSearch}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            autoCorrect={false}
          />
        ) : null
      }
    >
      {searchable ? (
        <>
          {picked.map(pill)}
          {/* why: one line of likely picks, which follows what is typed, keeps a long list from burying the rest of the sheet. */}
          <ScrollView
            horizontal
            style={$suggestionRow}
            contentContainerStyle={themed($suggestionContent)}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {suggested.map(pill)}
          </ScrollView>
        </>
      ) : (
        options.map(pill)
      )}
    </FilterGroup>
  )
}

/** why: an adjustable minus and plus around a number, so screen readers step it with a swipe. Without a value it reads "Any". */
function Stepper({
  testID,
  label,
  value,
  active,
  color,
  style,
  onAdd,
  onRemove,
  children,
}: {
  testID: string
  label: string
  value: number | undefined
  active: boolean
  color?: string
  style?: ThemedStyle<ViewStyle>
  onAdd: () => void
  onRemove: () => void
  children?: ReactNode
}) {
  const { themed, theme } = useAppTheme()
  const tint = color ?? theme.colors.text
  const cell: StyleProp<ViewStyle> = [
    themed($stepper),
    style && themed(style),
    active && { backgroundColor: theme.colors.searchSectionFill, borderColor: tint },
  ]
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={
        value === undefined ? { text: translate("decks:cardSearch.any") } : { now: value, min: 0 }
      }
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={({ nativeEvent }) =>
        nativeEvent.actionName === "increment" ? onAdd() : onRemove()
      }
      style={cell}
    >
      <PressableIcon
        testID={`${testID}-remove`}
        icon="minus"
        size={16}
        color={active ? tint : theme.colors.textDim}
        disabled={!active}
        hitSlop={8}
        onPress={onRemove}
      />
      {children}
      <Text
        size="sm"
        weight="medium"
        style={{ color: active ? tint : theme.colors.textDim }}
        text={value === undefined ? translate("decks:cardSearch.any") : value}
      />
      <PressableIcon
        testID={`${testID}-add`}
        icon="plus"
        size={16}
        color={tint}
        hitSlop={8}
        onPress={onAdd}
      />
    </View>
  )
}

const $rangeRow: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 8, width: "100%" }
const $rangeModes: ViewStyle = { flex: 1 }
const $suggestionRow: ViewStyle = { width: "100%", flexGrow: 0 }
const $suggestionContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $stepper: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.sm,
  borderRadius: radius.xxxl,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $countCell: ThemedStyle<ViewStyle> = () => ({ flexBasis: "48%", flexGrow: 1 })
const $rangeStepper: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 112,
  alignSelf: "stretch",
  gap: spacing.xs,
})
