import { memo, useState, type ReactNode } from "react"
import { Keyboard, ScrollView, View } from "react-native"
import type { StyleProp, ViewStyle } from "react-native"

import { CardSymbolText } from "@/components/CardSymbolText"
import { FilterGroup, FilterPill } from "@/components/FilterPill"
import { PressableIcon } from "@/components/Icon"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { cardFilterLabel } from "@/features/game/playSystems"
import { formatNumber } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { rangeOptions, rangeValue, toggleOption, type RangeMode } from "./cardFilters"
import type { CardFilterDefinition } from "../../../convex/lib/systems"

const TOP_OPTIONS = 12
const MATCHES_SHOWN = 20
const NUMBERS_SHOWN = 11
const RANGE_MODES = [
  { id: "<=", tx: "decks:cardSearch.orLess" },
  { id: "=", tx: "decks:cardSearch.exactly" },
  { id: ">=", tx: "decks:cardSearch.orMore" },
] as const satisfies readonly { id: RangeMode; tx: string }[]

type CardFilterGroupProps = Parameters<typeof FilterGroupView>[0]

/** why: a pick changes one group, so the others skip the render; picks parse into new lists, so they compare by contents. */
export const CardFilterGroup = memo(FilterGroupView, (before, after) =>
  (Object.keys(after) as (keyof CardFilterGroupProps)[]).every((key) =>
    key === "picked" ? sameList(before.picked, after.picked) : before[key] === after[key],
  ),
)

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index])

/** why: `heading` is left out for a filter that shows as a later row of its group's section. */
function FilterGroupView({
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
              color={color}
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
    const numbers = [...Array(NUMBERS_SHOWN).keys()]
    if (current && !numbers.includes(current.value)) numbers.push(current.value)
    return (
      <FilterGroup heading={heading} headingColor={color} label={rowLabel}>
        <ScrollView
          horizontal
          style={$suggestionRow}
          contentContainerStyle={themed($suggestionContent)}
          showsHorizontalScrollIndicator={false}
        >
          {numbers.map((value) => (
            <FilterPill
              key={value}
              testID={`card-filter-${filter.id}-${value}`}
              label={formatNumber(value)}
              selected={current?.value === value}
              color={current?.value === value ? color : undefined}
              onPress={() =>
                onChange(current?.value === value ? [] : rangeOptions(current?.mode ?? "=", value))
              }
            />
          ))}
        </ScrollView>
        {/* why: the comparison only means something once a number is picked. */}
        {current
          ? RANGE_MODES.map(({ id, tx }) => (
              <FilterPill
                key={id}
                testID={`card-filter-${filter.id}-${id}`}
                label={translate(tx)}
                selected={current.mode === id}
                color={current.mode === id ? color : undefined}
                onPress={() => onChange(rangeOptions(id, current.value))}
              />
            ))
          : null}
      </FilterGroup>
    )
  }
  const searchable = filter.options === "cards"
  if (!options.length && !picked.length) return null
  const needle = search.trim().toLocaleLowerCase()
  const top = options.slice(0, TOP_OPTIONS)
  // why: a pick stays where it was tapped, so the pills around it don't move under the next tap; a pick found by searching leads the row, or it would leave the sheet once the search clears.
  const suggested = needle
    ? [
        ...options.filter((option) => option.toLocaleLowerCase().startsWith(needle)),
        ...options.filter((option) => option.toLocaleLowerCase().indexOf(needle) > 0),
      ].slice(0, MATCHES_SHOWN)
    : [...picked.filter((option) => !top.includes(option)), ...top]
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
        // why: one line of likely picks, which follows what is typed, keeps a long list from burying the rest of the sheet.
        <ScrollView
          horizontal
          style={$suggestionRow}
          contentContainerStyle={themed($suggestionContent)}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {suggested.map(pill)}
        </ScrollView>
      ) : (
        options.map(pill)
      )}
    </FilterGroup>
  )
}

/** why: an adjustable minus and plus around a count, so screen readers step it with a swipe. */
function Stepper({
  testID,
  label,
  value,
  color,
  onAdd,
  onRemove,
  children,
}: {
  testID: string
  label: string
  value: number
  color?: string
  onAdd: () => void
  onRemove: () => void
  children?: ReactNode
}) {
  const { themed, theme } = useAppTheme()
  const tint = color ?? theme.colors.text
  const active = value > 0
  const cell: StyleProp<ViewStyle> = [
    themed($stepper),
    active && { backgroundColor: theme.colors.searchSectionFill, borderColor: tint },
  ]
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ now: value, min: 0 }}
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
        text={value}
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

const $suggestionRow: ViewStyle = { width: "100%", flexGrow: 0 }
const $suggestionContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $stepper: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  flexBasis: "48%",
  flexGrow: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.sm,
  borderRadius: radius.xxxl,
  borderWidth: 1,
  borderColor: colors.separator,
})
