import { useMemo, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, SectionList, TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { $dialogActions, $dialogButton, DialogCard } from "@/components/DialogCard"
import { EmptyState } from "@/components/EmptyState"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { ConnectedHistoryFeed } from "@/features/connected/ConnectedHistorySource"
import type { LocalGameSummary } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

import type { HistoryEntry, HistoryFilters, HistoryOutcome, HistorySource } from "./historyEntries"
import {
  activeFilterCount,
  DATE_RANGE_LABELS,
  daySections,
  entryDeckNames,
  entryPlayerNames,
  filterHistory,
  filterOptions,
  filtersActive,
  localHistoryEntry,
  NO_FILTERS,
  OUTCOME_LABELS,
  podSizeLabel,
  sortedByRecency,
  tallyOutcomes,
  type DateRange,
} from "./historyEntries"

export interface HistoryScreenProps {
  games: LocalGameSummary[]
  onBack: () => void
  onSelectLocal: (gameId: string) => void
  onSelectConnected: (publicId: string) => void
  connected?: ConnectedHistoryFeed
  initialSource?: HistorySource
}

const MAX_COLOR_DOTS = 4
const DATE_RANGES: DateRange[] = ["any", "7d", "30d", "year"]
const OUTCOMES: HistoryOutcome[] = ["win", "loss", "draw", "unrecorded"]
const SOURCES: { value: HistoryFilters["source"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "local", label: "Local" },
  { value: "connected", label: "Connected" },
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
  const names = entryPlayerNames(entry)
  if (names.length > 0) return names.join(" · ")
  return `${entry.players.length} player${entry.players.length === 1 ? "" : "s"}`
}

function subtitleFor(entry: HistoryEntry) {
  const decks = [...new Set(entryDeckNames(entry))]
  return [
    entry.source === "connected" ? "Connected" : "Local",
    timeLabel(entry.finishedAt),
    entry.winnerNames?.length ? `Won by ${entry.winnerNames.join(" & ")}` : undefined,
    `${entry.eventCount} life change${entry.eventCount === 1 ? "" : "s"}`,
    decks.length > 0 ? decks.join(", ") : undefined,
  ]
    .filter(Boolean)
    .join(" · ")
}

function toggled<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function FilterChip({
  label,
  selected,
  onPress,
  removable,
  testID,
}: {
  label: string
  selected?: boolean
  onPress: () => void
  removable?: boolean
  testID?: string
}) {
  const { themed } = useAppTheme()
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={removable ? `Remove filter ${label}` : label}
      accessibilityState={{ selected: Boolean(selected) }}
      activeOpacity={0.8}
      style={[themed($chip), selected ? themed($chipSelected) : undefined]}
      onPress={onPress}
    >
      <Text
        size="xxs"
        weight={selected ? "medium" : "normal"}
        style={selected ? themed($chipSelectedText) : themed($dimmedText)}
        text={removable ? `${label}  ✕` : label}
      />
    </TouchableOpacity>
  )
}

function ChipGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($chipGroup)}>
      <Text weight="bold" size="xxs" style={themed($groupHeading)} text={heading} />
      <View style={themed($chipWrap)}>{children}</View>
    </View>
  )
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
      accessibilityLabel={`${badge.accessibilityLabel} · ${titleFor(entry)}`}
      activeOpacity={0.8}
      style={themed($row)}
      onPress={onPress}
    >
      <View style={[themed($badge), { borderColor: badgeTone }]}>
        <Text weight="bold" size="sm" text={badge.label} style={{ color: badgeTone }} />
      </View>
      <View style={$styles.flex1}>
        <Text size="sm" weight="medium" numberOfLines={1} text={titleFor(entry)} />
        <Text size="xxs" numberOfLines={1} style={themed($dimmedText)} text={subtitleFor(entry)} />
      </View>
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
    </TouchableOpacity>
  )
}

export function HistoryScreen({
  games,
  onBack,
  onSelectLocal,
  onSelectConnected,
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

  const entries = useMemo(() => {
    const unique = new Map<string, HistoryEntry>()
    for (const entry of [...games.map(localHistoryEntry), ...(connected?.entries ?? [])])
      unique.set(entry.key, entry)
    return sortedByRecency([...unique.values()])
  }, [games, connected?.entries])
  const now = Date.now()
  const visible = filterHistory(entries, filters, now)
  const options = useMemo(() => filterOptions(entries), [entries])
  const record = tallyOutcomes(visible)
  const filterCount = activeFilterCount(filters)
  const anyFilters = filtersActive(filters)
  const loading = entries.length === 0 && Boolean(connected?.loading)

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
    ...filters.formats.map((format) => ({
      key: `format:${format}`,
      label: format,
      clear: () => patch({ formats: filters.formats.filter((value) => value !== format) }),
    })),
  ]

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header title={titleVisible ? "History" : ""} leftTx="common:back" onLeftPress={onBack} />
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
            {connected?.error ? (
              <Text accessibilityRole="alert" size="xs" text={connected.error} />
            ) : null}
            <Text
              size="xs"
              style={themed($dimmedText)}
              text={`${visible.length} game${visible.length === 1 ? "" : "s"} · ${record.wins}W · ${record.losses}L · ${record.draws}D`}
            />
            <View style={themed($chipRow)}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={themed($chipScroll)}
              >
                {SOURCES.map((source) => (
                  <FilterChip
                    key={source.value}
                    testID={`history-source-${source.value}`}
                    label={source.label}
                    selected={filters.source === source.value}
                    onPress={() => patch({ source: source.value })}
                  />
                ))}
              </ScrollView>
              <Button
                testID="history-filters-button"
                style={themed($filtersButton)}
                text={filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
                onPress={() => setFiltersOpen(true)}
              />
            </View>
            {activeChips.length > 0 ? (
              <View style={themed($chipWrap)}>
                {activeChips.map((chip) => (
                  <FilterChip
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
                : onSelectConnected(item.routeId)
            }
          />
        )}
        ListEmptyComponent={
          loading ? null : anyFilters ? (
            <EmptyState
              heading="No games match these filters"
              content="Clear a filter to widen the search."
              button="Clear filters"
              buttonOnPress={() => setFilters(NO_FILTERS)}
            />
          ) : (
            <EmptyState headingTx="localGame:noGames" contentTx="localGame:noGamesContent" />
          )
        }
        ListFooterComponent={
          <View style={themed($footerBlock)}>
            {connected?.canLoadMore ? (
              <>
                <Button text="Load more connected games" onPress={connected.loadMore} />
                {anyFilters ? (
                  <Text
                    size="xxs"
                    style={themed($dimmedText)}
                    text="Filters apply to loaded games — load more to search further back."
                  />
                ) : null}
              </>
            ) : null}
            {connected?.premiumLocked ? (
              <Card
                heading="Unlock full history"
                content="Premium keeps every connected game and its complete event timeline available."
              />
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
          <ChipGroup heading="Date">
            {DATE_RANGES.map((range) => (
              <FilterChip
                key={range}
                testID={`history-date-${range}`}
                label={DATE_RANGE_LABELS[range]}
                selected={filters.dateRange === range}
                onPress={() => patch({ dateRange: range })}
              />
            ))}
          </ChipGroup>
          {options.players.length > 0 ? (
            <ChipGroup heading="Players">
              {options.players.map((name) => (
                <FilterChip
                  key={name}
                  testID={`history-player-${name}`}
                  label={name}
                  selected={filters.players.includes(name)}
                  onPress={() => patch({ players: toggled(filters.players, name) })}
                />
              ))}
            </ChipGroup>
          ) : null}
          {options.decks.length > 0 ? (
            <ChipGroup heading="Decks">
              {options.decks.map((deck) => (
                <FilterChip
                  key={deck}
                  testID={`history-deck-${deck}`}
                  label={deck}
                  selected={filters.decks.includes(deck)}
                  onPress={() => patch({ decks: toggled(filters.decks, deck) })}
                />
              ))}
            </ChipGroup>
          ) : null}
          <ChipGroup heading="Result">
            {OUTCOMES.map((outcome) => (
              <FilterChip
                key={outcome}
                testID={`history-outcome-${outcome}`}
                label={OUTCOME_LABELS[outcome]}
                selected={filters.outcomes.includes(outcome)}
                onPress={() => patch({ outcomes: toggled(filters.outcomes, outcome) })}
              />
            ))}
          </ChipGroup>
          {options.podSizes.length > 0 ? (
            <ChipGroup heading="Pod size">
              {options.podSizes.map((size) => (
                <FilterChip
                  key={size}
                  testID={`history-pod-${size}`}
                  label={podSizeLabel(size)}
                  selected={filters.podSizes.includes(size)}
                  onPress={() => patch({ podSizes: toggled(filters.podSizes, size) })}
                />
              ))}
            </ChipGroup>
          ) : null}
          {options.formats.length > 0 ? (
            <ChipGroup heading="Ruleset / starting life">
              {options.formats.map((format) => (
                <FilterChip
                  key={format}
                  testID={`history-format-${format}`}
                  label={format}
                  selected={filters.formats.includes(format)}
                  onPress={() => patch({ formats: toggled(filters.formats, format) })}
                />
              ))}
            </ChipGroup>
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
            text={`Show ${visible.length}`}
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
  paddingBottom: spacing.xl,
})
const $headerBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.sm,
})
const $footerBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingTop: spacing.md,
})
const $chipRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
const $chipScroll: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $chipWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $chipGroup: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $groupHeading: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textTransform: "uppercase",
  letterSpacing: 1,
})
const $chip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.sm,
  borderRadius: spacing.lg,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $chipSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.tint,
  backgroundColor: colors.tint,
})
const $chipSelectedText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})
const $filtersButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 36,
  paddingHorizontal: spacing.sm,
  paddingVertical: 0,
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
