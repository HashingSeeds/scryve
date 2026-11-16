import { useState } from "react"
import { Keyboard, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { FilterGroup, FilterPill } from "@/components/FilterPill"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { cardFilterLabel } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"

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
  filter,
  heading,
  color,
  options,
  optionLabel = (option) => option,
  picked,
  onChange,
}: {
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
  const label = cardFilterLabel(filter)
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
          onPress={() => onChange(toggleOption(picked, option))}
        />
      ))}
    </FilterGroup>
  )
}

const $rangeRow: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 8 }
const $rangeLabel: TextStyle = { flex: 1 }
const $rangeField: ViewStyle = { width: 72 }
