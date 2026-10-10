import { memo, useEffect, useRef, useState } from "react"
import type {
  LayoutChangeEvent,
  LayoutRectangle,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native"
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native"
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

import { counterValueLabel, type PlaySystemId } from "@/features/game/playSystems"
import type { LifeDelta } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"
import { useElapsedSince } from "@/utils/useElapsedSince"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { CommanderDamageBoard, type CommanderDamageBoardProps } from "./CommanderDamageBoard"
import {
  CommanderDamageCardControls,
  type CommanderAttacker,
  type CommanderDamageCardMode,
} from "./CommanderDamageCardControls"
import { CommanderStrip } from "./CommanderStrip"
import { CounterChips, type SeatTable } from "./CounterChips"
import { LifeControls, useRecentDelta } from "./LifeControls"
import { LifeEditor } from "./LifeEditor"
import {
  COMPACT_LIFE_FONT_SIZE,
  COMPACT_LIFE_TARGET_SIZE,
  COMPACT_PLAYER_MARK_SIZE,
  getLifeFontSizeThatFits,
  getLifeLineHeight,
  getLifeTargetTextSpace,
  lifeCardContentInsetStyle,
  LIFE_FONT_SIZE,
  LIFE_MAX_FONT_SCALE,
  LIFE_TARGET_SIZE,
  PLAYER_MARK_MUTED_OPACITY,
  PLAYER_MARK_SIZE,
  TUCKS_INTO_SCREEN_CORNERS,
  cornerOffset,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardEdge,
  type LifeCardScreenEdges,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "./playerCardTypes"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

const COMMANDER_OVERVIEW_MS = 220

export type { LifeCardContentRotation } from "./playerCardTypes"

export type LifeCardCommanderDamage = Omit<
  CommanderDamageBoardProps,
  "contentRotation" | "compact" | "foreground" | "seatNumber"
> & {
  inspection?: { open: boolean; onToggle: () => void }
  attackerName?: string
  attacker?: CommanderAttacker
  stagedAgainstOwner?: number
  onStage?: (step: number) => void
  armBar?: { stagedTargets: number; onSend: () => void; onCancel: () => void }
  /**
   * Claims awaiting this seat's decision, shown as bubbles under the board so the
   * life total stays visible while the defender decides.
   */
  pendingClaims?: readonly {
    claimId: string
    attackerName: string
    delta: number
    onConfirm: () => void
    onDecline: () => void
  }[]
}

export interface LifeCardProps {
  playerName: string
  seatNumber: number
  shape?: PlayerMarkShape
  life: number
  color: string
  compact?: boolean
  boardRotation?: number
  contentRotation?: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  screenEdges?: LifeCardScreenEdges
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
  lifeFontSizeFor?: (digits: number) => number | undefined
  system?: PlaySystemId
  lifeStep?: number
  disabled?: boolean
  ownership?: "owned" | "unowned" | "disabled"
  staleSince?: number
  commanderDamage?: LifeCardCommanderDamage
  /** why: what knocked the seat out, such as "commander damage" or "poison"; the card dims and its label says why. */
  eliminated?: string
  seatTable?: SeatTable
  onChange: (delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
}

function UpdatedAgo({ since, color }: { since: number; color: string }) {
  const { themed } = useAppTheme()
  const elapsed = useElapsedSince(since)
  return (
    <Text
      text={`Updated ${elapsed} ago`}
      weight="bold"
      size="xxs"
      maxFontSizeMultiplier={1.3}
      numberOfLines={1}
      style={[themed($status), { color }]}
    />
  )
}

/** why: the board re-renders on every sync step and server update; a seat only needs to when its own props change. PlayerGrid rebuilds plain props (insets, styles, commander data) each render, so they compare by content, and it keeps every callback's identity stable. */
export const LifeCard = memo(function LifeCard({
  playerName,
  seatNumber,
  shape,
  life,
  color,
  compact,
  boardRotation = 0,
  contentRotation = 0,
  contentInsets,
  screenEdges,
  menuCorner,
  menuEdgeCenter,
  lifeFontSizeFor,
  system,
  lifeStep,
  disabled,
  ownership,
  staleSince,
  commanderDamage,
  eliminated,
  seatTable,
  onChange,
  style,
}: LifeCardProps) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const localCommander = !!commanderDamage?.inspection
  const foreground = accessibleForeground(color)
  const reducedMotion = useReducedMotion()
  const commanderOverviewDuration = motionDuration(reducedMotion, COMMANDER_OVERVIEW_MS)
  const frozen = disabled || !!eliminated
  const inspectDisabled = disabled && ownership !== "unowned"
  const contentRotationStyle: TextStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined
  const displayName = playerName.trim() || "unnamed player"
  const identity = `Seat ${seatNumber}, ${displayName}`
  const markSize = compact ? COMPACT_PLAYER_MARK_SIZE : PLAYER_MARK_SIZE
  const lifeTargetSize = compact ? COMPACT_LIFE_TARGET_SIZE : LIFE_TARGET_SIZE
  // why: a press shows its change right away; the change itself is recorded on release.
  const [preview, setPreview] = useState(0)
  const shownLife = life + preview
  const shownDigits = String(shownLife).length
  const resolvedLifeFontSize =
    lifeFontSizeFor?.(shownDigits) ??
    Math.min(
      compact ? COMPACT_LIFE_FONT_SIZE : LIFE_FONT_SIZE,
      getLifeFontSizeThatFits({
        availableWidth: getLifeTargetTextSpace(lifeTargetSize),
        availableHeight: getLifeTargetTextSpace(lifeTargetSize),
        digits: shownDigits,
        fontScale: 1,
      }),
    )
  const cardPadding = compact ? spacing.xxs : spacing.xs
  const safeContentStyle = lifeCardContentInsetStyle(contentInsets)
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 })
  const [legacyOverviewOpen, setCommanderOverviewOpen] = useState(false)
  const commanderOverviewOpen = commanderDamage?.inspection?.open ?? legacyOverviewOpen
  const [overviewVisible, setOverviewVisible] = useState(commanderOverviewOpen)
  const [stripBounds, setStripBounds] = useState<LayoutRectangle | null>(null)
  const [boardBounds, setBoardBounds] = useState<LayoutRectangle | null>(null)
  const overviewProgress = useSharedValue(commanderOverviewOpen ? 1 : 0)
  useEffect(() => {
    if (!localCommander) return
    if (commanderOverviewOpen) setOverviewVisible(true)
    if (commanderOverviewDuration === 0) {
      overviewProgress.value = commanderOverviewOpen ? 1 : 0
      setOverviewVisible(commanderOverviewOpen)
      return
    }
    overviewProgress.value = withTiming(
      commanderOverviewOpen ? 1 : 0,
      {
        duration: commanderOverviewDuration,
      },
      (finished) => {
        if (finished && !commanderOverviewOpen) runOnJS(setOverviewVisible)(false)
      },
    )
  }, [localCommander, commanderOverviewOpen, commanderOverviewDuration, overviewProgress])
  const localOverviewVisible = localCommander && (commanderOverviewOpen || overviewVisible)
  const headerEdge = { 0: "top", 90: "right", [-90]: "left", 180: "bottom" } as const
  const headerPadding = {
    0: "paddingTop",
    90: "paddingRight",
    [-90]: "paddingLeft",
    180: "paddingBottom",
  } as const
  const footerPadding = {
    0: "paddingBottom",
    90: "paddingLeft",
    [-90]: "paddingRight",
    180: "paddingTop",
  } as const
  const overviewInsets = {
    ...safeContentStyle,
    [headerPadding[contentRotation]]: (contentInsets?.[headerEdge[contentRotation]] ?? 0) + 56,
    [footerPadding[contentRotation]]: 0,
  }
  const boardInsets = localCommander ? overviewInsets : safeContentStyle
  const lifeOffset = Math.max(
    (Math.abs(contentRotation) === 90 ? cardSize.width : cardSize.height) / 2 -
      (contentInsets?.[headerEdge[contentRotation]] ?? 0) -
      cardPadding -
      24,
    0,
  )
  const overviewLifeStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          contentRotation === 90
            ? lifeOffset * overviewProgress.value
            : contentRotation === -90
              ? -lifeOffset * overviewProgress.value
              : 0,
      },
      {
        translateY:
          contentRotation === 0
            ? -lifeOffset * overviewProgress.value
            : contentRotation === 180
              ? lifeOffset * overviewProgress.value
              : 0,
      },
      { scale: 1 + (32 / resolvedLifeFontSize - 1) * overviewProgress.value },
    ],
  }))
  const overviewCloseStyle = useAnimatedStyle(() => ({ opacity: overviewProgress.value }))
  const boardStyle = useAnimatedStyle(() => ({
    opacity: boardBounds ? 1 : 0,
    transform: [
      {
        translateX:
          stripBounds && boardBounds
            ? (stripBounds.x + stripBounds.width / 2 - boardBounds.x - boardBounds.width / 2) *
              (1 - overviewProgress.value)
            : 0,
      },
      {
        translateY:
          stripBounds && boardBounds
            ? (stripBounds.y + stripBounds.height / 2 - boardBounds.y - boardBounds.height / 2) *
              (1 - overviewProgress.value)
            : 0,
      },
      {
        scaleX:
          stripBounds && boardBounds && boardBounds.width > 0
            ? 1 + (stripBounds.width / boardBounds.width - 1) * (1 - overviewProgress.value)
            : 1,
      },
      {
        scaleY:
          stripBounds && boardBounds && boardBounds.height > 0
            ? 1 + (stripBounds.height / boardBounds.height - 1) * (1 - overviewProgress.value)
            : 1,
      },
    ],
  }))
  const markStyle = getPlayerMarkCorner(
    contentRotation,
    cardPadding,
    TUCKS_INTO_SCREEN_CORNERS ? undefined : contentInsets,
  )
  const commanderOverviewEntering =
    reducedMotion === false ? FadeIn.duration(commanderOverviewDuration) : undefined
  const commanderOverviewExiting =
    reducedMotion === false ? FadeOut.duration(commanderOverviewDuration) : undefined

  const [editorOpen, setEditorOpen] = useState(false)
  // why: while a counter sheet covers the card, the card's own controls leave touch, keyboard focus, and the accessibility tree; accessibilityViewIsModal only isolates on iOS.
  const [tableSheetOpen, setTableSheetOpen] = useState(false)
  const recentDelta = useRecentDelta(life)
  const previousLife = useRef(life)
  useEffect(() => {
    if (previousLife.current === life) return
    previousLife.current = life
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(
        `${identity}, now ${counterValueLabel(system, life)}`,
      )
    }
  }, [identity, life, system])

  const ownershipLabel =
    ownership === "owned"
      ? "Your seat"
      : ownership === "unowned"
        ? "View only"
        : ownership === "disabled"
          ? "Controls unavailable"
          : undefined
  const pendingClaim = commanderDamage?.pendingClaims?.[0]
  const armedCommanderId = commanderDamage?.armedPlayerId
  const commanderCardMode: CommanderDamageCardMode | undefined = pendingClaim
    ? {
        kind: "claim",
        claimId: pendingClaim.claimId,
        attackerName: pendingClaim.attackerName,
        damage: Math.abs(pendingClaim.delta),
        additionalClaims: (commanderDamage?.pendingClaims?.length ?? 1) - 1,
        onConfirm: pendingClaim.onConfirm,
        onDecline: pendingClaim.onDecline,
      }
    : commanderDamage && armedCommanderId === commanderDamage.ownerPlayerId
      ? {
          kind: "source",
          playerName: displayName,
          submitLabel: commanderDamage.armBar ? "Send" : "Done",
          mark: { color, shape, seatNumber },
          submitDisabled: commanderDamage.armBar?.stagedTargets === 0,
          onSubmit: commanderDamage.armBar?.onSend ?? commanderDamage.onPressSword ?? (() => {}),
          onCancel: commanderDamage.armBar?.onCancel,
        }
      : commanderDamage && armedCommanderId
        ? {
            kind: "target",
            attackerName: commanderDamage.attackerName ?? "Commander",
            attacker: commanderDamage.attacker,
            total:
              (commanderDamage.incoming[armedCommanderId] ?? 0) +
              (commanderDamage.stagedAgainstOwner ?? 0),
            onChange: (step) => commanderDamage.onStage?.(step),
          }
        : undefined
  const statusEdge =
    contentRotation === 180
      ? "top"
      : contentRotation === 90
        ? "left"
        : contentRotation === -90
          ? "right"
          : "bottom"
  const statusEdgeInset = contentInsets?.[statusEdge] ?? 0
  const statusEdgeLength = Math.abs(contentRotation) === 90 ? cardSize.width : cardSize.height
  const defaultStatusOffset = lifeTargetSize / 2 + (compact ? spacing.xxxs : spacing.xxs)
  const availableStatusOffset =
    statusEdgeLength / 2 -
    statusEdgeInset -
    cardPadding -
    21 -
    (staleSince !== undefined ? spacing.xxxs + 18 : 0)
  const nameInCorner = !!commanderDamage?.inspection
  // why: a sideways status layer swaps its sides before turning, so it never pokes past the card. On web an overflowing layer makes the hidden-overflow card scrollable, and focusing a chip by keyboard would shift the whole card.
  const contentWidth = cardSize.width - cardPadding * 2
  const contentHeight = cardSize.height - cardPadding * 2
  const statusLayerBounds: ViewStyle | undefined =
    Math.abs(contentRotation) === 90 && contentWidth > 0 && contentHeight > 0
      ? {
          width: contentHeight,
          height: contentWidth,
          left: (contentWidth - contentHeight) / 2,
          top: (contentHeight - contentWidth) / 2,
          right: undefined,
          bottom: undefined,
        }
      : undefined
  const showStatus =
    !nameInCorner && (statusEdgeLength === 0 || statusEdgeInset === 0 || availableStatusOffset >= 0)
  const statusTopOffset =
    statusEdgeInset > 0 && statusEdgeLength > 0
      ? Math.min(defaultStatusOffset, availableStatusOffset)
      : defaultStatusOffset

  const cornerStatus = nameInCorner
    ? cornerStatusPlacement({
        rotation: contentRotation,
        cardSize,
        gap: compact ? spacing.sm : spacing.md,
        insets: contentInsets,
        screenEdges,
      })
    : undefined

  useEffect(() => {
    if (frozen) {
      setEditorOpen(false)
    }
  }, [frozen])

  function measureCard(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout
    setCardSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    )
  }

  function openCommanderOverview() {
    setCommanderOverviewOpen(true)
  }

  function closeCommanderOverview() {
    setCommanderOverviewOpen(false)
  }

  function beginCommanderAssignment() {
    setCommanderOverviewOpen(false)
    commanderDamage?.onPressSword?.()
  }

  return (
    <View
      testID={`life-card-seat-${seatNumber}`}
      accessibilityLabel={`${identity}${ownershipLabel ? `, ${ownershipLabel}` : ""}${
        eliminated ? `, out: ${eliminated}` : ""
      }`}
      onLayout={measureCard}
      style={[
        themed($card),
        compact && themed($compactCard),
        ownership === "disabled" && themed($disabledCard),
        staleSince !== undefined && themed($staleCard),
        { backgroundColor: color },
        style,
      ]}
    >
      {localCommander ? null : commanderDamage && !commanderCardMode ? (
        <View
          pointerEvents="none"
          style={[
            themed($mark),
            markStyle,
            { width: markSize, height: markSize },
            commanderOverviewOpen && themed($mutedContent),
          ]}
        >
          <PlayerMark
            seatNumber={seatNumber}
            shape={shape}
            color={foreground}
            rotation={contentRotation}
            spinning={ownership === "owned"}
            insetSwordColor={color}
            size={markSize}
          />
        </View>
      ) : (
        <PlayerMark
          seatNumber={seatNumber}
          shape={shape}
          color={foreground}
          rotation={contentRotation}
          spinning={ownership === "owned"}
          size={markSize}
          style={[themed($mark), markStyle, commanderCardMode && themed($mutedContent)]}
        />
      )}
      <View
        pointerEvents={commanderOverviewOpen || commanderCardMode ? "none" : "box-none"}
        accessibilityElementsHidden={
          (!localCommander && commanderOverviewOpen) || !!commanderCardMode || tableSheetOpen
        }
        importantForAccessibility={
          (!localCommander && commanderOverviewOpen) || commanderCardMode || tableSheetOpen
            ? "no-hide-descendants"
            : "auto"
        }
        style={[
          themed($content),
          (commanderCardMode || (!localCommander && commanderOverviewOpen)) &&
            themed($mutedContent),
          localOverviewVisible && $overviewReadout,
        ]}
      >
        <Animated.View
          testID={`life-readout-seat-${seatNumber}`}
          pointerEvents="none"
          style={[themed($readout), localCommander && overviewLifeStyle]}
        >
          <Text
            testID={`life-total-seat-${seatNumber}`}
            text={String(shownLife)}
            accessible
            accessibilityLabel={`${identity}, ${counterValueLabel(system, life)}`}
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={LIFE_MAX_FONT_SCALE}
            numberOfLines={1}
            style={[
              themed($life),
              {
                fontSize: resolvedLifeFontSize,
                lineHeight: getLifeLineHeight(resolvedLifeFontSize),
              },
              contentRotationStyle,
              { color: foreground },
            ]}
          />
          <View
            testID={`life-status-layer-seat-${seatNumber}`}
            pointerEvents="none"
            style={[
              themed($statusLayer),
              statusLayerBounds,
              { transform: [{ rotate: `${contentRotation}deg` }] },
            ]}
          >
            {showStatus ? (
              <View
                testID={`life-status-seat-${seatNumber}`}
                style={[
                  themed(compact ? $compactStatusPosition : $statusPosition),
                  { marginTop: statusTopOffset },
                ]}
              >
                <Text
                  testID={`player-name-seat-${seatNumber}`}
                  text={displayName}
                  accessible={false}
                  size="xs"
                  weight="medium"
                  maxFontSizeMultiplier={1.3}
                  numberOfLines={1}
                  style={[themed($name), { color: foreground }]}
                />
                {staleSince !== undefined ? (
                  <UpdatedAgo since={staleSince} color={foreground} />
                ) : null}
              </View>
            ) : null}
          </View>
        </Animated.View>
      </View>
      {eliminated ? (
        <View
          testID={`life-eliminated-seat-${seatNumber}`}
          pointerEvents="none"
          style={themed($eliminated)}
        />
      ) : null}
      {commanderDamage && (commanderOverviewOpen || localOverviewVisible) && !commanderCardMode ? (
        <Animated.View
          testID={`commander-overview-seat-${seatNumber}`}
          entering={localCommander ? undefined : commanderOverviewEntering}
          exiting={localCommander ? undefined : commanderOverviewExiting}
          accessibilityViewIsModal={!localCommander}
          style={[
            themed($commanderOverview),
            compact && themed($compactCommanderOverview),
            { backgroundColor: color },
          ]}
        >
          <View
            testID={`commander-overview-content-seat-${seatNumber}`}
            style={[themed($commanderOverviewContent), boardInsets]}
          >
            <Animated.View
              testID={`commander-overview-board-seat-${seatNumber}`}
              onLayout={(event) => setBoardBounds(event.nativeEvent.layout)}
              style={localCommander ? boardStyle : undefined}
            >
              <CommanderDamageBoard
                ownerPlayerId={commanderDamage.ownerPlayerId}
                players={commanderDamage.players}
                seats={commanderDamage.seats}
                rows={commanderDamage.rows}
                columns={commanderDamage.columns}
                incoming={commanderDamage.incoming}
                onPressSword={beginCommanderAssignment}
                seatNumber={seatNumber}
                contentRotation={contentRotation}
                compact={compact}
                expanded
                foreground={foreground}
                style={themed($expandedCommanderBoard)}
                maxSize={{
                  width: Math.max(
                    cardSize.width -
                      cardPadding * 2 -
                      boardInsets.paddingLeft -
                      boardInsets.paddingRight,
                    0,
                  ),
                  height: Math.max(
                    cardSize.height -
                      cardPadding * 2 -
                      boardInsets.paddingTop -
                      boardInsets.paddingBottom,
                    0,
                  ),
                }}
              />
            </Animated.View>
          </View>
          {!localCommander ? (
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              <BoardPressable
                testID={`commander-overview-close-seat-${seatNumber}`}
                accessibilityRole="button"
                accessibilityLabel={`Close commander damage for ${identity}`}
                onPress={closeCommanderOverview}
                hitSlop={12}
                style={[themed($overviewClose), markStyle, { width: markSize, height: markSize }]}
              >
                <PlayerMark
                  seatNumber={seatNumber}
                  shape={shape}
                  color={foreground}
                  rotation={contentRotation}
                  insetSwordColor={color}
                  closeIcon
                  size={markSize}
                />
              </BoardPressable>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
      {commanderCardMode ? (
        <CommanderDamageCardControls
          seatNumber={seatNumber}
          foreground={foreground}
          contentRotation={contentRotation}
          contentInsets={contentInsets}
          compact={compact}
          mode={commanderCardMode}
          life={localCommander ? life : undefined}
        />
      ) : !commanderOverviewOpen &&
        !localOverviewVisible &&
        !tableSheetOpen &&
        ownership !== "unowned" ? (
        <LifeControls
          playerName={displayName}
          seatNumber={seatNumber}
          disabled={frozen}
          contrastCheckedForeground={foreground}
          compact={compact}
          contentRotation={contentRotation}
          system={system}
          lifeStep={lifeStep}
          recentDelta={recentDelta}
          pendingDelta={preview}
          onChange={onChange}
          onPreview={setPreview}
          onLongChange={() => setEditorOpen(true)}
        />
      ) : null}
      {commanderDamage &&
      !localCommander &&
      !commanderCardMode &&
      !commanderOverviewOpen &&
      !tableSheetOpen ? (
        <BoardPressable
          testID={`commander-mark-seat-${seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel={`Show commander damage for ${identity}`}
          accessibilityHint="Expands the commander damage grid"
          accessibilityState={{ expanded: false }}
          hitSlop={12}
          onPress={openCommanderOverview}
          style={({ pressed }) => [
            themed($markHitTarget),
            markStyle,
            { width: markSize, height: markSize, opacity: pressed ? 0.72 : 1 },
          ]}
        />
      ) : null}
      {commanderDamage?.inspection && !commanderCardMode && !tableSheetOpen ? (
        <CommanderStrip
          seatNumber={seatNumber}
          identity={identity}
          ownerPlayerId={commanderDamage.ownerPlayerId}
          players={commanderDamage.players ?? []}
          seats={commanderDamage.seats}
          incoming={commanderDamage.incoming}
          foreground={foreground}
          contentRotation={contentRotation}
          contentInsets={contentInsets}
          screenEdges={screenEdges}
          compact={compact}
          open={localOverviewVisible}
          inspectDisabled={inspectDisabled}
          closeIconStyle={overviewCloseStyle}
          onToggle={commanderDamage.inspection.onToggle}
          onBoundsChange={setStripBounds}
        />
      ) : null}
      {cornerStatus && !commanderCardMode && !tableSheetOpen ? (
        <View
          testID={`life-corner-layer-seat-${seatNumber}`}
          pointerEvents="box-none"
          style={[
            themed($cornerLayer),
            cornerStatus.layer,
            { transform: [{ rotate: `${contentRotation}deg` }] },
          ]}
        >
          <BoardPressable
            testID={`commander-mark-seat-${seatNumber}`}
            accessibilityRole="button"
            accessibilityLabel={`Assign commander damage from ${identity}${
              staleSince !== undefined ? ", out of date" : ""
            }`}
            accessibilityState={{ disabled: !!disabled }}
            disabled={disabled}
            hitSlop={8}
            onPress={beginCommanderAssignment}
            style={({ pressed }) => [
              themed($cornerIdentity),
              cornerStatus.position,
              pressed && { opacity: 0.72 },
            ]}
          >
            <PlayerMark
              seatNumber={seatNumber}
              shape={shape}
              color={foreground}
              insetSwordColor={color}
              size={compact ? 22 : 26}
            />
            <View testID={`life-status-seat-${seatNumber}`} style={themed($cornerText)}>
              <Text
                testID={`player-name-seat-${seatNumber}`}
                text={displayName}
                accessible={false}
                size="xs"
                weight="medium"
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={{ color: foreground }}
              />
              {staleSince !== undefined ? (
                <UpdatedAgo since={staleSince} color={foreground} />
              ) : null}
            </View>
          </BoardPressable>
        </View>
      ) : null}
      {seatTable &&
      !commanderCardMode &&
      !commanderOverviewOpen &&
      !localOverviewVisible &&
      !editorOpen ? (
        <CounterChips
          seat={seatTable}
          seatNumber={seatNumber}
          identity={identity}
          color={color}
          foreground={foreground}
          compact={compact}
          contentRotation={contentRotation}
          contentInsets={contentInsets}
          menuEdgeCenter={menuEdgeCenter}
          cardSize={cardSize}
          onSheetOpenChange={setTableSheetOpen}
        />
      ) : null}
      {editorOpen ? (
        <LifeEditor
          seatNumber={seatNumber}
          playerName={displayName}
          life={life}
          sourceFontSize={resolvedLifeFontSize}
          system={system}
          color={color}
          rotation={contentRotation}
          boardRotation={boardRotation}
          cardWidth={cardSize.width}
          cardHeight={cardSize.height}
          contentInsets={contentInsets}
          menuCorner={menuCorner}
          menuEdgeCenter={menuEdgeCenter}
          onChange={onChange}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </View>
  )
}, structurallyEqual)

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  overflow: "hidden",
  padding: spacing.xs,
  borderWidth: 0,
  borderRadius: spacing.lg,
})

const $content: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  zIndex: 1,
})

const $readout: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
})

const $compactCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.xxs,
  borderRadius: spacing.md,
})

const $mark: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  zIndex: 9,
  opacity: PLAYER_MARK_MUTED_OPACITY,
})
const $markHitTarget: ThemedStyle<ViewStyle> = () => ({ position: "absolute", zIndex: 10 })

const $name: ThemedStyle<TextStyle> = () => ({
  maxWidth: "80%",
  textAlign: "center",
})

export function getPlayerMarkCorner(
  rotation: LifeCardContentRotation,
  padding: number,
  insets?: LifeCardContentInsets,
): ViewStyle {
  const offset = (edge: LifeCardEdge) => padding + (insets?.[edge] ?? 0)
  if (rotation === 90) return { left: offset("left"), bottom: offset("bottom") }
  if (rotation === -90) return { right: offset("right"), top: offset("top") }
  if (rotation === 180) return { left: offset("left"), top: offset("top") }
  return { right: offset("right"), bottom: offset("bottom") }
}

const $life: ThemedStyle<TextStyle> = () => ({
  width: "100%",
  textAlign: "center",
  fontVariant: ["tabular-nums"],
})

const $statusLayer: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  alignItems: "center",
})

const $statusPosition: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  top: "50%",
  left: 0,
  right: 0,
  marginTop: LIFE_TARGET_SIZE / 2 + spacing.xxs,
  flexDirection: "column",
  alignItems: "center",
  gap: spacing.xxxs,
})

const $cornerLayer: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  zIndex: 10,
})

const $cornerIdentity: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $cornerText: ThemedStyle<ViewStyle> = () => ({ flexShrink: 1, alignItems: "flex-start" })

const CENTER_CUTOUT_HALF_WIDTH = 64

const CONTENT_LEFT_EDGE = {
  0: "left",
  180: "right",
  90: "top",
  [-90]: "bottom",
} as const

const CONTENT_RIGHT_EDGE = {
  0: "right",
  180: "left",
  90: "bottom",
  [-90]: "top",
} as const

const CONTENT_BOTTOM_EDGE = {
  0: "bottom",
  180: "top",
  90: "left",
  [-90]: "right",
} as const

function cornerStatusPlacement({
  rotation,
  cardSize,
  gap,
  insets,
  screenEdges,
}: {
  rotation: LifeCardContentRotation
  cardSize: { width: number; height: number }
  gap: number
  insets?: LifeCardContentInsets
  screenEdges?: LifeCardScreenEdges
}) {
  const { width, height } = cardSize
  const sideways = Math.abs(rotation) === 90
  const bottomEdge = CONTENT_BOTTOM_EDGE[rotation]
  const leftEdge = CONTENT_LEFT_EDGE[rotation]
  const left = cornerOffset(gap, leftEdge, bottomEdge, insets, screenEdges)
  const bottom = cornerOffset(gap, bottomEdge, leftEdge, insets, screenEdges)
  const spansScreenEdge = !!screenEdges?.[leftEdge] && !!screenEdges[CONTENT_RIGHT_EDGE[rotation]]
  const cutoutAtMiddle = spansScreenEdge && (insets?.[bottomEdge] ?? 0) > 0
  const run = sideways ? height : width
  const layer: ViewStyle | undefined = sideways
    ? {
        width: height,
        height: width,
        left: (width - height) / 2,
        top: (height - width) / 2,
        right: undefined,
        bottom: undefined,
      }
    : undefined
  const position: ViewStyle = {
    left,
    bottom,
    maxWidth: run
      ? Math.max(run / 2 - left - (cutoutAtMiddle ? CENTER_CUTOUT_HALF_WIDTH : gap), 0)
      : undefined,
  }
  return { layer, position }
}

const $compactStatusPosition: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  top: "50%",
  left: 0,
  right: 0,
  marginTop: COMPACT_LIFE_TARGET_SIZE / 2 + spacing.xxxs,
  position: "absolute",
  flexDirection: "column",
  alignItems: "center",
  gap: spacing.xxxs,
})

const $commanderOverview: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  ...StyleSheet.absoluteFill,
  zIndex: 7,
  overflow: "hidden",
  borderRadius: spacing.lg,
})

const $compactCommanderOverview: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: spacing.md,
})

const $commanderOverviewContent: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
})

const $expandedCommanderBoard: ThemedStyle<ViewStyle> = () => ({
  position: "relative",
  zIndex: 2,
})

const $overviewClose: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 3,
})

const $mutedContent: ThemedStyle<ViewStyle> = () => ({ opacity: 0 })

const $eliminated: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFill,
  zIndex: 9,
  backgroundColor: colors.board.background,
  opacity: 0.6,
})

const $disabledCard: ThemedStyle<ViewStyle> = () => ({ opacity: 0.72 })
const $staleCard: ThemedStyle<ViewStyle> = () => ({ opacity: 0.5 })
const $status: ThemedStyle<TextStyle> = () => ({ textAlign: "center", opacity: 0.9 })

const $overviewReadout: ViewStyle = { zIndex: 8 }
