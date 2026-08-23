import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { EmptyState } from "@/components/EmptyState"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import {
  PlayerActionsDialog,
  type ReportablePlayer,
} from "@/features/connected/PlayerActionsDialog"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

import type {
  GameSummaryState,
  SummaryOutcome,
  SummaryPlayer,
  SummaryTimelineState,
} from "./gameSummary"
import { anyResultRecorded, finishedOnLabel, metaLine, netSwing, standings } from "./gameSummary"

export interface GameSummaryScreenProps {
  summary: GameSummaryState
  timeline: SummaryTimelineState
  onBack: () => void
  moderation?: { publicId: string; viewerPlayerIds: string[] }
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

function SummaryLoadingShell({ onBack }: { onBack: () => void }) {
  const { themed } = useAppTheme()
  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($fixedScreen)}>
      <Header titleTx="localGame:gameSummary" leftTx="common:back" onLeftPress={onBack} />
      <ScrollView style={$styles.flex1} contentContainerStyle={themed($screen)}>
        <View
          testID="summary-loading-shell"
          accessibilityRole="progressbar"
          accessibilityLabel="Loading game summary"
        >
          <View style={themed($loadingHeader)}>
            <View style={themed($skeletonHeading)} />
            <View style={themed($skeletonMeta)} />
            <View style={themed($skeletonMetaShort)} />
          </View>
          <View style={themed($skeletonSectionHeading)} />
          {Array.from({ length: 2 }).map((_, index) => (
            <View key={index} testID="summary-skeleton-standing" style={themed($standingRow)}>
              <View style={themed($skeletonColorBar)} />
              <View style={themed($skeletonBadge)} />
              <View style={themed($skeletonPlayerCopy)}>
                <View style={themed($skeletonPlayerName)} />
                <View style={themed($skeletonPlayerDetail)} />
              </View>
              <View style={themed($skeletonLife)} />
            </View>
          ))}
          <View style={themed($timelineToggle)}>
            <View style={themed($skeletonTimelineHeading)} />
            <View style={themed($skeletonToggleLabel)} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}

function TimelineLoading() {
  const { themed } = useAppTheme()
  return (
    <View
      testID="summary-timeline-loading"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading life changes"
      style={themed($timeline)}
    >
      {Array.from({ length: 3 }).map((_, index) => (
        <View key={index} style={themed($eventRow)}>
          <View style={themed($eventDot)} />
          <View style={themed($skeletonEventName)} />
          <View style={themed($skeletonEventDelta)} />
        </View>
      ))}
    </View>
  )
}

export function GameSummaryScreen({
  summary,
  timeline,
  onBack,
  moderation,
}: GameSummaryScreenProps) {
  const { theme, themed } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [playerActionsOpen, setPlayerActionsOpen] = useState(false)

  if (summary.status === "loading") return <SummaryLoadingShell onBack={onBack} />

  if (summary.status === "unavailable") {
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
        <Header titleTx="localGame:gameSummary" leftTx="common:back" onLeftPress={onBack} />
        <EmptyState
          heading="Summary unavailable"
          content="Check your connection and try again."
          button="Try again"
          buttonOnPress={summary.retry}
          ButtonProps={{ testID: "summary-retry" }}
        />
      </Screen>
    )
  }

  const model = summary.value
  if (!model) {
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
        <Header titleTx="localGame:gameSummary" leftTx="common:back" onLeftPress={onBack} />
        <EmptyState heading="Game not found" content="This game summary is no longer available." />
      </Screen>
    )
  }

  const showOutcome = anyResultRecorded(model)
  const rows = standings(model)
  const playersById = new Map(model.players.map((player) => [player.id, player]))
  const timelineItems = timeline.status === "ready" ? timeline.items : []
  const reportablePlayers: ReportablePlayer[] = moderation
    ? model.players.map((player) => ({
        playerId: player.id,
        seat: player.seat,
        displayName: player.name,
        color: player.color,
        controlledByMe: moderation.viewerPlayerIds.includes(player.id),
      }))
    : []

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
        {reportablePlayers.some((player) => !player.controlledByMe) ? (
          <Button
            testID="summary-report-player-button"
            text="Report or block a player"
            style={themed($reportAction)}
            onPress={() => setPlayerActionsOpen(true)}
          />
        ) : null}

        <TouchableOpacity
          testID="summary-timeline-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: timelineOpen, disabled: model.changeCount === 0 }}
          accessibilityLabel={`Life changes, ${model.changeCount}`}
          activeOpacity={0.8}
          style={themed($timelineToggle)}
          onPress={() => {
            if (!timelineOpen && timeline.status === "idle") timeline.request()
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
          timeline.status === "loading" || timeline.status === "idle" ? (
            <TimelineLoading />
          ) : timeline.status === "error" ? (
            <View
              testID="summary-timeline-error"
              accessibilityRole="alert"
              style={themed($timelineStatus)}
            >
              <Text size="xs" text="Could not load life changes." />
              <Button
                testID="summary-timeline-retry"
                style={themed($timelineStatusButton)}
                text="Try again"
                onPress={timeline.retry}
              />
            </View>
          ) : timeline.status === "unavailable" ? (
            <Text
              testID="summary-timeline-unavailable"
              accessibilityRole="alert"
              size="xs"
              style={themed($muted)}
              text="Life change details are unavailable."
            />
          ) : (
            <View style={themed($timeline)}>
              {timelineItems.map((change) => {
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
              {timelineItems.length === 0 ? (
                <Text size="xs" style={themed($muted)} text="No life change details were found." />
              ) : null}
              {timeline.nextPage.status !== "exhausted" ? (
                <Button
                  testID="summary-load-more"
                  text={
                    timeline.nextPage.status === "loading"
                      ? "Loading older changes…"
                      : "Load older changes"
                  }
                  disabled={timeline.nextPage.status === "loading"}
                  onPress={
                    timeline.nextPage.status === "available" ? timeline.nextPage.load : undefined
                  }
                />
              ) : null}
              {timeline.olderEventsDropped ? (
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
          )
        ) : null}
      </ScrollView>
      {playerActionsOpen && moderation ? (
        <PlayerActionsDialog
          publicId={moderation.publicId}
          players={reportablePlayers}
          onClose={() => setPlayerActionsOpen(false)}
        />
      ) : null}
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
const $loadingHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.sm,
})
const $skeletonHeading: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "34%",
  height: 28,
  borderRadius: 4,
  backgroundColor: colors.separator,
})
const $skeletonMeta: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "62%",
  height: 12,
  borderRadius: 3,
  backgroundColor: colors.separator,
})
const $skeletonMetaShort: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "48%",
  height: 12,
  borderRadius: 3,
  backgroundColor: colors.separator,
})
const $skeletonSectionHeading: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 96,
  height: 12,
  borderRadius: 3,
  marginTop: spacing.md,
  marginBottom: spacing.xs,
  backgroundColor: colors.separator,
})
const $skeletonColorBar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: BAR_WIDTH,
  height: 40,
  borderRadius: spacing.xxs,
  backgroundColor: colors.separator,
})
const $skeletonBadge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: BADGE_SIZE,
  height: BADGE_SIZE,
  borderRadius: BADGE_SIZE / 2,
  backgroundColor: colors.separator,
})
const $skeletonPlayerCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  gap: spacing.xs,
})
const $skeletonPlayerName: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "52%",
  height: 14,
  borderRadius: 3,
  backgroundColor: colors.separator,
})
const $skeletonPlayerDetail: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "70%",
  height: 10,
  borderRadius: 3,
  backgroundColor: colors.separator,
})
const $skeletonLife: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 54,
  height: 28,
  borderRadius: 4,
  backgroundColor: colors.separator,
})
const $skeletonTimelineHeading: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 128,
  height: 12,
  borderRadius: 3,
  backgroundColor: colors.separator,
})
const $skeletonToggleLabel: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 34,
  height: 10,
  borderRadius: 3,
  backgroundColor: colors.separator,
})
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $reportAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.sm,
  minHeight: 44,
})
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
const $timelineStatus: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.sm,
  borderTopWidth: 1,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
const $timelineStatusButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 40,
  alignSelf: "flex-start",
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.md,
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
const $skeletonEventName: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  maxWidth: 180,
  height: 12,
  borderRadius: 3,
  backgroundColor: colors.separator,
})
const $skeletonEventDelta: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 28,
  height: 12,
  borderRadius: 3,
  backgroundColor: colors.separator,
})
