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

import { counterValueLabel, playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { LifeDelta } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { CommanderClaimBanner, type CommanderClaim } from "./CommanderClaimBanner"
import { CommanderDamageBoard, type CommanderDamageBoardProps } from "./CommanderDamageBoard"
import {
  CommanderDamageCardControls,
  type CommanderAttacker,
  type CommanderDamageCardMode,
} from "./CommanderDamageCardControls"
import { CommanderStrip, commanderDamageDealers } from "./CommanderStrip"
import { CounterChips, type SeatTable } from "./CounterChips"
import { DiceChips } from "./DiceChips"
import { diceCoversSeat, DiceSeatOverlay, type LifeCardDice } from "./DiceSeatOverlay"
import { CalculatorGlyph, LifeCalculator } from "./LifeCalculator"
import { LifeControls, useRecentDelta } from "./LifeControls"
import { LifeEditor } from "./LifeEditor"
import {
  COMPACT_LIFE_FONT_SIZE,
  COMPACT_LIFE_TARGET_SIZE,
  getLifeFontSizeThatFits,
  getLifeLineHeight,
  getLifeTargetTextSpace,
  lifeCardContentInsetStyle,
  LIFE_FONT_SIZE,
  LIFE_MAX_FONT_SCALE,
  LIFE_GLYPH_LINE_HEIGHT,
  LIFE_TARGET_SIZE,
  cornerOffset,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardScreenEdges,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "./playerCardTypes"
import { MarkArt, PlayerMark } from "./PlayerMark"
import {
  SeatIdentity,
  seatIdentityBottomGap,
  seatIdentityMetrics,
  seatMarkArt,
} from "./SeatIdentity"
import { Text } from "./Text"
import { isProMarkShape, shapeForSeat, type PlayerMarkShape } from "../../convex/lib/appearance"

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
  pendingClaims?: readonly CommanderClaim[]
}

export interface LifeCardProps {
  playerId?: string
  playerName: string
  seatNumber: number
  shape?: PlayerMarkShape
  foil?: boolean
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
  eliminated?: string
  seatTable?: SeatTable
  dice?: LifeCardDice
  onChange: (delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
}

/** why: the board re-renders on every sync step and server update; a seat only needs to when its own props change. PlayerGrid rebuilds plain props (insets, styles, commander data) each render, so they compare by content, and it keeps every callback's identity stable. */
export const LifeCard = memo(function LifeCard({
  playerId,
  playerName,
  seatNumber,
  shape,
  foil,
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
  dice,
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
  const diceCovers = diceCoversSeat(dice)
  const diceChips = dice?.chips
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
  const lifeTargetSize = compact ? COMPACT_LIFE_TARGET_SIZE : LIFE_TARGET_SIZE
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
  const commanderOverviewEntering =
    reducedMotion === false ? FadeIn.duration(commanderOverviewDuration) : undefined
  const commanderOverviewExiting =
    reducedMotion === false ? FadeOut.duration(commanderOverviewDuration) : undefined

  const [editorOpen, setEditorOpen] = useState(false)
  const calculator = !!playSystemRules(system).counter.calculator
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
  const armedCommanderId = commanderDamage?.armedPlayerId
  const commanderCardMode: CommanderDamageCardMode | undefined =
    commanderDamage && armedCommanderId === commanderDamage.ownerPlayerId
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
  const lifeControlsShown =
    !commanderCardMode &&
    !commanderOverviewOpen &&
    !localOverviewVisible &&
    !tableSheetOpen &&
    !diceCovers &&
    ownership !== "unowned"
  const claims = lifeControlsShown && !editorOpen ? commanderDamage?.pendingClaims : undefined
  const calculatorButtonShown = calculator && lifeControlsShown && !editorOpen && !frozen
  const calculatorButtonSize = compact ? 30 : 40
  const claimShown = !!claims?.length
  const commanderStripShown =
    !!commanderDamage?.inspection &&
    !commanderCardMode &&
    !tableSheetOpen &&
    !diceCovers &&
    commanderDamageDealers(
      commanderDamage.players ?? [],
      commanderDamage.ownerPlayerId,
      commanderDamage.incoming,
    ).length > 0
  const identityMetrics = seatIdentityMetrics(compact)
  const identityCorner = seatIdentityPlacement({
    rotation: contentRotation,
    cardSize,
    gap: identityMetrics.edge,
    insets: contentInsets,
    screenEdges,
    markHeight: identityMetrics.mark,
  })
  const seatIdentity = (
    <SeatIdentity
      seatNumber={seatNumber}
      playerName={displayName}
      shape={shape}
      color={foreground}
      compact={compact}
      spinning={ownership === "owned"}
      insetSwordColor={commanderDamage ? color : undefined}
      foil={foil && !!shape && isProMarkShape(shape)}
      staleSince={staleSince}
    />
  )

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
      {shape && isProMarkShape(shape) && cardSize.height > 0 ? (
        <View
          testID={`pro-mark-watermark-seat-${seatNumber}`}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={proWatermarkPlacement(contentRotation, cardSize)}
        >
          <MarkArt
            shape={shape}
            color={foreground}
            size={(Math.abs(contentRotation) === 90 ? cardSize.width : cardSize.height) * 0.8}
          />
        </View>
      ) : null}
      <View
        pointerEvents={
          commanderOverviewOpen || commanderCardMode || diceCovers ? "none" : "box-none"
        }
        accessibilityElementsHidden={
          (!localCommander && commanderOverviewOpen) ||
          !!commanderCardMode ||
          tableSheetOpen ||
          diceCovers
        }
        importantForAccessibility={
          (!localCommander && commanderOverviewOpen) ||
          commanderCardMode ||
          tableSheetOpen ||
          diceCovers
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
            weight="bold"
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
            <View
              key={contentRotation}
              pointerEvents="box-none"
              style={[
                themed($cornerLayer),
                identityCorner.layer,
                { transform: [{ rotate: `${contentRotation}deg` }] },
              ]}
            >
              <BoardPressable
                testID={`commander-overview-close-seat-${seatNumber}`}
                accessibilityRole="button"
                accessibilityLabel={`Close commander damage for ${identity}`}
                onPress={closeCommanderOverview}
                hitSlop={12}
                style={[themed($overviewClose), identityCorner.position]}
              >
                <PlayerMark
                  seatNumber={seatNumber}
                  shape={shape}
                  color={foreground}
                  insetSwordColor={color}
                  closeIcon
                  size={identityMetrics.mark}
                  style={seatMarkArt(shape ?? shapeForSeat(seatNumber), compact).trim}
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
      ) : lifeControlsShown ? (
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
          lifeFontSize={resolvedLifeFontSize}
          lifeDigits={shownDigits}
          onChange={onChange}
          onPreview={setPreview}
          onLongChange={() => setEditorOpen(true)}
        />
      ) : null}
      {dice && diceCovers ? (
        <DiceSeatOverlay
          seatNumber={seatNumber}
          playerName={displayName}
          color={color}
          foreground={foreground}
          contentRotation={contentRotation}
          compact={compact}
          dice={dice}
        />
      ) : null}
      {commanderDamage?.inspection && !commanderCardMode && !tableSheetOpen && !diceCovers ? (
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
      {!commanderCardMode &&
      !tableSheetOpen &&
      !dice?.view &&
      !(commanderDamage && !localCommander && commanderOverviewOpen) ? (
        // why: switching an old game to another layout turns a mounted seat from sideways to upright, and the reused layer hid the identity on iOS; a fresh layer per rotation does not.
        <View
          key={contentRotation}
          testID={`life-corner-layer-seat-${seatNumber}`}
          pointerEvents="box-none"
          style={[
            themed($cornerLayer),
            identityCorner.layer,
            { transform: [{ rotate: `${contentRotation}deg` }] },
          ]}
        >
          <View
            testID={`life-identity-row-seat-${seatNumber}`}
            pointerEvents="box-none"
            style={[
              $cornerRow,
              {
                gap: identityMetrics.gap,
                left: identityCorner.position.left,
                bottom: identityCorner.position.bottom,
                maxWidth:
                  calculatorButtonShown && typeof identityCorner.rowMaxWidth === "number"
                    ? Math.max(
                        identityCorner.rowMaxWidth - calculatorButtonSize - identityMetrics.gap,
                        0,
                      )
                    : identityCorner.rowMaxWidth,
              },
            ]}
          >
            <View
              testID={`life-identity-seat-${seatNumber}`}
              pointerEvents="box-none"
              accessibilityElementsHidden={diceCovers}
              importantForAccessibility={diceCovers ? "no-hide-descendants" : "auto"}
              style={[
                $cornerIdentity,
                // why: the half-run cap leaves the far corner to the commander strip; without it the name runs to the row's limit.
                commanderStripShown && { maxWidth: identityCorner.position.maxWidth },
              ]}
            >
              {commanderDamage?.inspection ? (
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
                  style={({ pressed }) => pressed && { opacity: 0.72 }}
                >
                  {seatIdentity}
                </BoardPressable>
              ) : commanderDamage ? (
                <BoardPressable
                  testID={`commander-mark-seat-${seatNumber}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Show commander damage for ${identity}`}
                  accessibilityHint="Expands the commander damage grid"
                  accessibilityState={{ expanded: false }}
                  hitSlop={12}
                  onPress={openCommanderOverview}
                  style={({ pressed }) => pressed && { opacity: 0.72 }}
                >
                  {seatIdentity}
                </BoardPressable>
              ) : (
                <View pointerEvents="none">{seatIdentity}</View>
              )}
            </View>
            {diceChips?.length && dice?.onClearChip && !dice.view && !editorOpen ? (
              <DiceChips
                seatNumber={seatNumber}
                playerName={displayName}
                foreground={foreground}
                compact={compact}
                chips={diceChips}
                onClear={dice.onClearChip}
              />
            ) : null}
          </View>
          {calculatorButtonShown ? (
            <BoardPressable
              testID={`life-calculator-open-seat-${seatNumber}`}
              accessibilityRole="button"
              accessibilityLabel={`Open calculator for ${identity}`}
              hitSlop={12}
              onPress={() => setEditorOpen(true)}
              style={({ pressed }) => [
                $cornerButton,
                {
                  right: identityCorner.trailing.right,
                  bottom: identityCorner.trailing.bottom,
                  width: calculatorButtonSize,
                  height: calculatorButtonSize,
                },
                pressed && { opacity: 0.72 },
              ]}
            >
              <CalculatorGlyph color={foreground} size={calculatorButtonSize} />
            </BoardPressable>
          ) : null}
        </View>
      ) : null}
      {claims?.length ? (
        <CommanderClaimBanner
          seatNumber={seatNumber}
          claims={claims}
          contentRotation={contentRotation}
          contentInsets={contentInsets}
          menuEdgeCenter={menuEdgeCenter}
          cardSize={cardSize}
          compact={compact}
          disabled={disabled}
        />
      ) : null}
      {seatTable &&
      !claimShown &&
      !diceCovers &&
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
      {editorOpen && calculator ? (
        <LifeCalculator
          playerId={playerId}
          seatNumber={seatNumber}
          playerName={displayName}
          life={life}
          system={system}
          color={color}
          rotation={contentRotation}
          cardWidth={cardSize.width}
          cardHeight={cardSize.height}
          contentInsets={contentInsets}
          menuCorner={menuCorner}
          menuEdgeCenter={menuEdgeCenter}
          onChange={onChange}
          onClose={() => setEditorOpen(false)}
        />
      ) : editorOpen ? (
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

const $life: ThemedStyle<TextStyle> = () => ({
  width: "100%",
  textAlign: "center",
  fontVariant: ["tabular-nums"],
})

const $cornerLayer: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  zIndex: 10,
})

const $cornerRow: ViewStyle = { position: "absolute", flexDirection: "row", alignItems: "center" }
const $cornerIdentity: ViewStyle = { flexShrink: 1, minWidth: 0 }
const $cornerButton: ViewStyle = {
  position: "absolute",
  alignItems: "center",
  justifyContent: "center",
  opacity: 0.6,
}

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

const CONTENT_TOP_EDGE = { 0: "top", 180: "bottom", 90: "right", [-90]: "left" } as const

export function proWatermarkPlacement(
  rotation: LifeCardContentRotation,
  cardSize: { width: number; height: number },
): ViewStyle {
  const size = (Math.abs(rotation) === 90 ? cardSize.width : cardSize.height) * 0.8
  return {
    position: "absolute",
    width: size,
    height: size,
    opacity: 0.11,
    [CONTENT_TOP_EDGE[rotation]]: -size * 0.22,
    [CONTENT_RIGHT_EDGE[rotation]]: -size * 0.33,
    transform: [{ rotate: `${rotation}deg` }],
  }
}

// why: insets give a notch's depth but not its width; a tucked name stops short of a Dynamic Island sized cutout.
const CUTOUT_HALF_WIDTH = 64

const CONTENT_BOTTOM_EDGE = {
  0: "bottom",
  180: "top",
  90: "left",
  [-90]: "right",
} as const

/** why: the layer swaps its sides before turning sideways; turned as is, the identity pokes past the card. */
export function seatIdentityPlacement({
  rotation,
  cardSize,
  gap,
  insets,
  screenEdges,
  markHeight,
}: {
  rotation: LifeCardContentRotation
  cardSize: { width: number; height: number }
  gap: number
  markHeight: number
  insets?: LifeCardContentInsets
  screenEdges?: LifeCardScreenEdges
}) {
  const { width, height } = cardSize
  const sideways = Math.abs(rotation) === 90
  const bottomEdge = CONTENT_BOTTOM_EDGE[rotation]
  const leftEdge = CONTENT_LEFT_EDGE[rotation]
  const spansScreenEdge = !!screenEdges?.[leftEdge] && !!screenEdges[CONTENT_RIGHT_EDGE[rotation]]
  const inset = insets?.[bottomEdge] ?? 0
  const contentHeight = sideways ? width : height
  const raised = seatIdentityBottomGap(gap, inset, bottomEdge) + inset
  // why: a mid-edge notch or home indicator truncates the name, so the pair rises past it; on a short card that lands the mark on the − and + glyphs, so it tucks instead.
  const roomAboveCutout = raised + markHeight <= contentHeight / 2 - LIFE_GLYPH_LINE_HEIGHT / 2
  const underCutout = spansScreenEdge && inset > 0
  const cutoutAtMiddle = underCutout && roomAboveCutout
  const rightEdge = CONTENT_RIGHT_EDGE[rotation]
  const left = cornerOffset(gap, leftEdge, bottomEdge, insets, screenEdges)
  // why: the outside corner opposite the name holds the seat's calculator button.
  const trailing = {
    right: cornerOffset(gap, rightEdge, bottomEdge, insets, screenEdges),
    bottom: cornerOffset(gap, bottomEdge, rightEdge, insets, screenEdges),
  }
  const bottom = cutoutAtMiddle
    ? raised
    : cornerOffset(gap, bottomEdge, leftEdge, insets, screenEdges)
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
  const tucked = underCutout && !cutoutAtMiddle
  const position: ViewStyle = {
    left,
    bottom,
    maxWidth: run
      ? Math.max(run / 2 - left - gap - (tucked ? CUTOUT_HALF_WIDTH : 0), 0)
      : undefined,
  }
  // why: dice chips trail the name past the half-run line, except beside a tucked name, where they would reach the cutout.
  const rowMaxWidth = run && !tucked ? Math.max(run - left * 2, 0) : position.maxWidth
  return { layer, position, rowMaxWidth, trailing }
}

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

const $overviewReadout: ViewStyle = { zIndex: 8 }
