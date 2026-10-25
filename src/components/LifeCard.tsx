import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
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
  withSequence,
  withTiming,
} from "react-native-reanimated"

import { counterValueLabel, playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { LifeDelta } from "@/features/game/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"
import { startTapTiming } from "@/utils/tapTiming"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { CommanderClaimBanner, type CommanderClaim } from "./CommanderClaimBanner"
import { CommanderDamageBoard, type CommanderDamageBoardProps } from "./CommanderDamageBoard"
import {
  CommanderDamageCardControls,
  type CommanderAttacker,
  type CommanderDamageCardMode,
} from "./CommanderDamageCardControls"
import type { CommanderFacing } from "./commanderDamageLayout"
import { CommanderStrip, commanderDamageDealers } from "./CommanderStrip"
import { CounterChips, TableGlyph, type SeatTable } from "./CounterChips"
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
  seatIdentityLabel,
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
  power?: number
  commanderName?: string
  onPowerStep?: (step: 1 | -1) => void
  facing?: CommanderFacing
  onStage?: (step: number) => void
  acted?: boolean
  armBar?: { stagedTargets: number; onSend: () => void }
  pendingClaims?: readonly CommanderClaim[]
}

export type LifeCardOut = { reason: string } & (
  | { cause: "life" }
  | { cause: "commanderDamage"; amount: number; attacker?: CommanderAttacker }
  | { cause: "counter"; amount: number; counterId: string }
)

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
  out?: LifeCardOut
  seatTable?: SeatTable
  dice?: LifeCardDice
  onPlayStart?: () => void
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
  out,
  seatTable,
  onPlayStart,
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
  const locked = !!out && out.cause !== "life"
  const frozen = disabled || locked
  const inspectDisabled = disabled && ownership !== "unowned"
  const contentRotationStyle: TextStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined
  const displayName = playerName.trim() || translate("board:seat.unnamedPlayer")
  const identity = seatIdentityLabel(seatNumber, playerName)
  const lifeTargetSize = compact ? COMPACT_LIFE_TARGET_SIZE : LIFE_TARGET_SIZE
  const [preview, setPreview] = useState(0)
  const stopTapTiming = useRef<() => void>(undefined)
  const showPreview = useCallback((delta: number) => {
    stopTapTiming.current = delta === 0 ? undefined : startTapTiming()
    setPreview(delta)
  }, [])
  useLayoutEffect(() => {
    stopTapTiming.current?.()
    stopTapTiming.current = undefined
  }, [preview])
  const shownLife = life + preview
  const shownDigits = String(shownLife).length
  const fontSizeFor = (digits: number) =>
    lifeFontSizeFor?.(digits) ??
    Math.min(
      compact ? COMPACT_LIFE_FONT_SIZE : LIFE_FONT_SIZE,
      getLifeFontSizeThatFits({
        availableWidth: getLifeTargetTextSpace(lifeTargetSize),
        availableHeight: getLifeTargetTextSpace(lifeTargetSize),
        digits,
        fontScale: 1,
      }),
    )
  const resolvedLifeFontSize = fontSizeFor(shownDigits)
  const cardPadding = compact ? spacing.xxs : spacing.xs
  const safeContentStyle = lifeCardContentInsetStyle(contentInsets)
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 })
  const sidewaysContent = Math.abs(contentRotation) === 90
  const [identityRowAt, setIdentityRowAt] = useState<{ x: number; y: number }>()
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
  useEffect(() => {
    if (tableSheetOpen || editorOpen) onPlayStart?.()
  }, [editorOpen, onPlayStart, tableSheetOpen])
  const recentDelta = useRecentDelta(life)
  const previousLife = useRef(life)
  useEffect(() => {
    if (previousLife.current === life) return
    previousLife.current = life
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(
        translate("board:lifeCard.now", { identity, value: counterValueLabel(system, life) }),
      )
    }
  }, [identity, life, system])

  const ownershipLabel = ownership ? translate(`board:seat.ownership.${ownership}`) : undefined
  const armedCommanderId = commanderDamage?.armedPlayerId
  const commanderCardMode: CommanderDamageCardMode | undefined =
    commanderDamage && armedCommanderId === commanderDamage.ownerPlayerId
      ? {
          kind: "source",
          playerName: displayName,
          submit: commanderDamage.armBar?.stagedTargets ? "send" : "done",
          mark: { color, shape, seatNumber },
          commanderName: commanderDamage.commanderName,
          power: commanderDamage.power ?? 1,
          acted: !!commanderDamage.acted,
          onPowerStep: commanderDamage.onPowerStep ?? (() => {}),
          onSubmit: commanderDamage.armBar?.onSend ?? commanderDamage.onPressSword ?? (() => {}),
        }
      : commanderDamage && armedCommanderId
        ? {
            kind: "target",
            attackerName:
              commanderDamage.attackerName ?? translate("board:commander.unknownAttacker"),
            attacker: commanderDamage.attacker,
            total:
              (commanderDamage.incoming[armedCommanderId] ?? 0) +
              (commanderDamage.stagedAgainstOwner ?? 0),
            power: commanderDamage.power ?? 1,
            facing: commanderDamage.facing ?? {},
            acted: !!commanderDamage.acted,
            onChange: (step) => commanderDamage.onStage?.(step),
          }
        : undefined
  const attackerSide = commanderCardMode?.kind === "source"
  const knock = useSharedValue(0)
  const defenderTotal = commanderCardMode?.kind === "target" ? commanderCardMode.total : undefined
  const knockFacing = commanderCardMode?.kind === "target" ? commanderCardMode.facing : undefined
  const lastDefenderTotal = useRef(defenderTotal)
  useEffect(() => {
    const previous = lastDefenderTotal.current
    lastDefenderTotal.current = defenderTotal
    if (defenderTotal === undefined || previous === undefined || defenderTotal <= previous) return
    if (reducedMotion !== false) return
    knock.value = withSequence(
      withTiming(1, { duration: 95 }),
      withTiming(-0.25, { duration: 130 }),
      withTiming(0, { duration: 155 }),
    )
  }, [defenderTotal, knock, reducedMotion])
  const knockX = knockFacing?.x === "left" ? 1 : knockFacing?.x === "right" ? -1 : 0
  const knockY = knockFacing?.y === "top" ? 1 : knockFacing?.y === "bottom" ? -1 : 0
  const knockDistance = knockX && knockY ? KNOCKBACK / Math.SQRT2 : KNOCKBACK
  const knockStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: knock.value * knockX * knockDistance },
      { translateY: knock.value * knockY * knockDistance },
    ],
  }))
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

  const outLabel = out && translate("board:lifeCard.out", { reason: out.reason })
  const causeFontSize = out && out.cause !== "life" ? fontSizeFor(String(out.amount).length) : 0
  const causeGlyphSize = Math.round(causeFontSize * 0.5)
  const lifeFontStyle: TextStyle = {
    fontSize: resolvedLifeFontSize,
    lineHeight: getLifeLineHeight(resolvedLifeFontSize),
  }
  const lifeTotal = (...style: StyleProp<TextStyle>[]) => (
    <Text
      testID={`life-total-seat-${seatNumber}`}
      text={String(shownLife)}
      weight="bold"
      accessible
      accessibilityLabel={translate("board:counters.seatItem", {
        identity,
        label: counterValueLabel(system, life),
      })}
      accessibilityLiveRegion="polite"
      maxFontSizeMultiplier={LIFE_MAX_FONT_SCALE}
      numberOfLines={1}
      style={[themed($life), ...style, { color: foreground }]}
    />
  )

  function measureCard(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout
    setCardSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    )
  }

  function openCommanderOverview() {
    onPlayStart?.()
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
    <Animated.View
      testID={`life-card-seat-${seatNumber}`}
      accessibilityLabel={[ownershipLabel, outLabel]
        .filter((part): part is string => Boolean(part))
        .reduce(
          (label, part) => translate("board:counters.seatItem", { identity: label, label: part }),
          identity,
        )}
      onLayout={measureCard}
      style={[
        themed($card),
        compact && themed($compactCard),
        ownership === "disabled" && themed($disabledCard),
        staleSince !== undefined && themed($staleCard),
        { backgroundColor: color },
        style,
        knockStyle,
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
          (!localCommander && commanderOverviewOpen) || attackerSide || tableSheetOpen || diceCovers
        }
        importantForAccessibility={
          (!localCommander && commanderOverviewOpen) || attackerSide || tableSheetOpen || diceCovers
            ? "no-hide-descendants"
            : "auto"
        }
        style={[
          themed($content),
          (attackerSide || (!localCommander && commanderOverviewOpen)) && themed($mutedContent),
          localOverviewVisible && $overviewReadout,
        ]}
      >
        <Animated.View
          testID={`life-readout-seat-${seatNumber}`}
          pointerEvents="none"
          style={[themed($readout), localCommander && overviewLifeStyle]}
        >
          {out?.cause === "life" ? (
            <View style={[$outReadout, contentRotationStyle]}>
              {lifeTotal(lifeFontStyle)}
              <Text
                testID={`life-out-label-seat-${seatNumber}`}
                text={translate("board:lifeCard.outLabel")}
                weight="bold"
                accessible={false}
                maxFontSizeMultiplier={LIFE_MAX_FONT_SCALE}
                style={[themed($outLabel), { color: foreground }]}
              />
            </View>
          ) : out ? (
            <View style={[$outReadout, contentRotationStyle]}>
              <View style={$outCause}>
                {out.cause === "counter" ? (
                  <TableGlyph id={out.counterId} size={causeGlyphSize} color={foreground} />
                ) : out.attacker ? (
                  <PlayerMark
                    seatNumber={out.attacker.seatNumber}
                    shape={out.attacker.shape}
                    color={foreground}
                    insetSwordColor={color}
                    size={causeGlyphSize}
                  />
                ) : null}
                <Text
                  testID={`life-out-amount-seat-${seatNumber}`}
                  text={String(out.amount)}
                  weight="bold"
                  accessible={false}
                  maxFontSizeMultiplier={LIFE_MAX_FONT_SCALE}
                  numberOfLines={1}
                  style={[
                    themed($life),
                    $outAmount,
                    {
                      fontSize: causeFontSize,
                      lineHeight: getLifeLineHeight(causeFontSize),
                      color: foreground,
                    },
                  ]}
                />
              </View>
              {lifeTotal(themed($struckLife))}
            </View>
          ) : (
            lifeTotal(lifeFontStyle, contentRotationStyle)
          )}
        </Animated.View>
      </View>
      {out ? (
        <View
          testID={`life-eliminated-seat-${seatNumber}`}
          pointerEvents="none"
          style={[themed($eliminated), locked && $lockedOverlay]}
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
                lethal={commanderDamage.lethal}
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
                accessibilityLabel={translate("board:commander.closeFor", { identity })}
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
          playerName={displayName}
          foreground={foreground}
          contentRotation={contentRotation}
          contentInsets={contentInsets}
          menuCorner={menuCorner}
          menuEdgeCenter={menuEdgeCenter}
          compact={compact}
          mode={commanderCardMode}
        />
      ) : lifeControlsShown ? (
        <LifeControls
          playerName={displayName}
          seatNumber={seatNumber}
          disabled={disabled}
          lockedReason={locked ? outLabel : undefined}
          reducedMotion={reducedMotion}
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
          onPreview={showPreview}
          onLongChange={() => setEditorOpen(true)}
          style={out?.cause === "life" ? $aboveOutOverlay : undefined}
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
          lethal={commanderDamage.lethal}
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
            onLayout={({ nativeEvent: { layout } }) =>
              setIdentityRowAt((current) =>
                current?.x === layout.x && current.y === layout.y
                  ? current
                  : { x: layout.x, y: layout.y },
              )
            }
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
                  accessibilityLabel={translate(
                    staleSince !== undefined
                      ? "board:commander.assignFromStale"
                      : "board:commander.assignFrom",
                    { identity },
                  )}
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
                  accessibilityLabel={translate("board:commander.showOverviewFor", { identity })}
                  accessibilityHint={translate("board:commander.expandsGrid")}
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
            {diceChips?.length && dice?.onPressChip && !dice.view && !editorOpen ? (
              <DiceChips
                seatNumber={seatNumber}
                playerName={displayName}
                foreground={foreground}
                compact={compact}
                chips={diceChips}
                onPress={dice.onPressChip}
                bloomCenterInRow={
                  identityRowAt && cardSize.width > 0
                    ? {
                        x:
                          (sidewaysContent ? cardSize.height : cardSize.width) / 2 -
                          identityRowAt.x,
                        y:
                          (sidewaysContent ? cardSize.width : cardSize.height) / 2 -
                          identityRowAt.y,
                      }
                    : undefined
                }
              />
            ) : null}
          </View>
          {calculatorButtonShown ? (
            <BoardPressable
              testID={`life-calculator-open-seat-${seatNumber}`}
              accessibilityRole="button"
              accessibilityLabel={translate("board:lifeCard.openCalculator", { identity })}
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
    </Animated.View>
  )
}, structurallyEqual)

const KNOCKBACK = 12

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
  zIndex: 2,
  backgroundColor: colors.board.background,
  opacity: 0.6,
})

const $lockedOverlay: ViewStyle = { zIndex: 9 }

const $aboveOutOverlay: ViewStyle = { zIndex: 3 }

const $outReadout: ViewStyle = { width: "100%", alignItems: "center" }

const $outCause: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 6 }

const $outAmount: TextStyle = { width: "auto" }

const $outLabel: ThemedStyle<TextStyle> = ({ spacing }) => ({
  fontSize: 14,
  letterSpacing: 2,
  textTransform: "uppercase",
  marginTop: -spacing.xs,
})

const $struckLife: ThemedStyle<TextStyle> = () => ({
  fontSize: 22,
  lineHeight: 28,
  textDecorationLine: "line-through",
})

const $disabledCard: ThemedStyle<ViewStyle> = () => ({ opacity: 0.72 })
const $staleCard: ThemedStyle<ViewStyle> = () => ({ opacity: 0.5 })

const $overviewReadout: ViewStyle = { zIndex: 8 }
