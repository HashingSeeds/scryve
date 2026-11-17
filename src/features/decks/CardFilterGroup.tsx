import { useState } from "react"
import { Keyboard, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { CardSymbolText } from "@/components/CardSymbolText"
import { FilterGroup, FilterPill } from "@/components/FilterPill"
import { PressableIcon } from "@/components/Icon"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { cardFilterLabel } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { rangeBound, toggleOption, withRangeBound, type RangeBound } from "./cardFilters"
import type { CardFilterDefinition } from "../../../convex/lib/systems"

const TOP_OPTIONS = 12
const MATCHES_SHOWN = 40
const RANGE_BOUNDS = [
  { bound: ">=", placeholder: "decks:cardSearch.min", label: "decks:cardSearch.minimum" },
  { bound: "<=", placeholder: "decks:cardSearch.max", label: "decks:cardSearch.maximum" },
] as const satisfies readonly { bound: RangeBound; placeholder: string; label: string }[]

/** why: `heading` is left out for a filter that shows on its own line under the filter before it. */
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
  const { themed, theme } = useAppTheme()
  const label = cardFilterLabel(filter)
  if (filter.match === "count")
    return (
      <FilterGroup heading={heading} headingColor={color}>
        {filter.options.map((option) => {
          const count = picked.filter((value) => value === option).length
          const symbol = `{${option}}`
          const add = () => onChange([...picked, option])
          const remove = () => {
            const at = picked.lastIndexOf(option)
            if (at >= 0) onChange(picked.filter((_, index) => index !== at))
          }
          return (
            <View
              key={option}
              testID={`card-filter-${filter.id}-${option}`}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={optionLabel(option)}
              accessibilityValue={{ now: count, min: 0 }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={({ nativeEvent }) =>
                nativeEvent.actionName === "increment" ? add() : remove()
              }
              style={[
                themed($countCell),
                count > 0 && {
                  backgroundColor: theme.colors.searchSectionFill,
                  borderColor: color ?? theme.colors.tint,
                },
              ]}
            >
              <PressableIcon
                testID={`card-filter-${filter.id}-${option}-remove`}
                icon="minus"
                size={16}
                color={count ? (color ?? theme.colors.text) : theme.colors.textDim}
                disabled={!count}
                hitSlop={8}
                onPress={remove}
              />
              <CardSymbolText game={game} size="sm" text={symbol} />
              <Text
                size="sm"
                weight="medium"
                style={{ color: count ? (color ?? theme.colors.text) : theme.colors.textDim }}
                text={count}
              />
              <PressableIcon
                testID={`card-filter-${filter.id}-${option}-add`}
                icon="plus"
                size={16}
                color={color ?? theme.colors.text}
                hitSlop={8}
                onPress={add}
              />
            </View>
          )
        })}
      </FilterGroup>
    )
  if (filter.options === "range")
    return (
      <View style={$rangeRow}>
        <Text preset="sectionLabel" style={[$rangeLabel, color && { color }]} text={label} />
        {RANGE_BOUNDS.map(({ bound, placeholder, label: boundLabel }) => (
          <TextField
            key={bound}
            testID={`card-filter-${filter.id}-${bound === ">=" ? "min" : "max"}`}
            accessibilityLabel={translate(boundLabel, { filter: label.toLocaleLowerCase() })}
            placeholder={translate(placeholder)}
            value={rangeBound(picked, bound) ?? ""}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, "")
              onChange(withRangeBound(picked, bound, digits ? Number(digits) : undefined))
            }}
            keyboardType="number-pad"
            maxLength={2}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            containerStyle={$rangeField}
          />
        ))}
      </View>
    )
  const searchable = filter.options === "cards"
  if (!options.length && !picked.length) return null
  const needle = search.trim().toLocaleLowerCase()
  const shown = !searchable
    ? options
    : needle
      ? options
          .filter((option) => option.toLocaleLowerCase().includes(needle))
          .slice(0, MATCHES_SHOWN)
      : [
          ...picked.filter((option) => !options.slice(0, TOP_OPTIONS).includes(option)),
          ...options.slice(0, TOP_OPTIONS),
        ]
  return (
    <FilterGroup
      heading={heading}
      headingColor={color}
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
      {shown.map((option) => (
        <FilterPill
          key={option}
          testID={`card-filter-${filter.id}-${option}`}
          label={optionLabel(option)}
          selected={picked.includes(option)}
          color={picked.includes(option) ? color : undefined}
          onPress={() => onChange(toggleOption(picked, option))}
        />
      ))}
    </FilterGroup>
  )
}

const $rangeRow: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 8 }
const $rangeLabel: TextStyle = { flex: 1 }
const $rangeField: ViewStyle = { width: 72 }
const $countCell: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
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
