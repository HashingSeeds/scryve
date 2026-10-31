import { useCallback, useEffect, useState, type ReactNode } from "react"
import { ScrollView, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"
import { useFocusEffect } from "expo-router"
import { useQuery } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { SectionHeader, TrailingNumber } from "@/components/NumberLane"
import { Screen } from "@/components/Screen"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import type { DeckCard } from "@/features/decks/deckCards"
import { MIN_RATED_GAMES } from "@/features/decks/deckCopy"
import { cardChanges, formatCardChange } from "@/features/stats/cardChanges"
import {
  honestRate,
  likelyRange,
  listStats,
  recordText,
  type DeckSummary,
} from "@/features/stats/deckStatsMath"
import {
  $content,
  $flex,
  $numbers,
  $section,
  $statsRow,
  DeckComparePrompt,
  listLabel,
  type DeckStatsParams,
} from "@/features/stats/DeckStatsParts"
import { fingerprintsToRead, labelLists } from "@/features/stats/listLabels"
import { lookupListSnapshot } from "@/features/stats/listSnapshots"
import { useListCards } from "@/features/stats/useListCards"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { captureAnalytics } from "@/utils/analytics"

import { api } from "../../convex/_generated/api"

type Props = DeckStatsParams & { access: CloudAccess; onBack: () => void }

export function DeckCompareScreen(props: Props) {
  useFocusEffect(
    useCallback(() => {
      captureAnalytics("stats_viewed", { surface: "compare" })
    }, []),
  )
  return (
    <Screen preset="fixed" safeAreaEdges={["top", "bottom"]} contentContainerStyle={$screen}>
      <Header titleTx="decks:stats.compare" leftIcon="back" onLeftPress={props.onBack} />
      <ConvexQueryBoundary
        resetKey={props.deckKey}
        fallback={({ retry }) => (
          <>
            <AlertNote text={translate("decks:stats.unavailable")} />
            <Button tx="common:retry" onPress={retry} />
          </>
        )}
      >
        <CompareAccess {...props} />
      </ConvexQueryBoundary>
    </Screen>
  )
}

function CompareAccess(props: Props) {
  const capacity = useQuery(api.decks.capacity, props.access.ready && props.deckKey ? {} : "skip")
  if (!props.access.ready)
    return <AlertNote tone="info" text={translate("decks:shelf.reconnect")} />
  if (!capacity) return <Text tx="decks:stats.loading" />
  if (!capacity.premium) return <DeckComparePrompt onClose={props.onBack} />
  return <CompareQuery {...props} />
}

function CompareQuery(props: Props) {
  const summary = useQuery(api.deckStats.summary, { deckKey: props.deckKey })
  if (!summary) return <Text tx="decks:stats.loading" />
  return <CompareLists {...props} summary={summary} />
}

function CompareLists({ summary, access, deckKey, deckName }: Props & { summary: DeckSummary }) {
  const { themed } = useAppTheme()
  const listRows = listStats(summary)
  const lists = labelLists(
    listRows,
    useListCards(deckKey, access.ownerId, fingerprintsToRead(listRows)),
  )
  const [leftId, setLeftId] = useState<string | null | undefined>()
  const [rightId, setRightId] = useState<string | null | undefined>()
  const tracked = lists.filter((list) => list.fingerprint !== null)
  const left = lists.find((list) => list.fingerprint === leftId) ?? tracked[0] ?? lists[0]
  const right =
    lists.find((list) => list.fingerprint === rightId) ?? tracked[1] ?? tracked[0] ?? lists[0]
  const leftFingerprint = left?.fingerprint
  const rightFingerprint = right?.fingerprint
  const [cards, setCards] = useState<{
    left?: DeckCard[]
    right?: DeckCard[]
    error?: boolean
    loading: boolean
  }>({ loading: true })
  useEffect(() => {
    let cancelled = false
    setCards({ loading: true })
    Promise.all(
      [leftFingerprint, rightFingerprint].map((fingerprint) =>
        fingerprint && access.ownerId
          ? lookupListSnapshot(deckKey, fingerprint, access.ownerId)
          : undefined,
      ),
    )
      .then(([left, right]) => {
        if (!cancelled) setCards({ left, right, loading: false })
      })
      .catch(() => {
        if (!cancelled) setCards({ error: true, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [deckKey, leftFingerprint, rightFingerprint, access.ownerId])
  const changes = cards.left && cards.right ? cardChanges(cards.left, cards.right) : undefined
  const listOptions = lists.map((list) => ({
    id: optionId(list.fingerprint),
    label: listLabel(list),
  }))
  const pickers = [
    { side: "left", labelTx: "decks:stats.compareList", list: left, choose: setLeftId },
    { side: "right", labelTx: "decks:stats.compareWith", list: right, choose: setRightId },
  ] as const
  return (
    <ScrollView contentContainerStyle={themed($content)}>
      <Text text={deckName} preset="heading" />
      {!summary.scannedAll ? <Text size="xs" tone="dim" tx="decks:stats.limited" /> : null}
      {left && right ? (
        <>
          <View style={themed($pickers)}>
            {pickers.map(({ side, labelTx, list, choose }) => (
              <View key={side} style={$flex}>
                <SelectField
                  testID={`compare-pick-${side}`}
                  label={translate(labelTx)}
                  field="list"
                  options={listOptions}
                  value={optionId(list.fingerprint)}
                  onSelect={(id) => {
                    if (id) choose(fingerprintOf(id))
                  }}
                />
              </View>
            ))}
          </View>
          <View style={themed($statsRow)}>
            <View style={$labelColumn} />
            {[left, right].map((list, index) => (
              <View key={index} style={$valueColumn}>
                <Text size="meta" tone="dim" text={listLabel(list)} style={$columnLabel} />
              </View>
            ))}
          </View>
          <CompareRow
            label={translate("decks:stats.games")}
            left={<Text text={String(left.record.games)} style={$numbers} />}
            right={<Text text={String(right.record.games)} style={$numbers} />}
          />
          <CompareRow
            label={translate("decks:stats.record")}
            left={<Text text={recordText(left.record)} style={$numbers} />}
            right={<Text text={recordText(right.record)} style={$numbers} />}
          />
          <CompareRow
            label={translate("decks:stats.winRate")}
            left={<ComparisonRate record={left.record} />}
            right={<ComparisonRate record={right.record} />}
          />
          {honestRate(left.record).tooFew || honestRate(right.record).tooFew ? (
            <Text
              size="xs"
              tone="dim"
              tx="decks:stats.smallSample"
              txOptions={{ count: MIN_RATED_GAMES }}
            />
          ) : null}
          <SectionHeader
            label={translate("decks:stats.cardChanges")}
            count={changes?.length || undefined}
            style={themed($section)}
          />
          {cards.loading ? (
            <Text size="xs" tone="dim" tx="decks:stats.loading" />
          ) : cards.error ? (
            <AlertNote text={translate("decks:stats.snapshotFailed")} />
          ) : changes ? (
            changes.length ? (
              changes.map((change, index) => (
                <View
                  key={`${change.name}:${index}`}
                  testID={`compare-change-${index}`}
                  accessible
                  accessibilityLabel={formatCardChange(change)}
                  style={themed($changeRow)}
                >
                  <Text
                    size="sm"
                    weight="medium"
                    numberOfLines={1}
                    text={change.name}
                    style={$flex}
                  />
                  <TrailingNumber
                    value={`${change.quantity > 0 ? "+" : "−"}${Math.abs(change.quantity)}`}
                    style={themed(change.quantity > 0 ? $added : $removed)}
                  />
                </View>
              ))
            ) : (
              <Text size="sm" tx="decks:stats.noChanges" />
            )
          ) : (
            <Text size="sm" tone="dim" tx="decks:stats.missingLists" />
          )}
        </>
      ) : (
        <Text tx="decks:stats.noResults" />
      )}
    </ScrollView>
  )
}

function CompareRow({ label, left, right }: { label: string; left: ReactNode; right: ReactNode }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($statsRow)}>
      <Text text={label} size="sm" style={$labelColumn} />
      <View style={$valueColumn}>{left}</View>
      <View style={$valueColumn}>{right}</View>
    </View>
  )
}

function ComparisonRate({ record }: { record: Parameters<typeof likelyRange>[0] }) {
  const range = likelyRange(record)
  const { games, tooFew } = honestRate(record)
  return (
    <View style={tooFew ? $few : undefined}>
      <Text
        text={games ? `${Math.round((record.wins / games) * 100)}%` : recordText(record)}
        style={$numbers}
      />
      {range ? <Text size="xxs" tone="dim" tx="decks:stats.likely" txOptions={range} /> : null}
    </View>
  )
}

const $labelColumn: TextStyle = { flex: 1 }
const $valueColumn: ViewStyle = {
  flex: 1,
  alignItems: "flex-end",
  minHeight: 44,
  justifyContent: "center",
}
const $few: ViewStyle = { opacity: 0.55, alignItems: "flex-end" }
const $columnLabel: TextStyle = { textAlign: "right" }
const $pickers: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  marginTop: spacing.md,
})
const $changeRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 44,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $added: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.success })
const $removed: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })

const UNTRACKED_OPTION = "untracked"
function optionId(fingerprint: string | null) {
  return fingerprint ?? UNTRACKED_OPTION
}
function fingerprintOf(id: string) {
  return id === UNTRACKED_OPTION ? null : id
}

const $screen: ViewStyle = { flex: 1 }
