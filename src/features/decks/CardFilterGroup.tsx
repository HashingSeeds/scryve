import { useState } from "react"
import { Keyboard } from "react-native"

import { FilterGroup, FilterPill } from "@/components/FilterPill"
import { TextField } from "@/components/TextField"
import { cardFilterLabel } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"

import type { CardFilterDefinition } from "../../../convex/lib/systems"

const TOP_OPTIONS = 12
const MATCHES_SHOWN = 40

export function CardFilterGroup({
  filter,
  options,
  picked,
  onToggle,
}: {
  filter: CardFilterDefinition
  options: readonly string[]
  picked: readonly string[]
  onToggle: (option: string) => void
}) {
  const [search, setSearch] = useState("")
  const label = cardFilterLabel(filter)
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
    <>
      {searchable ? (
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
      ) : null}
      <FilterGroup heading={label}>
        {shown.map((option) => (
          <FilterPill
            key={option}
            testID={`card-filter-${filter.id}-${option}`}
            label={option}
            selected={picked.includes(option)}
            onPress={() => onToggle(option)}
          />
        ))}
      </FilterGroup>
    </>
  )
}
