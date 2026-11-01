import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { FlatList, ScrollView, TouchableOpacity, View } from "react-native"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Svg, { Path } from "react-native-svg"

import type { AccountEntry } from "@/components/AppUtilityMenu"
import { Button } from "@/components/Button"
import { $dialogActions, $dialogButton, DialogCard } from "@/components/DialogCard"
import { FilterButton } from "@/components/FilterPill"
import { FloatingAppNavigation } from "@/components/FloatingAppNavigation"
import { Header } from "@/components/Header"
import { PressableIcon, type IconTypes } from "@/components/Icon"
import { NUMBER_LANE_WIDTH, TrailingNumber } from "@/components/NumberLane"
import { Screen } from "@/components/Screen"
import { SelectField } from "@/components/SelectField"
import { Tabs } from "@/components/Tabs"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { cardCountLabel, honestRate } from "@/features/decks/deckCopy"
import { ALL_FORMATS, useDeckFilters } from "@/features/decks/deckFilters"
import { DeckHomeGlyph } from "@/features/decks/DeckHomeGlyph"
import { DeckCount } from "@/features/decks/DeckLimit"
import { isDeckSyncEnabled, useDeckSync } from "@/features/decks/decksSync"
import { useDeckMetadataWrites } from "@/features/decks/decksSyncWrites"
import { allRecord, keyStatsRecord, type DeckStatsRecord } from "@/features/decks/deckStatLines"
import { guestDeckLocalId, guestDeckRouteId, useGuestDecks } from "@/features/decks/guestDeck"
import { useLocalDeckLeftovers } from "@/features/decks/localDeckSync"
import { LocalDeckSyncHeader } from "@/features/decks/LocalDeckSyncHeader"
import { useRecentDecks } from "@/features/decks/recentDecks"
import { isSystemVisible } from "@/features/game/systemVisibility"
import { isRTL } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { Theme, ThemedStyle } from "@/theme/types"
import { decorativeSvgProps } from "@/utils/decorativeSvgProps"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  DECK_GAME_LIST,
  deckFormatLabel,
  deckFormats,
  DEFAULT_DECK_GAME,
} from "../../convex/lib/deckGames"
import { isSystemId, tracksResults, type SystemId } from "../../convex/lib/systems"

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
  updatedAt?: number
  record?: DeckStatsRecord
  keyRecord?: DeckStatsRecord
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
const EMPTY_COLLECTION = {
  all: { titleTx: "decks:shelf.noDecks", detailTx: "decks:shelf.noDecksDetail" },
  favorites: { titleTx: "decks:shelf.noFavorites", detailTx: "decks:shelf.noFavoritesDetail" },
  recent: { titleTx: "decks:shelf.noRecent", detailTx: "decks:shelf.noRecentDetail" },
} as const satisfies Record<DeckCollection, unknown>

function deckSubtitle(deck: ShelfDeck, game: string, showGame: boolean) {
  const cards = deck.cardQuantity
    ? cardCountLabel(deck.cardQuantity)
    : translate("decks:shelf.emptyList")
  const gameLabel = DECK_GAME_LIST.find((candidate) => candidate.id === game)?.shortLabel
  const versions =
    deck.versionCount && deck.versionCount > 1
      ? translate("decks:shelf.versionCount", { count: deck.versionCount })
      : null
  return [showGame ? gameLabel : null, deckFormatLabel(game, deck.format), cards, versions]
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
    riftbound: actions.connect,
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
  favoriteSlot,
  onPress,
  onToggleFavorite,
}: {
  deck: ShelfDeck
  showGame: boolean
  needsReview?: boolean
  /** why: device decks can't be favorites, but in a list with account decks their lane icon still lines up. */
  favoriteSlot?: boolean
  onPress: (reviewChanges?: boolean) => void
  onToggleFavorite?: () => void
}) {
  const { theme, themed } = useAppTheme()
  const game = deck.game ?? DEFAULT_DECK_GAME
  const local = guestDeckLocalId(String(deck._id)) !== undefined
  const favorite = deck.favoritedAt !== undefined
  const allResults = deck.keyRecord ?? deck.record
  const rate = tracksResults(game) && allResults ? honestRate(allRecord(allResults)) : undefined

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
              : translate("decks:shelf.inAccountLabel", { name: deck.name })
        }
        activeOpacity={0.75}
        onPress={() => onPress()}
      >
        <View style={themed($rowCopy)}>
          <Text weight="medium" numberOfLines={1} text={deck.name} />
          <Text
            size="meta"
            numberOfLines={1}
            tone="dim"
            text={deckSubtitle(deck, game, showGame)}
          />
        </View>
        <View testID={`deck-record-lane-${deck._id}`} style={$recordLane}>
          {rate ? (
            <TrailingNumber
              weight="medium"
              tone={rate.games ? undefined : "dim"}
              value={rate.text}
            />
          ) : null}
          {rate && !rate.tooFew ? (
            <TrailingNumber
              size="meta"
              tone="dim"
              value={translate("decks:stats.ofGames", { count: rate.games })}
            />
          ) : null}
        </View>
        <View testID={`deck-home-lane-${deck._id}`} style={$homeLane}>
          <DeckHomeGlyph home={local ? "device" : "account"} />
        </View>
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
      ) : favoriteSlot ? (
        <View style={themed($favoriteButton)} />
      ) : null}
    </View>
  )
}

function StarIcon({ selected, color }: { selected: boolean; color: string }) {
  return (
    <Svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      {...decorativeSvgProps({ accessibilityElementsHidden: true })}
    >
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

/** why: Header's built-in icon action has no accessibility label, and every icon-only control needs one. */
function HeaderIconAction({
  icon,
  label,
  testID,
  onPress,
}: {
  icon: IconTypes
  label: string
  testID: string
  onPress: () => void
}) {
  const { theme, themed } = useAppTheme()
  return (
    <PressableIcon
      testID={testID}
      icon={icon}
      size={24}
      color={theme.colors.tint}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      containerStyle={themed($headerIcon)}
      style={icon === "back" && isRTL ? $flipped : undefined}
    />
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
      <Text size="sm" tone="dim" tx="decks:shelf.loadFailed" />
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

type OwnerTotals = { ownerId: string; rows: KeyTotals }

function KeyTotalsQuery({
  ownerId,
  onTotals,
}: {
  ownerId: string
  onTotals: (totals: OwnerTotals) => void
}) {
  const rows = useQuery(api.deckStats.totalsByKey, {})
  useEffect(() => {
    if (rows) onTotals({ ownerId, rows })
  }, [rows, ownerId, onTotals])
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
      .filter((deck) => !metadata.get(deck._id)?.deleted)
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
  const rows = (() => {
    const merged = [
      ...visibleDecks.map((deck) => ({ home: "account" as const, deck })),
      ...deviceRows.map((deck) => ({ home: "device" as const, deck })),
    ]
    if (collection === "favorites") return merged
    const rank = (deck: ShelfDeck) =>
      collection === "recent" ? -recentDeckIds.indexOf(String(deck._id)) : (deck.updatedAt ?? 0)
    return merged.sort((left, right) => rank(right.deck) - rank(left.deck))
  })()
  const filtered = (collectionDecks.length > 0 || hasLocalDecks) && rows.length === 0
  const { titleTx, detailTx } = EMPTY_COLLECTION[collection]

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
    ) : !mine ? (
      <DeckShelfSkeleton />
    ) : rows.length ? null : (
      <View style={themed($empty)}>
        <Text preset="subheading" tx={filtered ? "decks:shelf.nothingMatches" : titleTx} />
        <Text size="sm" tone="dim" tx={filtered ? "decks:shelf.tryAnotherSearch" : detailTx} />
        {filtered ? <Button tx="decks:shelf.clearSearch" onPress={clearVisibleFilters} /> : null}
      </View>
    )

  return (
    <FlatList
      testID="decks-list"
      data={rows}
      extraData={failedDeckIds}
      keyExtractor={(row) => String(row.deck._id)}
      contentContainerStyle={themed($listContent)}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
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
          {deviceRows.length ? (
            <LocalDeckSyncHeader
              key={access?.ownerId}
              access={access}
              excludedLocalIds={leftovers.localIds}
            />
          ) : null}
          {emptyShelf}
        </View>
      }
      renderItem={({ item: row }) =>
        row.home === "device" ? (
          <DeckRow
            deck={row.deck}
            showGame={system === ALL_SYSTEMS}
            favoriteSlot
            onPress={() => selectLocalDeck(row.deck, onSelect)}
          />
        ) : (
          <DeckRow
            deck={row.deck}
            showGame={system === ALL_SYSTEMS}
            needsReview={failedDeckIds.has(String(row.deck._id))}
            onToggleFavorite={() => void toggleFavorite(row.deck)}
            onPress={(reviewChanges) => {
              onSelect({
                ...(reviewChanges ? { reviewChanges } : {}),
                deckId: row.deck._id,
                name: row.deck.name,
                game: row.deck.game ?? DEFAULT_DECK_GAME,
                format: row.deck.format,
                cardQuantity: row.deck.cardQuantity,
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
  onCards,
  onHistory,
  onSettings,
  onSupport,
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
  onCards?: (game?: string) => void
  onHistory: () => void
  onSettings: () => void
  onSupport: () => void
  onAccount: () => void
  accountEntry?: AccountEntry
  unavailableMessage?: string
  access?: CloudAccess
}) {
  const { theme, themed } = useAppTheme()
  const { format, setGame, setFormat } = useDeckFilters()
  const { deckIds: recentDeckIds } = useRecentDecks()
  const guestDecks = useGuestDecks()
  const [totals, setTotals] = useState<OwnerTotals>()
  const ownRows =
    access?.ready && totals && totals.ownerId === access.ownerId ? totals.rows : undefined
  const keyTotals = useMemo(
    () => new Map((ownRows ?? []).map((row) => [row.deckKey, keyStatsRecord(row)])),
    [ownRows],
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
  const systemOptions = [
    { id: ALL_SYSTEMS, label: translate("decks:shelf.allSystems") },
    ...DECK_GAME_LIST.filter((game) => isSystemVisible(game.id)).map((game) => ({
      id: game.id,
      label: game.shortLabel,
    })),
  ]
  const activeFormat = system === ALL_SYSTEMS ? ALL_FORMATS : format
  const filterCount = Number(system !== ALL_SYSTEMS) + Number(activeFormat !== ALL_FORMATS)
  const guestRows: ShelfDeck[] = guestDecks.map((guest) => ({
    _id: guestDeckRouteId(guest.localId),
    updatedAt: guest.updatedAt,
    name: guest.deck.name,
    game: guest.deck.game ?? DEFAULT_DECK_GAME,
    format: guest.deck.format,
    cardQuantity: guest.deck.cards.reduce((total, card) => total + card.quantity, 0),
    keyRecord: keyTotals.get(guest.deckKey ?? guest.localId),
  }))
  const collectionGuestRows = guestRows.filter(
    (guestRow) =>
      collection !== "favorites" &&
      (collection !== "recent" || recentDeckIds.includes(guestRow._id)),
  )
  const visibleGuestRows = collectionGuestRows.filter(
    (guestRow) =>
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
        LeftActionComponent={
          onBack ? (
            <HeaderIconAction
              testID="decks-back"
              icon="back"
              label={translate("decks:shelf.backToLobby")}
              onPress={onBack}
            />
          ) : undefined
        }
        leftTx={onCards ? "decks:shelf.cards" : undefined}
        onLeftPress={onCards && (() => onCards(system === ALL_SYSTEMS ? undefined : system))}
        backgroundColor={theme.colors.surface}
        RightActionComponent={
          <HeaderIconAction
            testID="decks-add-deck"
            icon="plus"
            label={translate("decks:shelf.addDeck")}
            onPress={onAddDeck}
          />
        }
      />
      <View style={themed($content)}>
        <View style={themed($searchRow)}>
          <TextField
            testID="deck-search-input"
            placeholderTx="decks:shelf.search"
            value={search}
            maxLength={80}
            autoCorrect={false}
            clearable
            containerStyle={$flex1}
            onChangeText={setSearch}
          />
          <FilterButton
            testID="deck-filters-button"
            count={filterCount}
            onPress={() => setFiltersOpen(true)}
          />
        </View>
        <Tabs
          testID="collection-filter"
          tabs={COLLECTIONS.map(({ id, labelTx }) => ({ id, label: translate(labelTx) }))}
          selectedId={collection}
          onSelect={setCollection}
        />
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
                    tx={
                      collectionGuestRows.length
                        ? "decks:shelf.nothingMatches"
                        : EMPTY_COLLECTION[collection].titleTx
                    }
                  />
                  <Text
                    size="sm"
                    tx={
                      collectionGuestRows.length
                        ? "decks:shelf.tryAnotherSearch"
                        : collection === "all"
                          ? "decks:shelf.guestEmpty"
                          : EMPTY_COLLECTION[collection].detailTx
                    }
                  />
                  {collectionGuestRows.length ? (
                    <Button tx="decks:shelf.clearSearch" onPress={clearVisibleFilters} />
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
                <Text size="sm" tone="dim" text={unavailableMessage} />
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
              hasLocalDecks={collectionGuestRows.length > 0}
            />
          </ConvexQueryBoundary>
        )}
      </View>
      {access?.ready && access.ownerId && guestDecks.length > 0 ? (
        <ConvexQueryBoundary key={access.ownerId} fallback={() => null}>
          <KeyTotalsQuery ownerId={access.ownerId} onTotals={setTotals} />
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
        onSupport={onSupport}
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
          <SelectField
            testID="system-filter"
            label={translate("decks:shelf.system")}
            field="system"
            options={systemOptions}
            value={system}
            onSelect={(next) => chooseSystem(next ?? ALL_SYSTEMS)}
          />
          {system !== ALL_SYSTEMS && formatChips.length > 1 ? (
            <SelectField
              testID="format-filter"
              label={translate("decks:shelf.format")}
              field="format"
              options={formatChips}
              value={format}
              onSelect={(next) => setFormat(next ?? ALL_FORMATS)}
            />
          ) : system === ALL_SYSTEMS ? (
            <Text size="xs" tone="dim" tx="decks:shelf.chooseSystem" />
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
const $searchRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  // why: FilterButton pulls itself spacing.md left to overlap scrolling pills, so this leaves spacing.xs beside the field.
  gap: spacing.md + spacing.xs,
  paddingVertical: spacing.xs,
})
const $flex1: ViewStyle = { flex: 1 }
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
const $systemMarker: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  width: 6,
  height: 34,
  borderRadius: radius.xxs,
  marginRight: spacing.sm,
})
const $rowCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, gap: spacing.xxxs })
const $recordLane: ViewStyle = { width: NUMBER_LANE_WIDTH }
const $reviewIndicator: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
const $favoriteButton: ThemedStyle<ViewStyle> = () => ({
  width: 44,
  height: 44,
  alignItems: "center",
  justifyContent: "center",
})
const $skeletonMarker: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  width: 6,
  height: 34,
  borderRadius: radius.xxs,
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
const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  paddingVertical: spacing.xs,
})
const $empty: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.xl,
})

const $homeLane: ViewStyle = { width: 22, alignItems: "center" }
const $headerIcon: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  height: "100%",
  justifyContent: "center",
  paddingHorizontal: spacing.md,
})
const $flipped: ImageStyle = { transform: [{ rotate: "180deg" }] }
