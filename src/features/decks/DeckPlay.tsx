import type { ReactNode } from "react"
import { TouchableOpacity, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { SectionHeader, TrailingNumber } from "@/components/NumberLane"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { statsDate } from "@/features/stats/DeckStatsParts"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { recordText, type DeckRecord } from "./deckCopy"
import { allRecord } from "./deckStatLines"
import { swapCount, type MatchSwaps, type SwapPool } from "./matchSideboard"
import { useDeckKeyStats } from "./useDeckKeyStats"
import { api } from "../../../convex/_generated/api"

const RECENT_RESULTS = 5

export type PlayVersion<VersionId extends string = string> = {
  id: VersionId
  label: string
  detail?: string
  record?: DeckRecord
}
type Result = FunctionReturnType<typeof api.deckStats.games>["page"][number]
export type PlayMatch = {
  pool: SwapPool
  swaps: MatchSwaps
  onSideboard?: () => void
  onReset?: () => void
}

export function DeckPlay<VersionId extends string>({
  versions,
  bringingId,
  bringDisabled,
  onBring,
  tracked,
  deckKey,
  ready,
  onStats,
  match,
}: {
  versions?: readonly PlayVersion<VersionId>[]
  bringingId?: VersionId
  bringDisabled?: boolean
  onBring?: (id: VersionId) => void
  tracked: boolean
  deckKey?: string
  ready: boolean
  onStats?: () => void
  match?: PlayMatch
}) {
  const { themed } = useAppTheme()
  return (
    <View testID="deck-play">
      {match ? <ThisMatch {...match} /> : null}
      {versions?.length ? (
        <View accessibilityRole="radiogroup">
          <PlaySection tx="decks:play.bringing" />
          {versions.map((version, index) => {
            const selected = version.id === bringingId
            return (
              <TouchableOpacity
                key={version.id}
                testID={`bring-version-${version.id}`}
                accessibilityRole="radio"
                aria-checked={selected}
                aria-disabled={bringDisabled || !onBring}
                disabled={bringDisabled || !onBring}
                style={[themed($option), index > 0 && themed($divided)]}
                onPress={() => onBring?.(version.id)}
              >
                <View style={[themed($radio), selected && themed($radioOn)]}>
                  {selected ? <View style={themed($radioDot)} /> : null}
                </View>
                <View style={$flex}>
                  <Text weight="medium" text={version.label} numberOfLines={1} />
                  {version.detail ? (
                    <Text size="meta" tone="dim" text={version.detail} numberOfLines={1} />
                  ) : null}
                </View>
                {version.record ? (
                  <TrailingNumber
                    tone={version.record.games ? undefined : "dim"}
                    value={recordText(version.record)}
                  />
                ) : null}
              </TouchableOpacity>
            )
          })}
        </View>
      ) : null}
      {!tracked ? null : deckKey && ready ? (
        <ConvexQueryBoundary
          resetKey={deckKey}
          fallback={() => <Results onStats={onStats} unavailable />}
        >
          <LiveResults deckKey={deckKey} onStats={onStats} />
        </ConvexQueryBoundary>
      ) : (
        <Results results={[]} />
      )}
    </View>
  )
}

function ThisMatch({ pool, swaps, onSideboard, onReset }: PlayMatch) {
  const { themed } = useAppTheme()
  const swapped = swaps.in.length > 0 || swaps.out.length > 0
  return (
    <View testID="deck-play-match">
      <PlaySection
        tx="decks:play.thisMatch"
        action={
          swapped && onSideboard ? (
            <>
              <TextAction
                testID="play-sideboard"
                tx="decks:sideboard.open"
                size="xs"
                onPress={onSideboard}
              />
              {onReset ? (
                <TextAction
                  testID="sideboard-reset"
                  tx="decks:play.reset"
                  size="xs"
                  onPress={onReset}
                />
              ) : null}
            </>
          ) : undefined
        }
      />
      {swapped ? (
        <View style={themed($swaps)}>
          {swaps.in.map((line) => (
            <Text
              key={`in-${line.key}`}
              style={themed($swappedIn)}
              text={translate("decks:play.swappedIn", { count: line.quantity, card: line.name })}
            />
          ))}
          {swaps.out.map((line) => (
            <Text
              key={`out-${line.key}`}
              tone="dim"
              text={translate("decks:play.swappedOut", { count: line.quantity, card: line.name })}
            />
          ))}
          <Text size="xs" tone="dim" tx="decks:play.resetsNote" style={themed($note)} />
        </View>
      ) : (
        <View style={themed($option)}>
          <View style={$flex}>
            <Text weight="medium" tx="decks:play.asBuilt" numberOfLines={1} />
            <Text
              size="meta"
              tone="dim"
              text={translate("decks:play.asBuiltDetail", {
                cards: translate("decks:cardCount", { count: swapCount(pool.main) }),
                side: swapCount(pool.side),
              })}
            />
          </View>
          {onSideboard ? (
            <TextAction testID="play-sideboard" tx="decks:sideboard.open" onPress={onSideboard} />
          ) : null}
        </View>
      )}
    </View>
  )
}

function LiveResults({ deckKey, onStats }: { deckKey: string; onStats?: () => void }) {
  const stats = useDeckKeyStats(deckKey, true)
  const games = useQuery(api.deckStats.games, {
    deckKey,
    paginationOpts: { numItems: RECENT_RESULTS, cursor: null },
  })
  return (
    <Results
      record={stats && allRecord(stats)}
      results={games?.page}
      onStats={onStats}
      loading={!games}
    />
  )
}

function Results({
  record,
  results,
  loading,
  unavailable,
  onStats,
}: {
  record?: DeckRecord
  results?: readonly Result[]
  loading?: boolean
  unavailable?: boolean
  onStats?: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <>
      <PlaySection
        tx="decks:play.results"
        action={
          record?.games ? (
            <>
              {onStats ? (
                <TextAction
                  testID="open-deck-stats"
                  tx="decks:stats.viewStats"
                  size="xs"
                  onPress={onStats}
                />
              ) : null}
              <TrailingNumber
                testID="deck-play-record"
                preset="sectionLabel"
                value={recordText(record)}
              />
            </>
          ) : undefined
        }
      />
      {loading || unavailable || !results?.length ? (
        <Text
          testID="deck-play-no-results"
          size="sm"
          tone="dim"
          style={themed($empty)}
          tx={
            unavailable
              ? "decks:stats.unavailable"
              : loading
                ? "decks:stats.loading"
                : "decks:record.noGames"
          }
        />
      ) : (
        results.map((result) => (
          <View
            key={result.resultId}
            testID={`play-result-${result.resultId}`}
            style={themed($row)}
          >
            <Text
              weight="semiBold"
              style={[$letter, result.outcome === "win" ? themed($win) : undefined]}
              tone={result.outcome === "win" ? undefined : "dim"}
              text={outcomeLetter(result.outcome)}
            />
            <View style={$flex}>
              <Text weight="medium" text={opponentsText(result.opponents)} numberOfLines={1} />
              <Text
                size="meta"
                tone="dim"
                text={[statsDate(result.finishedAt), sourceLabel(result.source)].join(" · ")}
              />
            </View>
          </View>
        ))
      )}
    </>
  )
}

function PlaySection({
  tx,
  action,
}: {
  tx: "decks:play.bringing" | "decks:play.thisMatch" | "decks:play.results"
  action?: ReactNode
}) {
  const { themed } = useAppTheme()
  return <SectionHeader label={translate(tx)} action={action} style={themed($section)} />
}

function outcomeLetter(outcome: Result["outcome"]) {
  return translate(
    outcome === "win"
      ? "decks:stats.winLetter"
      : outcome === "loss"
        ? "decks:stats.lossLetter"
        : outcome === "draw"
          ? "decks:stats.drawLetter"
          : "decks:stats.unknownLetter",
  )
}

export function opponentsText(opponents: Result["opponents"]) {
  const names = opponents.flatMap(
    (opponent) =>
      (opponent.identity?.length
        ? opponent.identity.map((card) => card.name).join(" + ")
        : (opponent.deckName ?? opponent.name)) || [],
  )
  return names.length
    ? translate("decks:play.versus", { opponents: names.join(", ") })
    : translate("decks:stats.opponentsMissing")
}

function sourceLabel(source: Result["source"]) {
  return source === "manual"
    ? translate("decks:stats.manual")
    : source === "nearby"
      ? translate("decks:play.source.nearby")
      : source === "connected"
        ? translate("decks:play.source.online")
        : translate("decks:play.source.local")
}

const $flex: ViewStyle = { flex: 1, minWidth: 0 }
const $letter: TextStyle = { width: 16 }
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  paddingTop: spacing.sm,
})
const $option: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 52,
})
const $divided: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderTopWidth: 1,
  borderTopColor: colors.separator,
})
const $radio: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 20,
  height: 20,
  borderRadius: radius.full,
  borderWidth: 1.5,
  borderColor: colors.border,
  alignItems: "center",
  justifyContent: "center",
})
const $radioOn: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.tint })
const $radioDot: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 10,
  height: 10,
  borderRadius: radius.full,
  backgroundColor: colors.tint,
})
const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 50,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $win: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.success })
const $swaps: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xxxs,
  paddingBottom: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $swappedIn: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $note: ThemedStyle<TextStyle> = ({ spacing }) => ({ paddingTop: spacing.xs })
const $empty: ThemedStyle<ViewStyle> = ({ spacing }) => ({ paddingVertical: spacing.sm })
