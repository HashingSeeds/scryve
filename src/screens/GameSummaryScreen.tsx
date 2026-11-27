import { useEffect, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { EmptyState } from "@/components/EmptyState"
import { Header } from "@/components/Header"
import { MarkArt } from "@/components/PlayerMark"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import {
  PlayerActionsDialog,
  type ReportablePlayer,
} from "@/features/connected/PlayerActionsDialog"
import {
  counterChangeLabel,
  counterValueLabel,
  playSystemRules,
  type PlaySystemId,
} from "@/features/game/playSystems"
import { formatSigned, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { canShareImage } from "@/utils/shareImage"
import { claimSecondGameHelp } from "@/utils/storeReview"
import { useStoreReview } from "@/utils/useStoreReview"

import { RecapShare, RecapStrip } from "./GameRecap"
import type {
  GameSummaryModel,
  GameSummaryState,
  SummaryPlayer,
  SummaryTimelineState,
} from "./gameSummary"
import {
  anyResultRecorded,
  metaLine,
  recapDetail,
  recapHeadline,
  recapOut,
  standings,
} from "./gameSummary"
import { shapeForSeat } from "../../convex/lib/appearance"

export interface GameSummaryScreenProps {
  summary: GameSummaryState
  timeline: SummaryTimelineState
  onBack: () => void
  gameId?: string
  onOpenSupport?: () => void
  moderation?: { publicId: string; viewerPlayerIds: string[] }
}

type CounterSystemId = ReturnType<typeof playSystemRules>["id"]

const MARK_SIZE = 16

function StandingRow({
  model,
  player,
  system,
  showOutcome,
}: {
  model: GameSummaryModel
  player: SummaryPlayer
  system?: PlaySystemId
  showOutcome: boolean
}) {
  const { theme, themed } = useAppTheme()
  const out = recapOut(model, player) !== undefined
  const facts = [
    player.team,
    player.username ? `@${player.username}` : undefined,
    player.deckLabel,
    player.deleted ? translate("play:summary.deletedPlayer") : undefined,
  ]
  const detail = joinParts([recapDetail(model, player), ...facts])
  const spokenDetail = joinParts([out ? recapDetail(model, player) : undefined, ...facts])
  const lives = model.recap?.lives
  const column = model.players.indexOf(player)
  const value = lives
    ? translate("play:summary.recap.lifeLine", {
        from: counterValueLabel(system, lives[0][column]),
        to: counterValueLabel(system, player.life),
      })
    : counterValueLabel(system, player.life)
  const standing = model.logged
    ? joinParts([
        showOutcome ? translate(`play:summary.outcome.${player.outcome}`) : undefined,
        player.name,
      ])
    : showOutcome
      ? translate("play:summary.standingWithOutcome", {
          outcome: translate(`play:summary.outcome.${player.outcome}`),
          name: player.name,
          value,
        })
      : translate("play:summary.standing", { name: player.name, value })
  const rowLabel = spokenDetail
    ? translate("play:summary.standingDetail", { standing, detail: spokenDetail })
    : standing

  return (
    <View style={themed($standingRow)} accessible accessibilityLabel={rowLabel}>
      <View style={$styles.flex1}>
        <View style={themed($nameLine)}>
          <MarkArt
            shape={player.shape ?? shapeForSeat(player.seat)}
            color={player.color}
            size={MARK_SIZE}
          />
          <Text
            size="sm"
            weight="bold"
            numberOfLines={1}
            style={$styles.flex1}
            text={player.name}
          />
        </View>
        {detail ? <Text size="xxs" numberOfLines={1} tone="dim" text={detail} /> : null}
      </View>
      <RecapStrip model={model} player={player} />
      {model.logged ? null : (
        <Text
          size="xl"
          weight="bold"
          style={[themed($life), out ? { color: theme.colors.textDim } : undefined]}
          text={player.life}
        />
      )}
    </View>
  )
}

function SummaryLoadingShell({ onBack }: { onBack: () => void }) {
  const { themed } = useAppTheme()
  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($fixedScreen)}>
      <Header titleTx="play:gameSummary" onBack={onBack} />
      <ScrollView style={$styles.flex1} contentContainerStyle={themed($screen)}>
        <View
          testID="summary-loading-shell"
          accessibilityRole="progressbar"
          accessibilityLabel={translate("play:summary.loading")}
        >
          <View style={themed($loadingHeader)}>
            <View style={themed($skeletonHeading)} />
            <View style={themed($skeletonMeta)} />
            <View style={themed($skeletonMetaShort)} />
          </View>
          {Array.from({ length: 2 }).map((_, index) => (
            <View key={index} testID="summary-skeleton-standing" style={themed($standingRow)}>
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

function TimelineLoading({ systemId }: { systemId: CounterSystemId }) {
  const { themed } = useAppTheme()
  return (
    <View
      testID="summary-timeline-loading"
      accessibilityRole="progressbar"
      accessibilityLabel={translate(`play:summary.timeline.loading.${systemId}`)}
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
  gameId,
  onOpenSupport,
  moderation,
}: GameSummaryScreenProps) {
  const { theme, themed } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [playerActionsOpen, setPlayerActionsOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareFailed, setShareFailed] = useState(false)
  const helpGameId =
    summary.status === "ready" && summary.value?.status === "finished" && gameId
      ? `${summary.value.source}:${gameId}`
      : undefined

  useEffect(() => {
    if (helpGameId) setShowHelp(claimSecondGameHelp(helpGameId))
  }, [helpGameId])

  useStoreReview(
    summary.status === "ready" &&
      summary.value?.status === "finished" &&
      !summary.value.logged &&
      !timelineOpen &&
      !playerActionsOpen,
  )

  if (summary.status === "loading") return <SummaryLoadingShell onBack={onBack} />

  if (summary.status === "unavailable") {
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
        <Header titleTx="play:gameSummary" onBack={onBack} />
        <EmptyState
          headingTx="play:summary.unavailableHeading"
          contentTx="play:summary.unavailableContent"
          buttonTx="common:tryAgain"
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
        <Header titleTx="play:gameSummary" onBack={onBack} />
        <EmptyState
          headingTx="play:summary.notFoundHeading"
          contentTx="play:summary.notFoundContent"
        />
      </Screen>
    )
  }

  const showOutcome = anyResultRecorded(model)
  const shareable = canShareImage && model.status === "finished"
  const systemId = playSystemRules(model.system).id
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
        title={titleVisible ? translate("play:gameSummary") : ""}
        onBack={onBack}
        rightTx={shareable ? "play:summary.recap.share" : undefined}
        onRightPress={
          shareable
            ? () => {
                setShareFailed(false)
                setSharing(true)
              }
            : undefined
        }
      />
      <ScrollView
        style={$styles.flex1}
        contentContainerStyle={themed($screen)}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={themed($block)}>
          <Text preset="heading" accessibilityRole="header" text={recapHeadline(model)} />
          <Text size="xs" tone="dim" text={metaLine(model)} />
          {model.terminalReason ? <Text size="xs" tone="dim" text={model.terminalReason} /> : null}
        </View>

        <View>
          {rows.map((player) => (
            <StandingRow
              key={player.id}
              model={model}
              player={player}
              system={model.system}
              showOutcome={showOutcome}
            />
          ))}
        </View>
        {shareFailed ? (
          <Text
            size="xxs"
            accessibilityRole="alert"
            style={themed($footnote)}
            tx="play:summary.recap.shareFailed"
          />
        ) : null}
        {!showOutcome && model.source === "connected" ? (
          <Text size="xxs" style={themed($footnote)} tx="play:summary.noWinner" />
        ) : null}
        {reportablePlayers.some((player) => !player.controlledByMe) ? (
          <Button
            testID="summary-report-player-button"
            tx="play:summary.reportPlayer"
            style={themed($reportAction)}
            onPress={() => setPlayerActionsOpen(true)}
          />
        ) : null}

        <TouchableOpacity
          testID="summary-timeline-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: timelineOpen, disabled: model.changeCount === 0 }}
          accessibilityLabel={counterChangeLabel(model.system, model.changeCount)}
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
            text={translate(`play:summary.timeline.heading.${systemId}`, {
              changes: model.changeCount,
            })}
          />
          {model.changeCount > 0 ? (
            <Text
              size="xxs"
              tone="dim"
              tx={timelineOpen ? "play:summary.hide" : "play:summary.show"}
            />
          ) : null}
        </TouchableOpacity>

        {model.changeCount === 0 ? (
          <Text
            size="xs"
            tone="dim"
            text={translate(`play:summary.timeline.noChanges.${systemId}`)}
          />
        ) : timelineOpen ? (
          timeline.status === "loading" || timeline.status === "idle" ? (
            <TimelineLoading systemId={systemId} />
          ) : timeline.status === "error" ? (
            <View
              testID="summary-timeline-error"
              accessibilityRole="alert"
              style={themed($timelineStatus)}
            >
              <Text size="xs" text={translate(`play:summary.timeline.loadFailed.${systemId}`)} />
              <Button
                testID="summary-timeline-retry"
                style={themed($timelineStatusButton)}
                tx="common:tryAgain"
                onPress={timeline.retry}
              />
            </View>
          ) : timeline.status === "unavailable" ? (
            <Text
              testID="summary-timeline-unavailable"
              accessibilityRole="alert"
              size="xs"
              tone="dim"
              text={translate(`play:summary.timeline.detailsUnavailable.${systemId}`)}
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
                      text={player?.name ?? translate("play:summary.unknownPlayer")}
                    />
                    {change.undo ? <Text size="xxs" tone="dim" tx="play:summary.undo" /> : null}
                    <Text
                      size="xs"
                      weight="medium"
                      style={{ color: change.delta < 0 ? theme.colors.error : theme.colors.text }}
                      text={formatSigned(change.delta)}
                    />
                  </View>
                )
              })}
              {timelineItems.length === 0 ? (
                <Text
                  size="xs"
                  tone="dim"
                  text={translate(`play:summary.timeline.noDetails.${systemId}`)}
                />
              ) : null}
              {timeline.nextPage.status !== "exhausted" ? (
                <Button
                  testID="summary-load-more"
                  tx={
                    timeline.nextPage.status === "loading"
                      ? "play:summary.loadingOlder"
                      : "play:summary.loadOlder"
                  }
                  disabled={timeline.nextPage.status === "loading"}
                  onPress={
                    timeline.nextPage.status === "available" ? timeline.nextPage.load : undefined
                  }
                />
              ) : null}
              {timeline.olderEventsDropped ? (
                <Text size="xxs" style={themed($footnote)} tx="play:summary.olderDropped" />
              ) : null}
              <Text size="xxs" style={themed($footnote)} tx="play:summary.undoNote" />
            </View>
          )
        ) : null}
      </ScrollView>
      {showHelp && onOpenSupport ? (
        <View testID="second-game-help" style={themed($helpBar)}>
          <Text tx="play:summary.helpPrompt" weight="medium" size="sm" style={$styles.flex1} />
          <Button
            testID="second-game-get-help"
            tx="play:summary.openHelp"
            preset="primary"
            style={themed($helpBarButton)}
            onPress={() => {
              setShowHelp(false)
              onOpenSupport()
            }}
          />
          <Button
            testID="second-game-dismiss"
            tx="play:summary.dismiss"
            style={themed($helpBarButton)}
            onPress={() => setShowHelp(false)}
          />
        </View>
      ) : null}
      {sharing ? (
        <RecapShare
          model={model}
          onDone={(error) => {
            setSharing(false)
            setShareFailed(error !== undefined)
          }}
        />
      ) : null}
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

const EVENT_DOT = 8

const $fixedScreen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.md,
})
const $block: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxs,
  paddingVertical: spacing.sm,
})
const $loadingHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.sm,
})
const $skeletonHeading: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: "34%",
  height: 28,
  borderRadius: radius.sm,
  backgroundColor: colors.separator,
})
const $skeletonMeta: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: "62%",
  height: 12,
  borderRadius: radius.xs,
  backgroundColor: colors.separator,
})
const $skeletonMetaShort: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: "48%",
  height: 12,
  borderRadius: radius.xs,
  backgroundColor: colors.separator,
})
const $skeletonPlayerCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  gap: spacing.xs,
})
const $skeletonPlayerName: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: "52%",
  height: 14,
  borderRadius: radius.xs,
  backgroundColor: colors.separator,
})
const $skeletonPlayerDetail: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: "70%",
  height: 10,
  borderRadius: radius.xs,
  backgroundColor: colors.separator,
})
const $skeletonLife: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 54,
  height: 28,
  borderRadius: radius.sm,
  backgroundColor: colors.separator,
})
const $skeletonTimelineHeading: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 128,
  height: 12,
  borderRadius: radius.xs,
  backgroundColor: colors.separator,
})
const $skeletonToggleLabel: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 34,
  height: 10,
  borderRadius: radius.xs,
  backgroundColor: colors.separator,
})
const $reportAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.sm,
  minHeight: 44,
})
const $helpBar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
  backgroundColor: colors.background,
})
const $helpBarButton: ThemedStyle<ViewStyle> = () => ({ minHeight: 44, paddingVertical: 0 })
const $footnote: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  marginTop: spacing.xs,
})
const $toggleHeading: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textTransform: "uppercase",
  letterSpacing: 1,
})
const $timelineToggle: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  marginTop: spacing.md,
  paddingVertical: spacing.sm,
})
const $standingRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 64,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $nameLine: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
})
const $life: ThemedStyle<TextStyle> = () => ({
  minWidth: 44,
  textAlign: "right",
  fontVariant: ["tabular-nums"],
})
const $timeline: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  borderStartWidth: 2,
  borderStartColor: colors.separator,
  paddingStart: spacing.md,
})
const $timelineStatus: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.sm,
  borderTopWidth: 1,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
const $timelineStatusButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
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
const $skeletonEventName: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  flex: 1,
  maxWidth: 180,
  height: 12,
  borderRadius: radius.xs,
  backgroundColor: colors.separator,
})
const $skeletonEventDelta: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 28,
  height: 12,
  borderRadius: radius.xs,
  backgroundColor: colors.separator,
})
