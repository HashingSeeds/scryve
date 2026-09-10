import { useEffect, useMemo, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { FlatList, ScrollView, TouchableOpacity, View } from "react-native"
import { useMutation, useQuery } from "convex/react"
import Svg, { Path } from "react-native-svg"

import { Button } from "@/components/Button"
import { $dialogActions, $dialogButton, DialogCard } from "@/components/DialogCard"
import type { FilterChip } from "@/components/FilterChips"
import { FilterChips } from "@/components/FilterChips"
import { FloatingAppNavigation } from "@/components/FloatingAppNavigation"
import { Header } from "@/components/Header"
import { Icon } from "@/components/Icon"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import type { DeckRecord } from "@/features/decks/deckCopy"
import { cardCountLabel, recordSummary } from "@/features/decks/deckCopy"
import { ALL_FORMATS, useDeckFilters } from "@/features/decks/deckFilters"
import { useGuestDeck } from "@/features/decks/guestDeck"
import { GuestDeckTransfer } from "@/features/decks/GuestDeckImportNotice"
import { useRecentDecks } from "@/features/decks/recentDecks"
import { useAppTheme } from "@/theme/context"
import type { Theme, ThemedStyle } from "@/theme/types"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
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
  favoritedAt?: number
  record?: DeckRecord
}

export type DeckSelection = {
  deckId: string
  name: string
  game: string
  format: string
  cardQuantity?: number
}

type DeckCollection = "all" | "favorites" | "recent"

const ALL_SYSTEMS = "all"
const COLLECTIONS = [
  { id: "all", label: "All" },
  { id: "favorites", label: "Favorites" },
  { id: "recent", label: "Recent" },
] as const

function deckSubtitle(deck: ShelfDeck, game: string, showGame: boolean) {
  const cards = deck.cardQuantity ? cardCountLabel(deck.cardQuantity) : "Empty list"
  const gameLabel = DECK_GAME_LIST.find((candidate) => candidate.id === game)?.shortLabel
  return [showGame ? gameLabel : null, deckFormatLabel(game, deck.format), cards]
    .filter(Boolean)
    .join(" · ")
}

function deckMarkerColor(game: string, colors: Theme["colors"]) {
  if (game === "pokemon") return colors.gameMenu.actions.setup
  if (game === "ygo") return colors.gameMenu.actions.players
  return colors.gameMenu.actions.history
}

function matchesSearch(deck: ShelfDeck, search: string) {
  const term = search.trim().toLocaleLowerCase()
  if (!term) return true
  const game = deck.game ?? DEFAULT_DECK_GAME
  const gameLabel = DECK_GAME_LIST.find((candidate) => candidate.id === game)?.shortLabel ?? game
  return [deck.name, gameLabel, deckFormatLabel(game, deck.format)].some((value) =>
    value.toLocaleLowerCase().includes(term),
  )
}

function DeckRow({
  deck,
  showGame,
  onPress,
  onToggleFavorite,
}: {
  deck: ShelfDeck
  showGame: boolean
  onPress: () => void
  onToggleFavorite?: () => void
}) {
  const { theme, themed } = useAppTheme()
  const game = deck.game ?? DEFAULT_DECK_GAME
  const favorite = deck.favoritedAt !== undefined
  const record = recordSummary(deck.record)
  const versions =
    deck.versionCount && deck.versionCount > 1 ? `${deck.versionCount} versions` : undefined
  return (
    <View testID={`deck-card-${deck._id}`} style={themed($row)}>
      <View
        testID={`deck-system-marker-${deck._id}`}
        style={[themed($systemMarker), { backgroundColor: deckMarkerColor(game, theme.colors) }]}
      />
      <TouchableOpacity
        style={themed($openButton)}
        accessibilityRole="button"
        accessibilityLabel={deck.name}
        activeOpacity={0.75}
        onPress={onPress}
      >
        <View style={themed($rowCopy)}>
          <Text weight="bold" size="sm" numberOfLines={1} text={deck.name} />
          <Text
            size="xxs"
            numberOfLines={1}
            style={themed($dimmedText)}
            text={deckSubtitle(deck, game, showGame)}
          />
        </View>
        {record || versions ? (
          <View style={themed($rowContext)}>
            {record ? <Text size="xs" weight="bold" numberOfLines={1} text={record} /> : null}
            {versions ? (
              <Text size="xxs" numberOfLines={1} style={themed($dimmedText)} text={versions} />
            ) : null}
          </View>
        ) : null}
      </TouchableOpacity>
      {onToggleFavorite ? (
        <TouchableOpacity
          testID={`favorite-deck-${deck._id}`}
          accessibilityRole="button"
          accessibilityLabel={`${favorite ? "Remove" : "Add"} ${deck.name} ${favorite ? "from" : "to"} favorites`}
          hitSlop={8}
          style={themed($favoriteButton)}
          onPress={onToggleFavorite}
        >
          <StarIcon
            selected={favorite}
            color={favorite ? theme.colors.tint : theme.colors.textDim}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function CollectionChip({
  id,
  label,
  selected,
  onPress,
}: {
  id: DeckCollection
  label: string
  selected: boolean
  onPress: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <TouchableOpacity
      testID={`collection-filter-${id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      activeOpacity={0.8}
      style={[themed($collectionChip), selected ? themed($collectionChipSelected) : undefined]}
      onPress={onPress}
    >
      <Text
        text={label}
        size="xxs"
        weight={selected ? "medium" : "normal"}
        style={selected ? themed($collectionChipSelectedText) : themed($dimmedText)}
      />
    </TouchableOpacity>
  )
}

function StarIcon({ selected, color }: { selected: boolean; color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d="m12 2.6 2.86 5.8 6.4.93-4.63 4.51 1.09 6.38L12 17.2l-5.72 3.02 1.09-6.38-4.63-4.51 6.4-.93L12 2.6Z"
        fill={selected ? color : "none"}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function ActiveFilterChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { themed } = useAppTheme()
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Remove filter ${label}`}
      activeOpacity={0.8}
      style={themed($activeFilter)}
      onPress={onPress}
    >
      <Text size="xxs" weight="medium" style={themed($activeFilterText)} text={label} />
      <Icon icon="x" color="#FFFFFF" size={12} />
    </TouchableOpacity>
  )
}

function DeckShelfSkeleton() {
  const { themed } = useAppTheme()
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading decks">
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} testID="deck-skeleton-row" style={themed($row)}>
          <View testID="deck-skeleton-marker" style={themed($skeletonMarker)} />
          <View style={themed($skeletonContent)}>
            <View style={themed($rowCopy)}>
              <View style={themed($skeletonName)} />
              <View style={themed($skeletonSubtitle)} />
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}

function DeckShelfUnavailable({ retry }: { retry: () => void }) {
  const { themed } = useAppTheme()
  return (
    <View testID="decks-unavailable" style={themed($empty)}>
      <Text preset="subheading" text="Decks unavailable" />
      <Text size="sm" style={themed($dimmedText)} text="Could not load your decks." />
      <Button testID="retry-decks" text="Retry" onPress={retry} />
    </View>
  )
}

function DeckShelf({
  system,
  format,
  search,
  collection,
  recentDeckIds,
  clearVisibleFilters,
  onSelect,
}: {
  system: string
  format: string
  search: string
  collection: DeckCollection
  recentDeckIds: string[]
  clearVisibleFilters: () => void
  onSelect: (deck: DeckSelection) => void
}) {
  const { themed } = useAppTheme()
  const mine = useQuery(api.decks.listMine)
  const setFavorite = useMutation(api.decks.setFavorite)
  const [favoriteError, setFavoriteError] = useState<string>()
  const collectionDecks = useMemo(() => {
    const decks = mine?.decks ?? []
    if (collection === "favorites")
      return decks
        .filter((deck) => deck.favoritedAt !== undefined)
        .sort((left, right) => (right.favoritedAt ?? 0) - (left.favoritedAt ?? 0))
    if (collection === "recent") {
      const byId = new Map(decks.map((deck) => [String(deck._id), deck]))
      return recentDeckIds.flatMap((deckId) => {
        const deck = byId.get(deckId)
        return deck ? [deck] : []
      })
    }
    return decks
  }, [collection, mine?.decks, recentDeckIds])
  const visibleDecks = useMemo(
    () =>
      collectionDecks
        .filter((deck) => system === ALL_SYSTEMS || (deck.game ?? DEFAULT_DECK_GAME) === system)
        .filter((deck) => format === ALL_FORMATS || deck.format === format)
        .filter((deck) => matchesSearch(deck, search)),
    [collectionDecks, format, search, system],
  )
  const filtered = collectionDecks.length > 0 && visibleDecks.length === 0
  const emptyTitle =
    collection === "favorites"
      ? "No favorite decks yet"
      : collection === "recent"
        ? "No recent decks yet"
        : "No decks yet"
  const emptyDetail =
    collection === "favorites"
      ? "Use the star beside a deck to add it here."
      : collection === "recent"
        ? "Open a deck to add it here."
        : "Add a deck to get started."

  async function toggleFavorite(deck: ShelfDeck) {
    try {
      setFavoriteError(undefined)
      await setFavorite({
        deckId: deck._id as Id<"decks">,
        favorite: deck.favoritedAt === undefined,
      })
    } catch {
      setFavoriteError("Could not update this favorite.")
    }
  }

  return (
    <FlatList
      testID="decks-list"
      data={visibleDecks}
      keyExtractor={(deck) => String(deck._id)}
      contentContainerStyle={themed($listContent)}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        favoriteError ? <Text size="xs" style={themed($errorText)} text={favoriteError} /> : null
      }
      renderItem={({ item: deck }) => (
        <DeckRow
          deck={deck}
          showGame={system === ALL_SYSTEMS}
          onToggleFavorite={() => void toggleFavorite(deck)}
          onPress={() => {
            onSelect({
              deckId: deck._id,
              name: deck.name,
              game: deck.game ?? DEFAULT_DECK_GAME,
              format: deck.format,
              cardQuantity: deck.cardQuantity,
            })
          }}
        />
      )}
      ListEmptyComponent={
        mine ? (
          <View style={themed($empty)}>
            <Text preset="subheading" text={filtered ? "Nothing matches" : emptyTitle} />
            <Text
              size="sm"
              style={themed($dimmedText)}
              text={filtered ? "Try another search or clear the filters." : emptyDetail}
            />
            {filtered ? (
              <Button text="Clear search and filters" onPress={clearVisibleFilters} />
            ) : null}
          </View>
        ) : (
          <DeckShelfSkeleton />
        )
      }
    />
  )
}

export function DecksScreen({
  onBack,
  initialSystem,
  onPlay,
  hasCurrentGame = false,
  onSelect,
  onAddDeck,
  onSettings,
  onAccount,
  accountLabel = "Account",
  unavailableMessage,
  access,
}: {
  onBack?: () => void
  initialSystem?: string
  onPlay: () => void
  hasCurrentGame?: boolean
  onSelect: (deck: DeckSelection) => void
  onAddDeck: () => void
  onSettings: () => void
  onAccount: () => void
  accountLabel?: "Account" | "Sign in"
  unavailableMessage?: string
  access?: CloudAccess
}) {
  const { theme, themed } = useAppTheme()
  const { format, setGame, setFormat } = useDeckFilters()
  const { deckIds: recentDeckIds } = useRecentDecks()
  const guest = useGuestDeck()
  const [collection, setCollection] = useState<DeckCollection>("all")
  const [system, setSystem] = useState(
    DECK_GAME_LIST.find((game) => game.id === initialSystem)?.id ?? ALL_SYSTEMS,
  )
  useEffect(() => {
    if (initialSystem && DECK_GAME_LIST.some((game) => game.id === initialSystem)) {
      setGame(initialSystem, ALL_FORMATS)
    }
  }, [initialSystem, setGame])
  const [search, setSearch] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)

  const formatChips = useMemo<FilterChip[]>(() => {
    if (system === ALL_SYSTEMS) return []
    const known = deckFormats(system).map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
    }))
    return [{ id: ALL_FORMATS, label: "All formats" }, ...known]
  }, [system])
  const selectedFormat = formatChips.find((candidate) => candidate.id === format)
  const selectedSystem = DECK_GAME_LIST.find((candidate) => candidate.id === system)
  const activeFormat = system === ALL_SYSTEMS ? ALL_FORMATS : format
  const filterCount = Number(system !== ALL_SYSTEMS) + Number(activeFormat !== ALL_FORMATS)
  const guestRow: ShelfDeck | undefined = guest
    ? {
        _id: "guest",
        name: guest.deck.name,
        game: guest.deck.game ?? DEFAULT_DECK_GAME,
        format: guest.deck.format,
        cardQuantity: guest.deck.cards.reduce((total, card) => total + card.quantity, 0),
      }
    : undefined
  const guestVisible =
    guestRow &&
    collection !== "favorites" &&
    (collection !== "recent" || recentDeckIds.includes("guest")) &&
    (system === ALL_SYSTEMS || guestRow.game === system) &&
    (activeFormat === ALL_FORMATS || guestRow.format === activeFormat) &&
    matchesSearch(guestRow, search)
  const guestOnly = Boolean(
    unavailableMessage ||
    (access && !access.loading && !access.ready && !access.signedIn && !access.ownerId),
  )

  function chooseSystem(next: string) {
    setSystem(next)
    if (next !== ALL_SYSTEMS) {
      setGame(next, ALL_FORMATS)
    }
  }

  function clearFilters() {
    setSystem(ALL_SYSTEMS)
    setFormat(ALL_FORMATS)
  }

  function clearVisibleFilters() {
    clearFilters()
    setSearch("")
  }

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={[]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={themed($screen)}
    >
      <Header
        title="Decks"
        leftText={onBack ? "Back to lobby" : undefined}
        onLeftPress={onBack}
        backgroundColor={theme.colors.surface}
        rightText="Add deck"
        onRightPress={onAddDeck}
      />
      <View style={themed($content)}>
        <View style={themed($filterRow)}>
          <View
            testID="collection-filter"
            accessibilityLabel="Deck collection"
            style={themed($collectionFilter)}
          >
            {COLLECTIONS.map(({ id, label }) => (
              <CollectionChip
                key={id}
                id={id}
                label={label}
                selected={collection === id}
                onPress={() => setCollection(id)}
              />
            ))}
          </View>
          <Button
            testID="deck-filters-button"
            style={themed($filtersButton)}
            text={filterCount ? `Filters (${filterCount})` : "Filters"}
            onPress={() => setFiltersOpen(true)}
          />
        </View>
        <TextField
          testID="deck-search-input"
          placeholder="Search decks"
          value={search}
          maxLength={80}
          autoCorrect={false}
          clearButtonMode="while-editing"
          containerStyle={themed($searchField)}
          onChangeText={setSearch}
        />
        {filterCount > 0 ? (
          <View style={themed($activeFilters)}>
            {system !== ALL_SYSTEMS && selectedSystem ? (
              <ActiveFilterChip
                label={selectedSystem.shortLabel}
                onPress={() => {
                  setSystem(ALL_SYSTEMS)
                  setFormat(ALL_FORMATS)
                }}
              />
            ) : null}
            {activeFormat !== ALL_FORMATS && selectedFormat ? (
              <ActiveFilterChip
                label={selectedFormat.label}
                onPress={() => setFormat(ALL_FORMATS)}
              />
            ) : null}
          </View>
        ) : null}
        {guestVisible && guestRow ? (
          <View>
            <Text size="xs" text="On this device" />
            <DeckRow
              deck={guestRow}
              showGame={system === ALL_SYSTEMS}
              onPress={() =>
                onSelect({
                  deckId: "guest",
                  name: guestRow.name,
                  game: guestRow.game ?? DEFAULT_DECK_GAME,
                  format: guestRow.format,
                  cardQuantity: guestRow.cardQuantity,
                })
              }
            />
          </View>
        ) : null}
        {access?.ready ? <GuestDeckTransfer access={access} /> : null}
        {guestOnly ? (
          !guestVisible ? (
            <View style={themed($empty)}>
              <Text preset="subheading" text={guest ? "Nothing matches" : "No decks yet"} />
              <Text
                size="sm"
                text={
                  guest
                    ? "Try another search or clear the filters."
                    : "Save a deck on this device. No account needed."
                }
              />
              {guest ? (
                <Button
                  text="Clear search and filters"
                  onPress={() => {
                    clearVisibleFilters()
                    setCollection("all")
                  }}
                />
              ) : null}
            </View>
          ) : null
        ) : access && !access.ready ? (
          access.loading ? (
            <DeckShelfSkeleton />
          ) : (
            <View style={themed($empty)}>
              <Text text={access.message ?? "Decks unavailable"} />
              <Button text={access.actionLabel ?? "Try again"} onPress={access.request} />
            </View>
          )
        ) : unavailableMessage ? (
          <View testID="decks-offline-state" style={themed($empty)}>
            <Text preset="subheading" text="Decks unavailable" />
            <Text size="sm" style={themed($dimmedText)} text={unavailableMessage} />
          </View>
        ) : (
          <ConvexQueryBoundary
            resetKey={`${collection}:${system}:${activeFormat}`}
            fallback={({ retry }) => <DeckShelfUnavailable retry={retry} />}
          >
            <DeckShelf
              system={system}
              format={activeFormat}
              search={search}
              collection={collection}
              recentDeckIds={recentDeckIds}
              clearVisibleFilters={clearVisibleFilters}
              onSelect={onSelect}
            />
          </ConvexQueryBoundary>
        )}
      </View>
      <FloatingAppNavigation
        destinationLabel={onBack ? "Back to lobby" : hasCurrentGame ? "Return to game" : "Play"}
        accountLabel={accountLabel}
        onDestination={onPlay}
        onSettings={onSettings}
        onAccount={onAccount}
      />
      <DialogCard
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        dialogTestID="deck-filters-dialog"
        dialogAccessibilityRole="alert"
        backdropAccessibilityLabel="Dismiss filters"
      >
        <Text preset="subheading" text="Filters" />
        <ScrollView contentContainerStyle={themed($dialogBody)}>
          <View style={themed($filterGroup)}>
            <Text weight="bold" size="xxs" style={themed($groupHeading)} text="SYSTEM" />
            <FilterChips
              testID="system-filter"
              accessibilityLabel="System"
              chips={[
                { id: ALL_SYSTEMS, label: "All systems" },
                ...DECK_GAME_LIST.map((candidate) => ({
                  id: candidate.id,
                  label: candidate.shortLabel,
                })),
              ]}
              selectedId={system}
              onSelect={chooseSystem}
            />
          </View>
          {system !== ALL_SYSTEMS && formatChips.length > 1 ? (
            <View style={themed($filterGroup)}>
              <Text weight="bold" size="xxs" style={themed($groupHeading)} text="FORMAT" />
              <FilterChips
                testID="format-filter"
                accessibilityLabel="Format"
                chips={formatChips}
                selectedId={format}
                onSelect={setFormat}
              />
            </View>
          ) : null}
        </ScrollView>
        <View style={themed($dialogActions)}>
          <Button
            style={themed($dialogButton)}
            text="Clear filters"
            disabled={filterCount === 0}
            onPress={clearFilters}
          />
          <Button
            testID="deck-filters-done"
            style={themed($dialogButton)}
            preset="reversed"
            text="Show decks"
            onPress={() => setFiltersOpen(false)}
          />
        </View>
      </DialogCard>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  width: "100%",
  backgroundColor: colors.surface,
})
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
})
const $filterRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingVertical: spacing.xs,
})
const $collectionFilter: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  gap: spacing.xs,
})
const $collectionChip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.sm,
  borderRadius: spacing.lg,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $collectionChipSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.tint,
  backgroundColor: colors.tint,
})
const $collectionChipSelectedText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})
const $filtersButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 36,
  borderRadius: 12,
  paddingHorizontal: spacing.sm,
  paddingVertical: 0,
})
const $activeFilters: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
  paddingBottom: spacing.xs,
})
const $searchField: ThemedStyle<ViewStyle> = ({ spacing }) => ({ paddingBottom: spacing.xs })
const $activeFilter: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.sm,
  borderRadius: spacing.lg,
  backgroundColor: colors.tint,
})
const $activeFilterText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})
const $dialogBody: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $filterGroup: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $groupHeading: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textTransform: "uppercase",
  letterSpacing: 1,
})
const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.xs,
  paddingBottom: spacing.xxxl + spacing.lg,
})
const $row: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: 72,
  flexDirection: "row",
  alignItems: "center",
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $openButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.sm,
})
const $systemMarker: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: 6,
  height: 34,
  borderRadius: spacing.xxxs,
  marginRight: spacing.sm,
})
const $rowCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, gap: spacing.xxxs })
const $rowContext: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 72,
  alignItems: "flex-end",
  gap: spacing.xxxs,
})
const $favoriteButton: ThemedStyle<ViewStyle> = () => ({
  width: 44,
  height: 44,
  alignItems: "center",
  justifyContent: "center",
})
const $skeletonMarker: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 6,
  height: 34,
  borderRadius: spacing.xxxs,
  marginRight: spacing.sm,
  backgroundColor: colors.separator,
})
const $skeletonContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  paddingVertical: spacing.sm,
})
const $skeletonName: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "58%",
  height: 16,
  backgroundColor: colors.separator,
})
const $skeletonSubtitle: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "76%",
  height: 10,
  backgroundColor: colors.separator,
})
const $dimmedText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  paddingVertical: spacing.xs,
})
const $empty: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.xl,
})
