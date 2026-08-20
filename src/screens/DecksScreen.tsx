import { useMemo, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { SectionList, TouchableOpacity, View } from "react-native"
import { Image, type ImageStyle } from "expo-image"
import { useQuery } from "convex/react"

import { Button } from "@/components/Button"
import type { FilterChip } from "@/components/FilterChips"
import { FilterChips } from "@/components/FilterChips"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import type { DeckRecord } from "@/features/decks/deckCopy"
import { cardCountLabel, recordSummary } from "@/features/decks/deckCopy"
import { ALL_FORMATS, useDeckFilters } from "@/features/decks/deckFilters"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../convex/_generated/api"
import {
  DECK_GAME_LIST,
  deckFormatLabel,
  deckFormats,
  DEFAULT_DECK_GAME,
} from "../../convex/lib/deckGames"

type ShelfDeck = {
  _id: string
  name: string
  format: string
  game?: string
  coverImageUrl?: string
  versionCount?: number
  cardQuantity?: number
  lastPlayedAt?: number
  record?: DeckRecord
}

export type DeckSelection = {
  deckId: string
  name: string
  game: string
  format: string
  cardQuantity?: number
}

type DeckSection = { title: "Recent" | "All decks"; data: ShelfDeck[] }

function coverInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?"
}

function deckSubtitle(deck: ShelfDeck, game: string) {
  const cards = deck.cardQuantity ? cardCountLabel(deck.cardQuantity) : "Empty list"
  const versions =
    deck.versionCount && deck.versionCount > 1 ? `${deck.versionCount} versions` : null
  const record = recordSummary(deck.record)
  return [deckFormatLabel(game, deck.format), cards, versions, record].filter(Boolean).join(" · ")
}

function matchesSearch(deck: ShelfDeck, game: string, search: string) {
  const term = search.trim().toLocaleLowerCase()
  if (!term) return true
  return [deck.name, deckFormatLabel(game, deck.format)].some((value) =>
    value.toLocaleLowerCase().includes(term),
  )
}

function DeckRow({ deck, game, onPress }: { deck: ShelfDeck; game: string; onPress: () => void }) {
  const { themed } = useAppTheme()
  return (
    <TouchableOpacity
      style={themed($row)}
      accessibilityRole="button"
      accessibilityLabel={deck.name}
      activeOpacity={0.75}
      onPress={onPress}
    >
      {deck.coverImageUrl ? (
        <Image source={deck.coverImageUrl} style={themed($cover)} cachePolicy="memory-disk" />
      ) : (
        <View style={themed($coverPlaceholder)}>
          <Text weight="bold" size="md" text={coverInitial(deck.name)} />
        </View>
      )}
      <View style={themed($rowCopy)}>
        <Text weight="medium" numberOfLines={1} text={deck.name} />
        <Text
          size="xxs"
          numberOfLines={2}
          style={themed($dimmedText)}
          text={deckSubtitle(deck, game)}
        />
      </View>
      <Text size="lg" style={themed($dimmedText)} text="›" />
    </TouchableOpacity>
  )
}

export function DecksScreen({
  onBack,
  onSelect,
  onAddDeck,
}: {
  onBack: () => void
  onSelect: (deck: DeckSelection) => void
  onAddDeck: () => void
}) {
  const { themed } = useAppTheme()
  const mine = useQuery(api.decks.listMine)
  const { game, format, setGame, setFormat } = useDeckFilters()
  const [search, setSearch] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)

  const gameDecks = useMemo(
    () => (mine?.decks ?? []).filter((deck) => (deck.game ?? DEFAULT_DECK_GAME) === game),
    [mine?.decks, game],
  )
  const formatChips = useMemo<FilterChip[]>(() => {
    const owned = new Set(gameDecks.map((deck) => deck.format))
    const known = deckFormats(game)
      .filter((candidate) => owned.has(candidate.id))
      .map((candidate) => ({ id: candidate.id, label: candidate.label }))
    const extra = [...owned]
      .filter((value) => !known.some((candidate) => candidate.id === value))
      .map((value) => ({ id: value, label: deckFormatLabel(game, value) }))
    return [{ id: ALL_FORMATS, label: "All formats" }, ...known, ...extra]
  }, [gameDecks, game])
  const visibleDecks = useMemo(
    () =>
      gameDecks
        .filter((deck) => format === ALL_FORMATS || deck.format === format)
        .filter((deck) => matchesSearch(deck, game, search)),
    [gameDecks, format, game, search],
  )
  const sections = useMemo<DeckSection[]>(() => {
    if (visibleDecks.length === 0) return []
    const recent = visibleDecks
      .filter((deck) => deck.lastPlayedAt !== undefined)
      .sort((left, right) => (right.lastPlayedAt ?? 0) - (left.lastPlayedAt ?? 0))
      .slice(0, 2)
    const recentIds = new Set(recent.map((deck) => deck._id))
    const rest = visibleDecks.filter((deck) => !recentIds.has(deck._id))
    return [
      ...(recent.length ? [{ title: "Recent" as const, data: recent }] : []),
      { title: "All decks", data: rest },
    ]
  }, [visibleDecks])
  const filtered = gameDecks.length > 0 && visibleDecks.length === 0
  const gameLabel = DECK_GAME_LIST.find((candidate) => candidate.id === game)?.shortLabel ?? "deck"
  const filterSummary = `${gameLabel} · ${
    format === ALL_FORMATS ? "All formats" : deckFormatLabel(game, format)
  }`

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header
        title="Decks"
        leftTx="common:back"
        onLeftPress={onBack}
        RightActionComponent={
          <TouchableOpacity
            testID="add-deck-tile"
            accessibilityRole="button"
            accessibilityLabel="Add deck"
            style={themed($headerAction)}
            onPress={onAddDeck}
          >
            <Text size="md" weight="medium" style={themed($link)} text="+ Add" />
          </TouchableOpacity>
        }
      />
      <View style={themed($content)}>
        <View style={themed($searchRow)}>
          <TextField
            testID="deck-search-input"
            containerStyle={themed($searchField)}
            placeholder="Search decks or formats"
            value={search}
            maxLength={80}
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setSearch}
          />
          <Button
            testID="deck-filter-button"
            text="Filters"
            style={themed($filterButton)}
            onPress={() => setFiltersOpen((open) => !open)}
          />
        </View>
        <Text size="xxs" style={themed($dimmedText)} text={filterSummary} />
        {filtersOpen ? (
          <View style={themed($filters)}>
            <FilterChips
              testID="game-filter"
              accessibilityLabel="Game"
              chips={DECK_GAME_LIST.map((candidate) => ({
                id: candidate.id,
                label: candidate.available
                  ? candidate.shortLabel
                  : `${candidate.shortLabel} · soon`,
                disabled: !candidate.available,
              }))}
              selectedId={game}
              onSelect={setGame}
            />
            {formatChips.length > 1 ? (
              <FilterChips
                testID="format-filter"
                accessibilityLabel="Format"
                chips={formatChips}
                selectedId={format}
                onSelect={setFormat}
              />
            ) : null}
          </View>
        ) : null}
        <SectionList
          testID="decks-list"
          sections={sections}
          keyExtractor={(deck) => deck._id}
          contentContainerStyle={themed($listContent)}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) =>
            section.data.length ? (
              <View style={themed($sectionHeader)}>
                <Text size="xs" weight="bold" text={section.title} />
                <Text size="xxs" style={themed($dimmedText)} text={`${section.data.length}`} />
              </View>
            ) : null
          }
          renderItem={({ item: deck }) => (
            <DeckRow
              deck={deck}
              game={game}
              onPress={() =>
                onSelect({
                  deckId: deck._id,
                  name: deck.name,
                  game: deck.game ?? DEFAULT_DECK_GAME,
                  format: deck.format,
                  cardQuantity: deck.cardQuantity,
                })
              }
            />
          )}
          ListEmptyComponent={
            mine ? (
              <View style={themed($empty)}>
                <Text
                  preset="subheading"
                  text={filtered ? "Nothing matches those filters" : `No ${gameLabel} decks yet`}
                />
                <Text
                  size="sm"
                  style={themed($dimmedText)}
                  text={
                    filtered
                      ? "Try another format or clear the search."
                      : "Add a deck to get started."
                  }
                />
                {filtered ? (
                  <Button
                    text="Clear filters"
                    onPress={() => {
                      setFormat(ALL_FORMATS)
                      setSearch("")
                    }}
                  />
                ) : null}
              </View>
            ) : null
          }
        />
      </View>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
})
const $searchRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
const $searchField: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $filterButton: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
const $filters: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ paddingBottom: spacing.lg })
const $sectionHeader: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingTop: spacing.md,
  paddingBottom: spacing.xxs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 88,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $cover: ThemedStyle<ImageStyle> = ({ spacing }) => ({
  width: 46,
  height: 64,
  borderRadius: spacing.xxxs,
})
const $coverPlaceholder: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 46,
  height: 64,
  borderRadius: spacing.xxxs,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.palette.neutral200,
})
const $rowCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, gap: spacing.xxxs })
const $dimmedText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $headerAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  height: 56,
  justifyContent: "center",
  paddingHorizontal: spacing.md,
})
const $empty: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.xl,
})
