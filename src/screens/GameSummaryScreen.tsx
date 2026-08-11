import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { EmptyState } from "@/components/EmptyState"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

import type {
  GameSummaryModel,
  SummaryChangeFeed,
  SummaryOutcome,
  SummaryPlayer,
} from "./gameSummary"
import { anyResultRecorded, finishedOnLabel, metaLine, netSwing, standings } from "./gameSummary"

export interface GameSummaryScreenProps {
  model: GameSummaryModel | null
  changes?: SummaryChangeFeed
  loading?: boolean
  onBack: () => void
}

const OUTCOME_BADGES: Record<SummaryOutcome, { label: string; accessibilityLabel: string }> = {
  win: { label: "W", accessibilityLabel: "Winner" },
  loss: { label: "L", accessibilityLabel: "Loss" },
  draw: { label: "D", accessibilityLabel: "Draw" },
  unrecorded: { label: "–", accessibilityLabel: "Result not recorded" },
}

function signed(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta}`
}

function StandingRow({
  player,
  rank,
  startingLife,
  showOutcome,
}: {
  player: SummaryPlayer
  rank: number
  startingLife?: number
  showOutcome: boolean
}) {
  const { theme, themed } = useAppTheme()
  const badge = OUTCOME_BADGES[player.outcome]
  const badgeTone =
    player.outcome === "win"
      ? theme.colors.tint
      : player.outcome === "loss"
        ? theme.colors.error
        : theme.colors.textDim
  const swing = netSwing(player, startingLife)
  const detail = [
    player.username ? `@${player.username}` : undefined,
    player.deckLabel,
    player.deleted ? "deleted player" : undefined,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <View
      style={themed($standingRow)}
      accessibilityLabel={`${showOutcome ? `${badge.accessibilityLabel}, ` : ""}${player.name}, ${player.life} life`}
    >
      <View style={[themed($colorBar), { backgroundColor: player.color }]} />
      {showOutcome ? (
        <View style={[themed($badge), { borderColor: badgeTone }]}>
          <Text weight="bold" size="xxs" text={badge.label} style={{ color: badgeTone }} />
        </View>
      ) : (
        <View style={themed($badge)}>
          <Text size="xxs" style={themed($muted)} text={String(rank)} />
        </View>
      )}
      <View style={$styles.flex1}>
        <Text size="sm" weight="medium" numberOfLines={1} text={player.name} />
        <Text
          size="xxs"
          numberOfLines={1}
          style={themed($muted)}
          text={detail || `Seat ${player.seat}`}
        />
      </View>
      <View style={themed($lifeColumn)}>
        <Text size="lg" weight="bold" text={String(player.life)} />
        {swing === undefined ? null : (
          <Text
            size="xxs"
            style={themed($muted)}
            text={swing === 0 ? "even" : `${signed(swing)} from start`}
          />
        )}
      </View>
    </View>
  )
}

export function GameSummaryScreen({ model, changes, loading, onBack }: GameSummaryScreenProps) {
  const { theme, themed } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const [timelineOpen, setTimelineOpen] = useState(false)

  if (!model) {
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
        <Header titleTx="localGame:gameSummary" leftTx="common:back" onLeftPress={onBack} />
        {loading ? (
          <Text text="Loading final summary…" />
        ) : (
          <EmptyState
            heading="Game not found"
            content="This game summary is no longer available."
          />
        )}
      </Screen>
    )
  }

  const showOutcome = anyResultRecorded(model)
  const rows = standings(model)
  const playersById = new Map(model.players.map((player) => [player.id, player]))
  const timeline = changes?.changes ?? []

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($fixedScreen)}>
      <Header
        title={titleVisible ? translate("localGame:gameSummary") : ""}
        leftTx="common:back"
        onLeftPress={onBack}
      />
      <ScrollView
        style={$styles.flex1}
        contentContainerStyle={themed($screen)}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={themed($block)}>
          <Text
            preset="heading"
            accessibilityRole="header"
            text={model.status === "finished" ? "Finished" : "Abandoned"}
          />
          <Text
            size="xs"
            style={themed($muted)}
            text={[
              finishedOnLabel(model.finishedAt),
              model.source === "local" ? "Local" : "Connected",
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <Text size="xs" style={themed($muted)} text={metaLine(model)} />
          {model.terminalReason ? (
            <Text size="xs" style={themed($muted)} text={model.terminalReason} />
          ) : null}
        </View>

        <Text
          weight="bold"
          size="xs"
          style={themed($sectionHeading)}
          text={showOutcome ? "Result" : "Final life totals"}
        />
        <View>
          {rows.map((player, index) => (
            <StandingRow
              key={player.id}
              player={player}
              rank={index + 1}
              startingLife={model.startingLife}
              showOutcome={showOutcome}
            />
          ))}
        </View>
        {!showOutcome && model.source === "connected" ? (
          <Text size="xxs" style={themed($footnote)} text="No winner was recorded for this game." />
        ) : null}

        <TouchableOpacity
          testID="summary-timeline-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: timelineOpen }}
          accessibilityLabel={`Life changes, ${model.changeCount}`}
          activeOpacity={0.8}
          style={themed($timelineToggle)}
          onPress={() => {
            if (!timelineOpen) changes?.onExpand?.()
            setTimelineOpen((open) => !open)
          }}
          disabled={model.changeCount === 0}
        >
          <Text
            weight="bold"
            size="xs"
            style={themed($toggleHeading)}
            text={`Life changes · ${model.changeCount}`}
          />
          {model.changeCount > 0 ? (
            <Text size="xxs" style={themed($muted)} text={timelineOpen ? "Hide" : "Show"} />
          ) : null}
        </TouchableOpacity>

        {model.changeCount === 0 ? (
          <Text size="xs" style={themed($muted)} text="No life changes were recorded." />
        ) : timelineOpen ? (
          <View style={themed($timeline)}>
            {timeline.map((change) => {
              const player = change.playerId ? playersById.get(change.playerId) : undefined
              return (
                <View key={change.id} style={themed($eventRow)}>
                  <View
                    style={[
                      themed($eventDot),
                      player ? { backgroundColor: player.color } : undefined,
                    ]}
                  />
                  <Text
                    size="xs"
                    numberOfLines={1}
                    style={$styles.flex1}
                    text={player?.name ?? "Player"}
                  />
                  {change.undo ? <Text size="xxs" style={themed($muted)} text="undo" /> : null}
                  <Text
                    size="xs"
                    weight="medium"
                    style={{ color: change.delta < 0 ? theme.colors.error : theme.colors.text }}
                    text={signed(change.delta)}
                  />
                </View>
              )
            })}
            {changes?.canLoadMore ? (
              <Button text="Load older changes" onPress={() => changes.loadMore?.()} />
            ) : null}
            {changes?.olderEventsDropped ? (
              <Text
                size="xxs"
                style={themed($footnote)}
                text="Older events were dropped to save space."
              />
            ) : null}
            <Text
              size="xxs"
              style={themed($footnote)}
              text="Undo stays in the record as a compensating change."
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const BADGE_SIZE = 24
const BAR_WIDTH = 4
const EVENT_DOT = 8

const $fixedScreen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
})
const $block: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxs,
  paddingVertical: spacing.sm,
})
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $footnote: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  marginTop: spacing.xs,
})
const $sectionHeading: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginTop: spacing.md,
  marginBottom: spacing.xs,
})
const $toggleHeading: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textTransform: "uppercase",
  letterSpacing: 1,
})
const $timelineToggle: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  marginTop: spacing.lg,
  paddingVertical: spacing.sm,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
})
const $standingRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $colorBar: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: BAR_WIDTH,
  height: 40,
  borderRadius: spacing.xxs,
})
const $badge: ThemedStyle<ViewStyle> = () => ({
  width: BADGE_SIZE,
  height: BADGE_SIZE,
  borderRadius: BADGE_SIZE / 2,
  borderWidth: 1,
  borderColor: "transparent",
  alignItems: "center",
  justifyContent: "center",
})
const $lifeColumn: ThemedStyle<ViewStyle> = () => ({ alignItems: "flex-end", minWidth: 88 })
const $timeline: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  borderLeftWidth: 2,
  borderLeftColor: colors.separator,
  paddingLeft: spacing.md,
})
const $eventRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
const $eventDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: EVENT_DOT,
  height: EVENT_DOT,
  borderRadius: EVENT_DOT / 2,
  backgroundColor: colors.separator,
})
