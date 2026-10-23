import { useCallback, useRef, useState } from "react"
import { FlatList, TouchableOpacity, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"
import { router, useFocusEffect } from "expo-router"
import { usePaginatedQuery, useQuery } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { statsSourceLabel } from "@/features/decks/deckStatLines"
import {
  chanceRate,
  exactRecord,
  honestRate,
  likelyRange,
  listStats,
  recordText,
  sumSlices,
} from "@/features/stats/deckStatsMath"
import {
  $content,
  $dim,
  $flex,
  $numbers,
  $statsRow,
  DeckComparePrompt,
  listDateSpan,
  listLabel,
  statsDate,
  StatsRow,
  StatsSection,
  type DeckStatsParams,
} from "@/features/stats/DeckStatsParts"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { captureAnalytics } from "@/utils/analytics"

import { api } from "../../convex/_generated/api"
import { deckFormatLabel, deckGame } from "../../convex/lib/deckGames"

type Props = DeckStatsParams & { access: CloudAccess; onBack: () => void }

export function DeckStatsScreen(props: Props) {
  useFocusEffect(
    useCallback(() => {
      captureAnalytics("stats_viewed", { surface: "deck_stats" })
    }, []),
  )
  return (
    <Screen preset="fixed" safeAreaEdges={["top", "bottom"]} contentContainerStyle={$screen}>
      <Header title={props.deckName} leftTx="common:back" onLeftPress={props.onBack} />
      <ConvexQueryBoundary
        resetKey={props.deckKey}
        fallback={({ retry }) => (
          <>
            <AlertNote text={translate("decks:stats.unavailable")} />
            <Button tx="common:retry" onPress={retry} />
          </>
        )}
      >
        <DeckStatsContent {...props} />
      </ConvexQueryBoundary>
    </Screen>
  )
}

function DeckStatsContent({ access, deckKey, deckName, game, format }: Props) {
  const { themed } = useAppTheme()
  const ready = access.ready && Boolean(deckKey)
  const summary = useQuery(api.deckStats.summary, ready ? { deckKey } : "skip")
  const capacity = useQuery(api.decks.capacity, ready ? {} : "skip")
  const [filter, setFilter] = useState<{
    source?: "scryve" | "manual"
    fingerprint?: string | null
    podSize?: number
    wentFirst?: boolean | null
    label: string
  }>()
  const [proPrompt, setProPrompt] = useState(false)
  const games = usePaginatedQuery(
    api.deckStats.games,
    ready
      ? {
          deckKey,
          ...(filter?.source ? { source: filter.source } : {}),
          ...(filter?.fingerprint !== undefined ? { fingerprint: filter.fingerprint } : {}),
          ...(filter?.podSize !== undefined ? { podSize: filter.podSize } : {}),
          ...(filter?.wentFirst !== undefined ? { wentFirst: filter.wentFirst } : {}),
        }
      : "skip",
    { initialNumItems: 20 },
  )
  const listRef = useRef<FlatList<(typeof games.results)[number]>>(null)
  function showGames(next: NonNullable<typeof filter>) {
    setFilter(next)
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }
  if (!ready) return <AlertNote tone="info" text={translate("decks:shelf.reconnect")} />
  if (!summary) return <Text tx="decks:stats.loading" />
  const record = exactRecord(summary.all, "all")
  const rate = honestRate(record)
  const range = likelyRange(record)
  const chance = chanceRate(summary.slices)
  const lists = listStats(summary)
  const pods = [...new Set(summary.slices.map((slice) => slice.podSize))].sort(
    (a, b) => (b ?? 0) - (a ?? 0),
  )
  const manualMatches = summary.all?.manualMatches
  const connectedMatches = summary.all?.connectedMatches
  const sourceRecords = (["scryve", "manual"] as const).map((value) => ({
    value,
    record: exactRecord(summary.all, value),
  }))
  return (
    <>
      <FlatList
        ref={listRef}
        style={$flex}
        contentContainerStyle={themed($content)}
        data={games.results}
        keyExtractor={(result) => result.resultId}
        ListHeaderComponent={
          <>
            <Text
              size="xs"
              style={themed($dim)}
              text={[deckGame(game)?.shortLabel ?? game, deckFormatLabel(game, format)]
                .filter(Boolean)
                .join(" · ")}
            />
            {!filter ? (
              <>
                <View style={$hero}>
                  <Text testID="stats-headline" text={rate.text} style={[$headline, $numbers]} />
                  <Text
                    text={[
                      rate.tooFew ? undefined : recordText(record),
                      translate("decks:stats.gameCount", { count: record.games }),
                      rate.tooFew ? translate("decks:stats.tooFew") : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    style={$numbers}
                  />
                  {manualMatches || connectedMatches ? (
                    <Text
                      size="xs"
                      style={themed($dim)}
                      text={translate("decks:stats.matchesRecord", {
                        record: `${(manualMatches?.wins ?? 0) + (connectedMatches?.wins ?? 0)}-${(manualMatches?.losses ?? 0) + (connectedMatches?.losses ?? 0)}-${(manualMatches?.draws ?? 0) + (connectedMatches?.draws ?? 0)}`,
                      })}
                    />
                  ) : null}
                  {chance && !honestRate(chance.record).tooFew ? (
                    <Text
                      size="xs"
                      style={themed($dim)}
                      tx="decks:stats.chance"
                      txOptions={{
                        rate: honestRate(chance.record).text,
                        podSize: chance.podSize,
                        percent: Math.round(chance.expected * 100),
                      }}
                    />
                  ) : null}
                  {range ? (
                    <Text
                      size="xs"
                      style={themed($dim)}
                      tx="decks:stats.likely"
                      txOptions={range}
                    />
                  ) : null}
                </View>
                {!summary.scannedAll ? (
                  <Text size="xs" style={themed($dim)} tx="decks:stats.limited" />
                ) : null}
                <StatsSection
                  title={translate("decks:stats.lists")}
                  action={
                    lists.filter((list) => list.fingerprint !== null).length < 2 ? undefined : (
                      <TouchableOpacity
                        accessibilityRole="button"
                        testID="stats-compare"
                        disabled={!capacity}
                        style={$actionTouch}
                        onPress={() =>
                          capacity?.premium
                            ? router.push({
                                pathname: "/connected/decks/compare",
                                params: { deckKey, deckName, game, format },
                              })
                            : setProPrompt(true)
                        }
                      >
                        <Text tx="decks:stats.compare" size="sm" style={themed($action)} />
                      </TouchableOpacity>
                    )
                  }
                />
                {lists.map((list) => (
                  <StatsRow
                    key={list.fingerprint ?? "untracked"}
                    testID={`stats-list-${list.fingerprint ?? "untracked"}`}
                    label={listLabel(list)}
                    detail={list.label === "dated" ? undefined : listDateSpan(list)}
                    record={list.record}
                    onPress={() =>
                      showGames({ fingerprint: list.fingerprint, label: listLabel(list) })
                    }
                  />
                ))}
                <StatsSection title={translate("decks:stats.podSize")} />
                {pods.map((podSize) => (
                  <StatsRow
                    key={podSize ?? "unknown"}
                    label={
                      podSize === null
                        ? translate("decks:stats.unknownPod")
                        : translate("decks:stats.players", { count: podSize })
                    }
                    record={sumSlices(summary.slices, "all", { podSize })}
                    onPress={
                      podSize === null
                        ? undefined
                        : () =>
                            showGames({
                              podSize,
                              label: translate("decks:stats.players", { count: podSize }),
                            })
                    }
                  />
                ))}
                {summary.slices.some((slice) => slice.wentFirst !== null) ? (
                  <>
                    <StatsSection title={translate("decks:stats.turnOrder")} />
                    {([true, false, null] as const).map((wentFirst) => {
                      const label = translate(
                        wentFirst === null
                          ? "decks:stats.turnOrderNotTracked"
                          : wentFirst
                            ? "decks:stats.wentFirst"
                            : "decks:stats.notFirst",
                      )
                      return (
                        <StatsRow
                          key={String(wentFirst)}
                          testID={`stats-turn-order-${wentFirst}`}
                          label={label}
                          record={sumSlices(summary.slices, "all", { wentFirst })}
                          onPress={() => showGames({ wentFirst, label })}
                        />
                      )
                    })}
                  </>
                ) : null}
                {sourceRecords.every((row) => row.record.games > 0) ? (
                  <>
                    <StatsSection title={translate("decks:stats.sources")} />
                    {sourceRecords.map(({ value, record: sourceRecord }) => (
                      <StatsRow
                        key={value}
                        testID={`stats-source-${value}`}
                        label={statsSourceLabel(value)}
                        record={sourceRecord}
                        onPress={() => showGames({ source: value, label: statsSourceLabel(value) })}
                      />
                    ))}
                  </>
                ) : null}
              </>
            ) : null}
            <StatsSection
              title={
                filter
                  ? `${translate("decks:stats.games")} · ${filter.label}`
                  : translate("decks:stats.games")
              }
              action={
                filter ? (
                  <Button tx="decks:stats.all" onPress={() => setFilter(undefined)} />
                ) : undefined
              }
            />
          </>
        }
        ListEmptyComponent={
          games.status === "LoadingFirstPage" || games.status === "Exhausted" ? (
            <Text
              size="sm"
              style={themed($dim)}
              tx={
                games.status === "LoadingFirstPage"
                  ? "decks:stats.loading"
                  : "decks:stats.noResults"
              }
            />
          ) : null
        }
        renderItem={({ item }) => {
          const letter = translate(
            item.outcome === "win"
              ? "decks:stats.winLetter"
              : item.outcome === "loss"
                ? "decks:stats.lossLetter"
                : item.outcome === "draw"
                  ? "decks:stats.drawLetter"
                  : "decks:stats.unknownLetter",
          )
          return (
            <TouchableOpacity
              accessibilityRole="button"
              testID={`stats-game-${item.resultId}`}
              disabled={!item.gamePublicId && !item.matchPublicId}
              style={themed($statsRow)}
              onPress={() =>
                item.gamePublicId
                  ? router.push({
                      pathname: "/history/[gameId]",
                      params: {
                        gameId: item.gamePublicId,
                        ...(item.source === "connected" ? { source: "connected" } : {}),
                      },
                    })
                  : item.matchPublicId
                    ? router.push({
                        pathname: "/history/match/[publicId]",
                        params: { publicId: item.matchPublicId },
                      })
                    : undefined
              }
            >
              <Text
                text={letter}
                weight="bold"
                style={themed(
                  item.outcome === "win" ? $win : item.outcome === "loss" ? $loss : $dim,
                )}
              />
              <View style={$flex}>
                <Text
                  size="sm"
                  text={[
                    statsDate(item.finishedAt),
                    item.podSize === null
                      ? translate("decks:stats.unknownPod")
                      : translate("decks:stats.players", { count: item.podSize }),
                  ].join(" · ")}
                />
                <Text
                  size="xs"
                  style={themed($dim)}
                  text={
                    item.opponents.length
                      ? item.opponents
                          .map((opponent) =>
                            [opponent.name, opponent.deckName].filter(Boolean).join(" · "),
                          )
                          .join(", ")
                      : translate("decks:stats.opponentsMissing")
                  }
                />
              </View>
              {item.gamePublicId || item.matchPublicId ? (
                <Text text="›" style={themed($dim)} />
              ) : null}
            </TouchableOpacity>
          )
        }}
        ListFooterComponent={
          games.status === "CanLoadMore" || games.status === "LoadingMore" ? (
            <Button
              testID="stats-more-games"
              tx="decks:stats.moreGames"
              disabled={games.status === "LoadingMore"}
              onPress={() => games.loadMore(20)}
            />
          ) : null
        }
      />
      {proPrompt ? <DeckComparePrompt onClose={() => setProPrompt(false)} /> : null}
    </>
  )
}

const $hero: ViewStyle = { paddingVertical: 24, gap: 4 }
const $headline: TextStyle = { fontSize: 64, lineHeight: 76, fontWeight: "700" }
const $actionTouch: ViewStyle = { minHeight: 44, justifyContent: "center", paddingLeft: 12 }
const $action: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $win: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.success })
const $loss: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })

const $screen: ViewStyle = { flex: 1 }
