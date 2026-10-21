import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { FlatList, ScrollView, SectionList, TouchableOpacity, View } from "react-native"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Svg, { Path } from "react-native-svg"

import type { AccountEntry } from "@/components/AppUtilityMenu"
import { Button } from "@/components/Button"
import { $dialogActions, $dialogButton, DialogCard } from "@/components/DialogCard"
import { FilterButton, FilterGroup, FilterPill } from "@/components/FilterPill"
import { FloatingAppNavigation } from "@/components/FloatingAppNavigation"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import type { DeckRecord } from "@/features/decks/deckCopy"
import { cardCountLabel, recordSummary } from "@/features/decks/deckCopy"
import { ALL_FORMATS, useDeckFilters } from "@/features/decks/deckFilters"
import { DeckCount } from "@/features/decks/DeckLimit"
import { isDeckSyncEnabled, useDeckSync } from "@/features/decks/decksSync"
import { useDeckMetadataWrites } from "@/features/decks/decksSyncWrites"
import { DeviceGlyph } from "@/features/decks/DeviceGlyph"
import { guestDeckLocalId, guestDeckRouteId, useGuestDecks } from "@/features/decks/guestDeck"
import { useLocalDeckLeftovers } from "@/features/decks/localDeckSync"
import { LocalDeckSyncNotice } from "@/features/decks/LocalDeckSyncNotice"
import { useRecentDecks } from "@/features/decks/recentDecks"
import { isSystemVisible } from "@/features/game/systemVisibility"
import { translate } from "@/i18n/translate"
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
import { isSystemId, type SystemId } from "../../convex/lib/systems"

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
  keyRecord?: DeckRecord
}

export type DeckSelection = {
  reviewChanges?: boolean
  deckId: string
  name: string
  game: string
  format: string
  cardQuantity?: number
}

type DeckCollection = "all" | "favorites" | "recent"

const ALL_SYSTEMS = "all"
const COLLECTIONS = [
  { id: "all", labelTx: "decks:shelf.collectionAll" },
  { id: "favorites", labelTx: "decks:shelf.collectionFavorites" },
  { id: "recent", labelTx: "decks:shelf.collectionRecent" },
] as const

function deckSubtitle(deck: ShelfDeck, game: string, showGame: boolean) {
  const cards = deck.cardQuantity
    ? cardCountLabel(deck.cardQuantity)
    : translate("decks:shelf.emptyList")
  const gameLabel = DECK_GAME_LIST.find((candidate) => candidate.id === game)?.shortLabel
  return [showGame ? gameLabel : null, deckFormatLabel(game, deck.format), cards]
    .filter(Boolean)
    .join(" · ")
}

function deckMarkerColor(game: string, { gameMenu: { actions } }: Theme["colors"]) {
  const markers = {
    mtg: actions.history,
    ygo: actions.players,
    pokemon: actions.setup,
    lorcana: actions.status,
    fab: actions.rules,
  } satisfies Record<SystemId, string>
  return markers[isSystemId(game) ? game : DEFAULT_DECK_GAME]
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
  needsReview,
  onPress,
  onToggleFavorite,
}: {
  deck: ShelfDeck
  showGame: boolean
  needsReview?: boolean
  onPress: (reviewChanges?: boolean) => void
  onToggleFavorite?: () => void
}) {
  const { theme, themed } = useAppTheme()
  const game = deck.game ?? DEFAULT_DECK_GAME
  const local = guestDeckLocalId(String(deck._id)) !== undefined
  const favorite = deck.favoritedAt !== undefined
  const record = recordSummary(deck.keyRecord ?? deck.record)
  const versions =
    deck.versionCount && deck.versionCount > 1
      ? translate("decks:shelf.versionCount", { count: deck.versionCount })
      : undefined

  return (
    <View testID={`deck-card-${deck._id}`} style={themed($row)}>
      <View
        testID={`deck-system-marker-${deck._id}`}
        style={[themed($systemMarker), { backgroundColor: deckMarkerColor(game, theme.colors) }]}
      />
      <TouchableOpacity
        style={themed($openButton)}
        accessibilityRole="button"
        accessibilityLabel={
          local
            ? translate("decks:stats.onDeviceLabel", { name: deck.name })
            : needsReview
              ? translate("decks:shelf.needsReview", { name: deck.name })
              : deck.name
        }
        activeOpacity={0.75}
        onPress={() => onPress()}
      >
        <View style={themed($rowCopy)}>
          <View style={$nameRow}>
            <Text weight="bold" size="sm" numberOfLines={1} text={deck.name} style={$name} />
            {local ? <DeviceGlyph /> : null}
          </View>
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
      {needsReview ? (
        <TouchableOpacity
          testID={`deck-needs-review-${deck._id}`}
          accessibilityRole="button"
          accessibilityLabel={translate("decks:shelf.reviewChanges", { name: deck.name })}
          style={themed($favoriteButton)}
          onPress={() => onPress(true)}
        >
          <Text text="!" size="xs" weight="bold" style={themed($reviewIndicator)} />
        </TouchableOpacity>
      ) : null}
      {onToggleFavorite ? (
        <TouchableOpacity
          testID={`favorite-deck-${deck._id}`}
          accessibilityRole="button"
          accessibilityLabel={
            favorite
              ? translate("decks:shelf.removeFavorite", { name: deck.name })
              : translate("decks:shelf.addFavorite", { name: deck.name })
          }
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

function DeckShelfSkeleton() {
  const { themed } = useAppTheme()
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={translate("decks:shelf.loading")}>
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
      <Text preset="subheading" tx="decks:shelf.unavailable" />
      <Text size="sm" style={themed($dimmedText)} tx="decks:shelf.loadFailed" />
      <Button testID="retry-decks" tx="common:retry" onPress={retry} />
    </View>
  )
}

function selectLocalDeck(row: ShelfDeck, onSelect: (deck: DeckSelection) => void) {
  onSelect({
    deckId: row._id,
    name: row.name,
    game: row.game ?? DEFAULT_DECK_GAME,
    format: row.format,
    cardQuantity: row.cardQuantity,
  })
}

type KeyTotals = FunctionReturnType<typeof api.deckStats.totalsByKey>

function KeyTotalsQuery({ onTotals }: { onTotals: (totals: KeyTotals) => void }) {
  const totals = useQuery(api.deckStats.totalsByKey, {})
  useEffect(() => {
    if (totals) onTotals(totals)
  }, [totals, onTotals])
  return null
}

function LocalDeckList({
  rows,
  showGame,
  onSelect,
  footer,
}: {
  rows: ShelfDeck[]
  showGame: boolean
  onSelect: (deck: DeckSelection) => void
  footer: ReactNode
}) {
  const { themed } = useAppTheme()
  return (
    <FlatList
      testID="local-decks-list"
      data={rows}
      keyExtractor={(row) => String(row._id)}
      contentContainerStyle={themed($listContent)}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={rows.length ? <Text size="xs" tx="decks:shelf.onDevice" /> : null}
      renderItem={({ item: row }) => (
        <DeckRow deck={row} showGame={showGame} onPress={() => selectLocalDeck(row, onSelect)} />
      )}
      ListFooterComponent={<>{footer}</>}
    />
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
  access,
  localRows,
  hasLocalDecks,
}: {
  localRows: ShelfDeck[]
  hasLocalDecks: boolean
  system: string
  format: string
  search: string
  collection: DeckCollection
  recentDeckIds: string[]
  clearVisibleFilters: () => void
  onSelect: (deck: DeckSelection) => void
  access?: CloudAccess
}) {
  const { themed } = useAppTheme()
  const syncEnabled = useMemo(() => isDeckSyncEnabled(), [])
  const onlineMine = useQuery(api.decks.listMine, access && !access.ready ? "skip" : {})
  const synced = useDeckSync(syncEnabled, access?.ownerId, access?.ready ?? false, onlineMine)
  const leftovers = useLocalDeckLeftovers(synced, access?.ownerId, access?.ready ?? false)
  const deviceRows = localRows.filter(
    (row) => !leftovers.localIds.has(guestDeckLocalId(String(row._id)) ?? ""),
  )
  const writes = useDeckMetadataWrites(syncEnabled, access?.ownerId, access?.ready ?? false)
  const failedDeckIds = useMemo(
    () => new Set(writes.failures.map((failure) => String(failure.action.deckId))),
    [writes.failures],
  )
  const localDecks = useMemo(() => {
    const metadata = new Map(writes.metadata.map((deck) => [String(deck.deckId), deck]))
    return synced.decks
      .map((deck) => {
        const local = metadata.get(deck._id)
        return local
          ? { ...deck, name: local.name, format: local.format, updatedAt: local.updatedAt }
          : deck
      })
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
  }, [synced.decks, writes.metadata])
  const mine = syncEnabled
    ? synced.loading && synced.decks.length === 0
      ? undefined
      : { decks: localDecks }
    : onlineMine
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
  const filtered =
    (collectionDecks.length > 0 || (hasLocalDecks && !localRows.length)) &&
    visibleDecks.length === 0
  const emptyTitle =
    collection === "favorites"
      ? "decks:shelf.noFavorites"
      : collection === "recent"
        ? "decks:shelf.noRecent"
        : "decks:shelf.noDecks"
  const emptyDetail =
    collection === "favorites"
      ? "decks:shelf.noFavoritesDetail"
      : collection === "recent"
        ? "decks:shelf.noRecentDetail"
        : "decks:shelf.noDecksDetail"

  async function toggleFavorite(deck: ShelfDeck) {
    try {
      setFavoriteError(undefined)
      await setFavorite({
        deckId: deck._id as Id<"decks">,
        favorite: deck.favoritedAt === undefined,
      })
    } catch {
      setFavoriteError(translate("decks:shelf.favoriteFailed"))
    }
  }

  const emptyShelf =
    syncEnabled && synced.unavailable && synced.decks.length === 0 ? (
      <View style={themed($empty)}>
        <Text tx="decks:shelf.reconnect" />
        <Button tx="common:tryAgain" onPress={() => void synced.retry()} />
      </View>
    ) : mine && localRows.length && !filtered && collection === "all" ? null : mine ? (
      <View style={themed($empty)}>
        <Text preset="subheading" tx={filtered ? "decks:shelf.nothingMatches" : emptyTitle} />
        <Text
          size="sm"
          style={themed($dimmedText)}
          tx={filtered ? "decks:shelf.tryAnotherSearch" : emptyDetail}
        />
        {filtered ? <Button tx="decks:shelf.clearSearch" onPress={clearVisibleFilters} /> : null}
      </View>
    ) : (
      <DeckShelfSkeleton />
    )
  const sections = [
    ...(visibleDecks.length || emptyShelf ? [{ key: "synced" as const, data: visibleDecks }] : []),
    ...(deviceRows.length ? [{ key: "local" as const, data: deviceRows }] : []),
  ]

  return (
    <SectionList
      testID="decks-list"
      sections={sections}
      extraData={failedDeckIds}
      keyExtractor={(deck) => String(deck._id)}
      contentContainerStyle={themed($listContent)}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View>
          {access?.ready ? (
            <LocalDeckSyncNotice
              key={access.ownerId}
              access={access}
              excludedLocalIds={leftovers.localIds}
            />
          ) : null}
          {leftovers.error ? (
            <View>
              <Text tx="decks:localSync.failed" />
              <Button tx="common:retry" onPress={leftovers.retry} />
            </View>
          ) : null}
          {favoriteError ? (
            <Text size="xs" style={themed($errorText)} text={favoriteError} />
          ) : null}
          {writes.capacityBlocked && writes.failures[0] ? (
            <View>
              <Text tx="decks:saveStatus.paused" />
              <Button
                tx="decks:shelf.reviewSavedEdit"
                onPress={() => {
                  const { deckId, name, game, format } = writes.failures[0].action
                  onSelect({ deckId, name, game, format, reviewChanges: true })
                }}
              />
            </View>
          ) : null}
        </View>
      }
      renderSectionHeader={({ section }) =>
        section.key === "local" ? (
          <Text size="xs" tx="decks:shelf.onDevice" />
        ) : (
          <Text size="xs" tx="decks:shelf.synced" />
        )
      }
      renderSectionFooter={({ section }) =>
        section.key === "synced" && !section.data.length ? emptyShelf : null
      }
      renderItem={({ item: deck, section }) =>
        section.key === "local" ? (
          <DeckRow
            deck={deck}
            showGame={system === ALL_SYSTEMS}
            onPress={() => selectLocalDeck(deck, onSelect)}
          />
        ) : (
          <DeckRow
            deck={deck}
            showGame={system === ALL_SYSTEMS}
            needsReview={failedDeckIds.has(String(deck._id))}
            onToggleFavorite={() => void toggleFavorite(deck)}
            onPress={(reviewChanges) => {
              onSelect({
                ...(reviewChanges ? { reviewChanges } : {}),
                deckId: deck._id,
                name: deck.name,
                game: deck.game ?? DEFAULT_DECK_GAME,
                format: deck.format,
                cardQuantity: deck.cardQuantity,
              })
            }}
          />
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
  onHistory,
  onSettings,
  onAccount,
  accountEntry = "account",
  unavailableMessage,
  access,
}: {
  onBack?: () => void
  initialSystem?: string
  onPlay: () => void
  hasCurrentGame?: boolean
  onSelect: (deck: DeckSelection) => void
  onAddDeck: () => void
  onHistory: () => void
  onSettings: () => void
  onAccount: () => void
  accountEntry?: AccountEntry
  unavailableMessage?: string
  access?: CloudAccess
}) {
  const { theme, themed } = useAppTheme()
  const { format, setGame, setFormat } = useDeckFilters()
  const { deckIds: recentDeckIds } = useRecentDecks()
  const guestDecks = useGuestDecks()
  const [totals, setTotals] = useState<KeyTotals>()
  const keyTotals = useMemo(
    () => new Map((totals ?? []).map(({ deckKey, ...record }) => [deckKey, record])),
    [totals],
  )
  const [collection, setCollection] = useState<DeckCollection>("all")
  const [system, setSystem] = useState(
    DECK_GAME_LIST.find((game) => game.id === initialSystem)?.id ?? ALL_SYSTEMS,
  )
  useEffect(() => {
    if (initialSystem && DECK_GAME_LIST.some((game) => game.id === initialSystem)) {
      setSystem(initialSystem)
      setGame(initialSystem, ALL_FORMATS)
    }
  }, [initialSystem, setGame])
  const [search, setSearch] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)

  const formatChips = useMemo(() => {
    if (system === ALL_SYSTEMS) return []
    const known = deckFormats(system).map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
    }))
    return [{ id: ALL_FORMATS, label: translate("decks:shelf.allFormats") }, ...known]
  }, [system])
  const selectedFormat = formatChips.find((candidate) => candidate.id === format)
  const selectedSystem = DECK_GAME_LIST.find((candidate) => candidate.id === system)
  const activeFormat = system === ALL_SYSTEMS ? ALL_FORMATS : format
  const filterCount = Number(system !== ALL_SYSTEMS) + Number(activeFormat !== ALL_FORMATS)
  const guestRows: ShelfDeck[] = guestDecks.map((guest) => ({
    _id: guestDeckRouteId(guest.localId),
    name: guest.deck.name,
    game: guest.deck.game ?? DEFAULT_DECK_GAME,
    format: guest.deck.format,
    cardQuantity: guest.deck.cards.reduce((total, card) => total + card.quantity, 0),
    keyRecord: keyTotals.get(guest.deckKey ?? guest.localId),
  }))
  const visibleGuestRows = guestRows.filter(
    (guestRow) =>
      collection !== "favorites" &&
      (collection !== "recent" || recentDeckIds.includes(guestRow._id)) &&
      (system === ALL_SYSTEMS || guestRow.game === system) &&
      (activeFormat === ALL_FORMATS || guestRow.format === activeFormat) &&
      matchesSearch(guestRow, search),
  )
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
        titleTx="decks:shelf.title"
        titleAccessory={
          (access?.ready ?? true) && !unavailableMessage ? <DeckCount access={access} /> : undefined
        }
        leftTx={onBack ? "decks:shelf.backToLobby" : undefined}
        onLeftPress={onBack}
        backgroundColor={theme.colors.surface}
        rightTx="decks:shelf.addDeck"
        onRightPress={onAddDeck}
      />
      <View style={themed($content)}>
        <View style={themed($filterRow)}>
          <ScrollView
            testID="collection-filter"
            accessibilityLabel={translate("decks:shelf.collection")}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={$filterScroll}
            contentContainerStyle={themed($collectionFilter)}
          >
            {COLLECTIONS.map(({ id, labelTx }) => (
              <FilterPill
                key={id}
                testID={`collection-filter-${id}`}
                label={translate(labelTx)}
                selected={collection === id}
                onPress={() => setCollection(id)}
              />
            ))}
          </ScrollView>
          <FilterButton
            testID="deck-filters-button"
            count={filterCount}
            onPress={() => setFiltersOpen(true)}
          />
        </View>
        <TextField
          testID="deck-search-input"
          placeholderTx="decks:shelf.search"
          value={search}
          maxLength={80}
          autoCorrect={false}
          clearable
          containerStyle={themed($searchField)}
          onChangeText={setSearch}
        />
        {filterCount > 0 ? (
          <View style={themed($activeFilters)}>
            {system !== ALL_SYSTEMS && selectedSystem ? (
              <FilterPill
                selected
                removable
                label={selectedSystem.shortLabel}
                onPress={() => {
                  setSystem(ALL_SYSTEMS)
                  setFormat(ALL_FORMATS)
                }}
              />
            ) : null}
            {activeFormat !== ALL_FORMATS && selectedFormat ? (
              <FilterPill
                selected
                removable
                label={selectedFormat.label}
                onPress={() => setFormat(ALL_FORMATS)}
              />
            ) : null}
          </View>
        ) : null}
        {guestOnly ? (
          <LocalDeckList
            rows={visibleGuestRows}
            showGame={system === ALL_SYSTEMS}
            onSelect={onSelect}
            footer={
              visibleGuestRows.length ? null : (
                <View style={themed($empty)}>
                  <Text
                    preset="subheading"
                    tx={guestDecks.length ? "decks:shelf.nothingMatches" : "decks:shelf.noDecks"}
                  />
                  <Text
                    size="sm"
                    tx={
                      guestDecks.length ? "decks:shelf.tryAnotherSearch" : "decks:shelf.guestEmpty"
                    }
                  />
                  {guestDecks.length ? (
                    <Button
                      tx="decks:shelf.clearSearch"
                      onPress={() => {
                        clearVisibleFilters()
                        setCollection("all")
                      }}
                    />
                  ) : null}
                </View>
              )
            }
          />
        ) : access && !access.ready && !(isDeckSyncEnabled() && access.ownerId) ? (
          <LocalDeckList
            rows={visibleGuestRows}
            showGame={system === ALL_SYSTEMS}
            onSelect={onSelect}
            footer={
              access.loading ? (
                <DeckShelfSkeleton />
              ) : (
                <View style={themed($empty)}>
                  <Text text={access.message ?? translate("decks:shelf.unavailable")} />
                  <Button
                    text={access.actionLabel ?? translate("common:tryAgain")}
                    onPress={access.request}
                  />
                </View>
              )
            }
          />
        ) : unavailableMessage ? (
          <LocalDeckList
            rows={visibleGuestRows}
            showGame={system === ALL_SYSTEMS}
            onSelect={onSelect}
            footer={
              <View testID="decks-offline-state" style={themed($empty)}>
                <Text preset="subheading" tx="decks:shelf.unavailable" />
                <Text size="sm" style={themed($dimmedText)} text={unavailableMessage} />
              </View>
            }
          />
        ) : (
          <ConvexQueryBoundary
            resetKey={`${collection}:${system}:${activeFormat}`}
            fallback={({ retry }) => (
              <LocalDeckList
                rows={visibleGuestRows}
                showGame={system === ALL_SYSTEMS}
                onSelect={onSelect}
                footer={<DeckShelfUnavailable retry={retry} />}
              />
            )}
          >
            <DeckShelf
              system={system}
              format={activeFormat}
              search={search}
              collection={collection}
              recentDeckIds={recentDeckIds}
              clearVisibleFilters={clearVisibleFilters}
              onSelect={onSelect}
              access={access}
              localRows={visibleGuestRows}
              hasLocalDecks={guestDecks.length > 0}
            />
          </ConvexQueryBoundary>
        )}
      </View>
      {access?.ready ? (
        <ConvexQueryBoundary fallback={() => null}>
          <KeyTotalsQuery onTotals={setTotals} />
        </ConvexQueryBoundary>
      ) : null}
      <FloatingAppNavigation
        destination={{
          kind: onBack ? "backToLobby" : hasCurrentGame ? "returnToGame" : "play",
          onPress: onPlay,
        }}
        accountEntry={accountEntry}
        onHistory={onHistory}
        onSettings={onSettings}
        onAccount={onAccount}
      />
      <DialogCard
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        dialogTestID="deck-filters-dialog"
        dialogAccessibilityRole="alert"
        backdropAccessibilityLabel={translate("decks:shelf.dismissFilters")}
        style={$filtersDialog}
      >
        <Text preset="subheading" tx="decks:filters.label" />
        <ScrollView style={$filtersScroll} contentContainerStyle={themed($dialogBody)}>
          <View testID="system-filter" accessibilityLabel={translate("decks:shelf.system")}>
            <FilterGroup heading={translate("decks:shelf.system")}>
              {[
                { id: ALL_SYSTEMS, shortLabel: translate("decks:shelf.allSystems") },
                ...DECK_GAME_LIST.filter((game) => isSystemVisible(game.id)),
              ].map((candidate) => (
                <FilterPill
                  key={candidate.id}
                  testID={`system-filter-${candidate.id}`}
                  label={candidate.shortLabel}
                  selected={system === candidate.id}
                  onPress={() => chooseSystem(candidate.id)}
                />
              ))}
            </FilterGroup>
          </View>
          {system !== ALL_SYSTEMS && formatChips.length > 1 ? (
            <View testID="format-filter" accessibilityLabel={translate("decks:shelf.format")}>
              <FilterGroup heading={translate("decks:shelf.format")}>
                {formatChips.map((candidate) => (
                  <FilterPill
                    key={candidate.id}
                    testID={`format-filter-${candidate.id}`}
                    label={candidate.label}
                    selected={format === candidate.id}
                    onPress={() => setFormat(candidate.id)}
                  />
                ))}
              </FilterGroup>
            </View>
          ) : system === ALL_SYSTEMS ? (
            <Text size="xs" style={themed($dimmedText)} tx="decks:shelf.chooseSystem" />
          ) : null}
        </ScrollView>
        <View style={themed($dialogActions)}>
          <Button
            style={themed($dialogButton)}
            tx="decks:shelf.clearFilters"
            disabled={filterCount === 0}
            onPress={clearFilters}
          />
          <Button
            testID="deck-filters-done"
            style={themed($dialogButton)}
            preset="primary"
            tx="decks:shelf.showDecks"
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
  minHeight: 44,
  paddingVertical: spacing.xs,
})
const $filterScroll: ViewStyle = { flex: 1 }
const $collectionFilter: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
  paddingRight: spacing.md,
})
const $activeFilters: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
  paddingBottom: spacing.xs,
})
const $searchField: ThemedStyle<ViewStyle> = ({ spacing }) => ({ paddingBottom: spacing.xs })
const $filtersDialog: ViewStyle = { height: 480 }
const $filtersScroll: ViewStyle = { flex: 1 }
const $dialogBody: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
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
const $reviewIndicator: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
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

const $nameRow: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 6 }
const $name: TextStyle = { flexShrink: 1 }
