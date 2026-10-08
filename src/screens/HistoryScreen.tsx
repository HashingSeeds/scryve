import { useMemo, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, SectionList, TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { $dialogActions, $dialogButton, DialogCard } from "@/components/DialogCard"
import { EmptyState } from "@/components/EmptyState"
import { FilterPill, FilterGroup, FilterButton } from "@/components/FilterPill"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { ConnectedHistoryFeed } from "@/features/connected/ConnectedHistorySource"
import type { LocalGameSummary } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

import type {
  HistoryEntry,
  HistoryFilters,
  HistoryMatchDetails,
  HistoryOutcome,
  HistorySource,
} from "./historyEntries"
import {
  activeFilterCount,
  DATE_RANGE_LABELS,
  daySections,
  entryDeckNames,
  entryPlayerNames,
  filterHistory,
  filterOptions,
  filtersActive,
  formatChoices,
  formatKeyLabel,
  localHistoryEntry,
  NO_FILTERS,
  OUTCOME_LABELS,
  podSizeLabel,
  sortedByRecency,
  SOURCE_LABELS,
  systemLabel,
  tallyOutcomes,
  toggleSystem,
  type DateRange,
} from "./historyEntries"

export interface HistoryScreenProps {
  games: LocalGameSummary[]
  onBack: () => void
  onSelectLocal: (gameId: string) => void
  onSelectConnected: (publicId: string) => void
  onSelectManual: (publicId: string) => void
  onAddMatch?: () => void
  connected?: ConnectedHistoryFeed
  initialSource?: HistorySource
}

const MAX_COLOR_DOTS = 4
const DATE_RANGES: DateRange[] = ["any", "7d", "30d", "year"]
const OUTCOMES: HistoryOutcome[] = ["win", "loss", "draw", "unrecorded"]
const SOURCES: { value: HistoryFilters["source"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "local", label: SOURCE_LABELS.local },
  { value: "connected", label: SOURCE_LABELS.connected },
  { value: "manual", label: SOURCE_LABELS.manual },
]

const OUTCOME_BADGES = {
  win: { label: "W", accessibilityLabel: "Win" },
  loss: { label: "L", accessibilityLabel: "Loss" },
  draw: { label: "D", accessibilityLabel: "Draw" },
  unrecorded: { label: "–", accessibilityLabel: "Result not recorded" },
  abandoned: { label: "A", accessibilityLabel: "Abandoned" },
} as const

function badgeFor(entry: HistoryEntry) {
  if (entry.outcome !== "unrecorded") return OUTCOME_BADGES[entry.outcome]
  return entry.status === "abandoned" ? OUTCOME_BADGES.abandoned : OUTCOME_BADGES.unrecorded
}

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function titleFor(entry: HistoryEntry) {
  if (entry.match) return `vs ${entry.match.opponents.join(" · ")}`
  const names = entryPlayerNames(entry)
  if (names.length > 0) return names.join(" · ")
  return `${entry.players.length} player${entry.players.length === 1 ? "" : "s"}`
}

// why: a manual match only knows its date, so its row shows the score and event instead of a time.
function matchSubtitleFor(entry: HistoryEntry, match: HistoryMatchDetails) {
  return [
    SOURCE_LABELS[entry.source],
    [`Bo${match.bestOf}`, match.score].filter(Boolean).join(" "),
    [match.eventName, match.roundNumber === undefined ? undefined : `R${match.roundNumber}`]
      .filter(Boolean)
      .join(" "),
    match.deckName,
  ]
    .filter(Boolean)
    .join(" · ")
}

function subtitleFor(entry: HistoryEntry) {
  if (entry.match) return matchSubtitleFor(entry, entry.match)
  const decks = [...new Set(entryDeckNames(entry))]
  return [
    SOURCE_LABELS[entry.source],
    timeLabel(entry.finishedAt),
    entry.winnerNames?.length ? `Won by ${entry.winnerNames.join(" & ")}` : undefined,
    decks.length > 0 ? decks.join(", ") : undefined,
  ]
    .filter(Boolean)
    .join(" · ")
}

function toggled<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function HistoryRow({ entry, onPress }: { entry: HistoryEntry; onPress: () => void }) {
  const { theme, themed } = useAppTheme()
  const badge = badgeFor(entry)
  const badgeTone =
    entry.outcome === "win"
      ? theme.colors.tint
      : entry.outcome === "loss"
        ? theme.colors.error
        : theme.colors.textDim
  const extraPlayers = entry.players.length - MAX_COLOR_DOTS

  return (
    <TouchableOpacity
      testID={`history-row-${entry.source}-${entry.routeId}`}
      accessibilityRole="button"
      accessibilityLabel={`${badge.accessibilityLabel} · ${titleFor(entry)} · ${subtitleFor(entry)}`}
      activeOpacity={0.8}
      style={themed($row)}
      onPress={onPress}
    >
      <View style={[themed($badge), { borderColor: badgeTone }]}>
        <Text weight="bold" size="sm" text={badge.label} style={{ color: badgeTone }} />
      </View>
      <View style={$styles.flex1}>
        <Text size="sm" weight="medium" numberOfLines={2} text={titleFor(entry)} />
        <Text size="xxs" numberOfLines={1} style={themed($dimmedText)} text={subtitleFor(entry)} />
      </View>
      {entry.match ? null : (
        <View style={themed($dots)}>
          {entry.players.slice(0, MAX_COLOR_DOTS).map((player) => (
            <View
              key={player.id}
              style={[themed($dot), player.color ? { backgroundColor: player.color } : undefined]}
            />
          ))}
          {extraPlayers > 0 ? (
            <Text size="xxs" style={themed($dimmedText)} text={`+${extraPlayers}`} />
          ) : null}
        </View>
      )}
    </TouchableOpacity>
  )
}

function HistoryRowSkeleton({ testID = "history-skeleton-row" }: { testID?: string }) {
  const { themed } = useAppTheme()
  return (
    <View testID={testID} style={themed($row)}>
      <View style={themed($skeletonBadge)} />
      <View style={themed($skeletonCopy)}>
        <View style={themed($skeletonTitle)} />
        <View style={themed($skeletonSubtitle)} />
      </View>
      <View style={themed($skeletonDots)} />
    </View>
  )
}

function HistoryRowsSkeleton() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading connected history">
      {Array.from({ length: 3 }).map((_, index) => (
        <HistoryRowSkeleton key={index} />
      ))}
    </View>
  )
}

function ConnectedHistoryStatus({
  status,
  onRetry,
}: {
  status: "loading" | "unavailable"
  onRetry?: () => void
}) {
  const { themed } = useAppTheme()
  if (status === "loading")
    return (
      <View
        testID="history-connected-progress"
        accessibilityRole="progressbar"
        accessibilityLabel="Loading connected history"
        style={themed($row)}
      >
        <View style={themed($skeletonBadge)} />
        <Text size="xs" style={themed($dimmedText)} text="Loading connected history…" />
      </View>
    )

  return (
    <View testID="history-connected-unavailable" accessibilityRole="alert" style={themed($status)}>
      <Text size="xs" text="Connected history is unavailable." />
      <Button
        testID="history-retry-connected"
        style={themed($statusButton)}
        text="Try again"
        onPress={onRetry}
      />
    </View>
  )
}

export function HistoryScreen({
  games,
  onBack,
  onSelectLocal,
  onSelectConnected,
  onSelectManual,
  onAddMatch,
  connected,
  initialSource,
}: HistoryScreenProps) {
  const { themed } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const [filters, setFilters] = useState<HistoryFilters>({
    ...NO_FILTERS,
    source: initialSource ?? "all",
  })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const connectedPage = connected?.page

  const entries = useMemo(() => {
    const unique = new Map<string, HistoryEntry>()
    const connectedEntries = connectedPage?.status === "ready" ? connectedPage.items : []
    // why: the device copy of a published game keeps its winner line and seat outcome, so it overrides the server row.
    for (const entry of [...connectedEntries, ...games.map(localHistoryEntry)])
      unique.set(entry.key, entry)
    return sortedByRecency([...unique.values()])
  }, [games, connectedPage])
  const now = Date.now()
  const visible = filterHistory(entries, filters, now)
  const options = useMemo(() => filterOptions(entries), [entries])
  const formats = formatChoices(options.formats, filters.systems)
  const record = tallyOutcomes(visible)
  const filterCount = activeFilterCount(filters)
  const anyFilters = filtersActive(filters)
  const connectedRelevant = filters.source !== "local"
  const loadingFirstPage = connectedRelevant && connectedPage?.status === "loading"
  const connectedUnavailable = connectedRelevant && connectedPage?.status === "unavailable"
  const canLoadOlderMatches =
    anyFilters &&
    connectedRelevant &&
    connectedPage?.status === "ready" &&
    connectedPage.nextPage.status !== "exhausted"
  const loadOlderMatches =
    connectedPage?.status === "ready" && connectedPage.nextPage.status === "available"
      ? connectedPage.nextPage.load
      : undefined
  const loadingOlderMatches =
    connectedPage?.status === "ready" && connectedPage.nextPage.status === "loading"
  const loadingMore =
    connectedRelevant &&
    connectedPage?.status === "ready" &&
    connectedPage.nextPage.status === "loading"
  const localVisibleCount = visible.filter((entry) => entry.source === "local").length
  const recordLabel = `${visible.length} game${visible.length === 1 ? "" : "s"} · ${record.wins}W · ${record.losses}L · ${record.draws}D`
  const countLabel = loadingFirstPage
    ? localVisibleCount > 0
      ? `${localVisibleCount} local game${localVisibleCount === 1 ? "" : "s"} · Connected history loading`
      : "Loading connected history…"
    : connectedUnavailable
      ? localVisibleCount > 0
        ? `${localVisibleCount} local game${localVisibleCount === 1 ? "" : "s"} · Connected history unavailable`
        : "Connected history unavailable"
      : loadingMore
        ? `${visible.length} loaded game${visible.length === 1 ? "" : "s"} · Loading more connected history`
        : recordLabel

  function patch(change: Partial<HistoryFilters>) {
    setFilters((current) => ({ ...current, ...change }))
  }

  const activeChips: { key: string; label: string; clear: () => void }[] = [
    ...(filters.dateRange === "any"
      ? []
      : [
          {
            key: "date",
            label: DATE_RANGE_LABELS[filters.dateRange],
            clear: () => patch({ dateRange: "any" as DateRange }),
          },
        ]),
    ...filters.players.map((name) => ({
      key: `player:${name}`,
      label: name,
      clear: () => patch({ players: filters.players.filter((value) => value !== name) }),
    })),
    ...filters.decks.map((deck) => ({
      key: `deck:${deck}`,
      label: deck,
      clear: () => patch({ decks: filters.decks.filter((value) => value !== deck) }),
    })),
    ...filters.outcomes.map((outcome) => ({
      key: `outcome:${outcome}`,
      label: OUTCOME_LABELS[outcome],
      clear: () => patch({ outcomes: filters.outcomes.filter((value) => value !== outcome) }),
    })),
    ...filters.podSizes.map((size) => ({
      key: `pod:${size}`,
      label: podSizeLabel(size),
      clear: () => patch({ podSizes: filters.podSizes.filter((value) => value !== size) }),
    })),
    ...filters.systems.map((system) => ({
      key: `system:${system}`,
      label: systemLabel(system),
      clear: () => setFilters((current) => toggleSystem(current, system)),
    })),
    ...filters.formats.map((format) => ({
      key: `format:${format}`,
      label: formatKeyLabel(format),
      clear: () => patch({ formats: filters.formats.filter((value) => value !== format) }),
    })),
  ]

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header
        title={titleVisible ? "History" : ""}
        leftTx="common:back"
        onLeftPress={onBack}
        {...(onAddMatch ? { rightText: "Add result", onRightPress: onAddMatch } : {})}
      />
      <SectionList
        testID="history-list"
        style={$styles.flex1}
        contentContainerStyle={themed($listContent)}
        sections={daySections(visible, now)}
        keyExtractor={(entry) => entry.key}
        stickySectionHeadersEnabled={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View style={themed($headerBlock)}>
            <Text preset="heading" text="History" />
            <Text size="xs" style={themed($dimmedText)} text={countLabel} />
            <View style={$chipRow}>
              <ScrollView
                horizontal
                style={$filterScroll}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={themed($chipScroll)}
              >
                {SOURCES.map((source) => (
                  <FilterPill
                    key={source.value}
                    testID={`history-source-${source.value}`}
                    label={source.label}
                    selected={filters.source === source.value}
                    onPress={() => patch({ source: source.value })}
                  />
                ))}
              </ScrollView>
              <FilterButton
                testID="history-filters-button"
                count={filterCount}
                onPress={() => setFiltersOpen(true)}
              />
            </View>
            {activeChips.length > 0 ? (
              <View style={themed($chipWrap)}>
                {activeChips.map((chip) => (
                  <FilterPill
                    key={chip.key}
                    label={chip.label}
                    selected
                    removable
                    onPress={chip.clear}
                  />
                ))}
              </View>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text weight="bold" size="xs" style={themed($dayHeading)} text={section.label} />
        )}
        renderItem={({ item }) => (
          <HistoryRow
            entry={item}
            onPress={() =>
              item.source === "local"
                ? onSelectLocal(item.routeId)
                : item.source === "manual"
                  ? onSelectManual(item.routeId)
                  : onSelectConnected(item.routeId)
            }
          />
        )}
        ListEmptyComponent={
          loadingFirstPage ? (
            <HistoryRowsSkeleton />
          ) : connectedUnavailable ? null : canLoadOlderMatches ? (
            <EmptyState
              heading="No matches in loaded games"
              content="Load older games to search further back."
              button="Load older games"
              buttonOnPress={loadOlderMatches}
              ButtonProps={{ disabled: loadingOlderMatches }}
            />
          ) : anyFilters ? (
            <EmptyState
              heading="No games match these filters"
              content="Clear a filter to widen the search."
              button="Clear filters"
              buttonOnPress={() => setFilters(NO_FILTERS)}
            />
          ) : (
            <EmptyState headingTx="game:noGames" contentTx="game:noGamesContent" />
          )
        }
        ListFooterComponent={
          <View style={themed($footerBlock)}>
            {loadingFirstPage && visible.length > 0 ? (
              <ConnectedHistoryStatus status="loading" />
            ) : null}
            {connectedUnavailable ? (
              <ConnectedHistoryStatus status="unavailable" onRetry={connectedPage.retry} />
            ) : null}
            {connected?.migration.status === "failed" ? (
              <View
                testID="history-migration-error"
                accessibilityRole="alert"
                style={themed($status)}
              >
                <Text size="xs" text="Some older connected games could not be added." />
                <Button
                  testID="history-retry-migration"
                  style={themed($statusButton)}
                  text="Retry import"
                  onPress={connected.migration.retry}
                />
              </View>
            ) : null}
            {connectedPage?.status === "ready" &&
            connectedPage.nextPage.status !== "exhausted" &&
            !(canLoadOlderMatches && visible.length === 0) ? (
              <>
                <Button
                  testID="history-load-more"
                  text={
                    connectedPage.nextPage.status === "loading"
                      ? "Loading more connected games…"
                      : "Load more connected games"
                  }
                  disabled={connectedPage.nextPage.status === "loading"}
                  onPress={
                    connectedPage.nextPage.status === "available"
                      ? connectedPage.nextPage.load
                      : undefined
                  }
                />
                {anyFilters ? (
                  <Text
                    size="xxs"
                    style={themed($dimmedText)}
                    text="Filters apply to loaded games. Load more to search further back."
                  />
                ) : null}
              </>
            ) : null}
          </View>
        }
      />
      <DialogCard
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        dialogTestID="history-filters-dialog"
        dialogAccessibilityRole="alert"
        backdropAccessibilityLabel="Dismiss filters"
      >
        <Text preset="subheading" text="Filters" />
        <ScrollView contentContainerStyle={themed($dialogBody)}>
          <FilterGroup heading="Date">
            {DATE_RANGES.map((range) => (
              <FilterPill
                key={range}
                testID={`history-date-${range}`}
                label={DATE_RANGE_LABELS[range]}
                selected={filters.dateRange === range}
                onPress={() => patch({ dateRange: range })}
              />
            ))}
          </FilterGroup>
          {options.players.length > 0 ? (
            <FilterGroup heading="Players">
              {options.players.map((name) => (
                <FilterPill
                  key={name}
                  testID={`history-player-${name}`}
                  label={name}
                  selected={filters.players.includes(name)}
                  onPress={() => patch({ players: toggled(filters.players, name) })}
                />
              ))}
            </FilterGroup>
          ) : null}
          {options.decks.length > 0 ? (
            <FilterGroup heading="Decks">
              {options.decks.map((deck) => (
                <FilterPill
                  key={deck}
                  testID={`history-deck-${deck}`}
                  label={deck}
                  selected={filters.decks.includes(deck)}
                  onPress={() => patch({ decks: toggled(filters.decks, deck) })}
                />
              ))}
            </FilterGroup>
          ) : null}
          <FilterGroup heading="Result">
            {OUTCOMES.map((outcome) => (
              <FilterPill
                key={outcome}
                testID={`history-outcome-${outcome}`}
                label={OUTCOME_LABELS[outcome]}
                selected={filters.outcomes.includes(outcome)}
                onPress={() => patch({ outcomes: toggled(filters.outcomes, outcome) })}
              />
            ))}
          </FilterGroup>
          {options.podSizes.length > 0 ? (
            <FilterGroup heading="Pod size">
              {options.podSizes.map((size) => (
                <FilterPill
                  key={size}
                  testID={`history-pod-${size}`}
                  label={podSizeLabel(size)}
                  selected={filters.podSizes.includes(size)}
                  onPress={() => patch({ podSizes: toggled(filters.podSizes, size) })}
                />
              ))}
            </FilterGroup>
          ) : null}
          {options.systems.length > 0 ? (
            <FilterGroup heading="Game system">
              {options.systems.map((system) => (
                <FilterPill
                  key={system}
                  testID={`history-system-${system}`}
                  label={systemLabel(system)}
                  selected={filters.systems.includes(system)}
                  onPress={() => setFilters((current) => toggleSystem(current, system))}
                />
              ))}
            </FilterGroup>
          ) : null}
          {formats.length > 0 ? (
            <FilterGroup heading="Format">
              {formats.map((format) => (
                <FilterPill
                  key={format.key}
                  testID={`history-format-${format.key}`}
                  label={format.label}
                  selected={filters.formats.includes(format.key)}
                  onPress={() => patch({ formats: toggled(filters.formats, format.key) })}
                />
              ))}
            </FilterGroup>
          ) : null}
        </ScrollView>
        <View style={themed($dialogActions)}>
          <Button
            style={themed($dialogButton)}
            text="Clear all"
            disabled={!anyFilters}
            onPress={() => setFilters(NO_FILTERS)}
          />
          <Button
            style={themed($dialogButton)}
            preset="reversed"
            text={loadingFirstPage || loadingMore ? "Show loaded games" : `Show ${visible.length}`}
            onPress={() => setFiltersOpen(false)}
          />
        </View>
      </DialogCard>
    </Screen>
  )
}

const BADGE_SIZE = 32
const DOT_SIZE = 8

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.md,
})
const $headerBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.sm,
})
const $footerBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingTop: spacing.md,
})
const $status: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.sm,
  borderTopWidth: 1,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
const $statusButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  alignSelf: "flex-start",
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.md,
})
const $chipRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  minHeight: 44,
}
const $filterScroll: ViewStyle = { flex: 1 }
const $chipScroll: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingRight: spacing.md,
})
const $chipWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $dialogBody: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $dayHeading: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginTop: spacing.md,
  marginBottom: spacing.xs,
})
const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $skeletonBadge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: BADGE_SIZE,
  height: BADGE_SIZE,
  borderRadius: BADGE_SIZE / 2,
  backgroundColor: colors.separator,
})
const $skeletonCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  gap: spacing.xs,
})
const $skeletonTitle: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "56%",
  height: 14,
  borderRadius: 3,
  backgroundColor: colors.separator,
})
const $skeletonSubtitle: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "82%",
  height: 10,
  borderRadius: 3,
  backgroundColor: colors.separator,
})
const $skeletonDots: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 38,
  height: DOT_SIZE,
  borderRadius: DOT_SIZE / 2,
  backgroundColor: colors.separator,
})
const $badge: ThemedStyle<ViewStyle> = () => ({
  width: BADGE_SIZE,
  height: BADGE_SIZE,
  borderRadius: BADGE_SIZE / 2,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
})
const $dots: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
})
const $dot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: DOT_SIZE,
  height: DOT_SIZE,
  borderRadius: DOT_SIZE / 2,
  backgroundColor: colors.separator,
})
const $dimmedText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
