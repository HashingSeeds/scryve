import { useEffect, useState, type ReactNode } from "react"
import { ScrollView, TouchableOpacity, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"
import { useQuery } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { DialogCard } from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import type { DeckCard } from "@/features/decks/deckCards"
import type { StatsSource } from "@/features/decks/deckStatLines"
import {
  likelyRange,
  listStats,
  recordText,
  type DeckSummary,
} from "@/features/stats/deckStatsMath"
import {
  $content,
  $dim,
  $numbers,
  $statsRow,
  DeckComparePrompt,
  listLabel,
  SourceTabs,
  StatsSection,
  type DeckStatsParams,
} from "@/features/stats/DeckStatsParts"
import { cardChanges, lookupListSnapshot } from "@/features/stats/listSnapshots"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../convex/_generated/api"

type Props = DeckStatsParams & { access: CloudAccess; onBack: () => void; source?: StatsSource }

export function DeckCompareScreen(props: Props) {
  return (
    <Screen preset="fixed" safeAreaEdges={["top", "bottom"]} contentContainerStyle={$screen}>
      <Header titleTx="decks:stats.compare" leftTx="common:back" onLeftPress={props.onBack} />
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

function CompareLists({
  summary,
  access,
  deckKey,
  deckName,
  source: initialSource,
}: Props & { summary: DeckSummary }) {
  const { themed } = useAppTheme()
  const [source, setSource] = useState<StatsSource>(initialSource ?? "scryve")
  const lists = listStats(summary, source)
  const [leftId, setLeftId] = useState<string | null | undefined>()
  const [rightId, setRightId] = useState<string | null | undefined>()
  const [picking, setPicking] = useState<"left" | "right">()
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
  return (
    <ScrollView contentContainerStyle={themed($content)}>
      <Text text={deckName} preset="heading" />
      <SourceTabs source={source} onChange={setSource} />
      {!summary.scannedAll ? (
        <Text size="xs" style={themed($dim)} tx="decks:stats.limited" />
      ) : null}
      {left && right ? (
        <>
          <View style={themed($statsRow)}>
            <View style={$labelColumn} />
            {PICKER_SIDES.map((side) => (
              <TouchableOpacity
                key={side}
                testID={`compare-pick-${side}`}
                accessibilityRole="button"
                style={$valueColumn}
                onPress={() => setPicking(side)}
              >
                <Text size="sm" text={pickerLabel(side === PICKER_SIDES[0] ? left : right)} />
              </TouchableOpacity>
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
          <StatsSection title={translate("decks:stats.cardChanges")} />
          {cards.loading ? (
            <Text size="xs" style={themed($dim)} tx="decks:stats.loading" />
          ) : cards.error ? (
            <AlertNote text={translate("decks:stats.snapshotFailed")} />
          ) : changes ? (
            changes.length ? (
              changes.map((change, index) => (
                <Text
                  key={`${change.name}:${index}`}
                  size="sm"
                  style={themed(change.quantity > 0 ? $added : $removed)}
                  text={`${change.quantity > 0 ? "+" : "−"}${Math.abs(change.quantity)} ${change.name}`}
                />
              ))
            ) : (
              <Text size="sm" tx="decks:stats.noChanges" />
            )
          ) : (
            <Text size="sm" style={themed($dim)} tx="decks:stats.missingLists" />
          )}
        </>
      ) : (
        <Text tx="decks:stats.noResults" />
      )}
      {picking ? (
        <DialogCard
          visible
          onClose={() => setPicking(undefined)}
          backdropAccessibilityLabel={translate("common:close")}
          accessibilityViewIsModal
          dialogTestID="compare-list-picker"
        >
          <Text tx="decks:stats.chooseList" preset="subheading" />
          <ScrollView style={$picker}>
            {lists.map((list) => (
              <TouchableOpacity
                key={list.fingerprint ?? "untracked"}
                accessibilityRole="button"
                testID={`compare-option-${list.fingerprint ?? "untracked"}`}
                style={themed($statsRow)}
                onPress={() => {
                  if (picking === "left") setLeftId(list.fingerprint)
                  else setRightId(list.fingerprint)
                  setPicking(undefined)
                }}
              >
                <Text text={listLabel(list)} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </DialogCard>
      ) : null}
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
  const { themed } = useAppTheme()
  const range = likelyRange(record)
  return (
    <View style={record.games < 10 ? $few : undefined}>
      <Text
        text={
          record.games ? `${Math.round((record.wins / record.games) * 100)}%` : recordText(record)
        }
        style={$numbers}
      />
      {range ? (
        <Text size="xxs" style={themed($dim)} tx="decks:stats.likely" txOptions={range} />
      ) : null}
      {record.games < 10 ? <Text size="xxs" style={themed($dim)} tx="decks:stats.tooFew" /> : null}
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
const $picker: ViewStyle = { maxHeight: 360 }
const $added: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.success })
const $removed: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })

const PICKER_SIDES = ["left", "right"] as const
function pickerLabel(list: ReturnType<typeof listStats>[number]) {
  return `${listLabel(list)} ▾`
}

const $screen: ViewStyle = { flex: 1 }
