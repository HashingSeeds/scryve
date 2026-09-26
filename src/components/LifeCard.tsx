import { useEffect, useRef, useState } from "react"
import type { LayoutChangeEvent, StyleProp, TextStyle, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from "react-native"
import Animated, { FadeIn, FadeOut } from "react-native-reanimated"

import { counterValueLabel, type PlaySystemId } from "@/features/game/playSystems"
import type { LifeDelta } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { CommanderDamageBoard, type CommanderDamageBoardProps } from "./CommanderDamageBoard"
import {
  CommanderDamageCardControls,
  type CommanderAttacker,
  type CommanderDamageCardMode,
} from "./CommanderDamageCardControls"
import { CommanderStrip } from "./CommanderStrip"
import { LifeControls } from "./LifeControls"
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
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "./playerCardTypes"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

const DELTA_VISIBLE_MS = 1800
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
  contentRotation?: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
  lifeFontSize?: number
  system?: PlaySystemId
  lifeStep?: number
  disabled?: boolean
  ownership?: "owned" | "unowned" | "disabled"
  pendingCount?: number
  commanderDamage?: LifeCardCommanderDamage
  eliminated?: boolean
  onChange: (delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
}

export function LifeCard({
  playerName,
  seatNumber,
  shape,
  life,
  color,
  compact,
  contentRotation = 0,
  contentInsets,
  menuCorner,
  menuEdgeCenter,
  lifeFontSize,
  system,
  lifeStep,
  disabled,
  ownership,
  pendingCount = 0,
  commanderDamage,
  eliminated,
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
  const frozen = disabled || eliminated
  const inspectDisabled = disabled && ownership !== "unowned"
  const contentRotationStyle: TextStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined
  const displayName = playerName.trim() || "unnamed player"
  const identity = `Seat ${seatNumber}, ${displayName}`
  const markSize = compact ? COMPACT_PLAYER_MARK_SIZE : PLAYER_MARK_SIZE
  const lifeTargetSize = compact ? COMPACT_LIFE_TARGET_SIZE : LIFE_TARGET_SIZE
  const resolvedLifeFontSize =
    lifeFontSize ??
    Math.min(
      compact ? COMPACT_LIFE_FONT_SIZE : LIFE_FONT_SIZE,
      getLifeFontSizeThatFits({
        availableWidth: getLifeTargetTextSpace(lifeTargetSize),
        availableHeight: getLifeTargetTextSpace(lifeTargetSize),
        digits: String(life).length,
        fontScale: 1,
      }),
    )
  const cardPadding = compact ? spacing.xxs : spacing.xs
  const safeContentStyle = lifeCardContentInsetStyle(contentInsets)
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 })
  const [legacyOverviewOpen, setCommanderOverviewOpen] = useState(false)
  const commanderOverviewOpen = commanderDamage?.inspection?.open ?? legacyOverviewOpen
  const markStyle = getPlayerMarkCorner(contentRotation, cardPadding)
  const commanderOverviewEntering =
    reducedMotion === false ? FadeIn.duration(commanderOverviewDuration) : undefined
  const commanderOverviewExiting =
    reducedMotion === false ? FadeOut.duration(commanderOverviewDuration) : undefined

  const [recentDelta, setRecentDelta] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const previousLife = useRef(life)
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const difference = life - previousLife.current
    previousLife.current = life
    if (difference === 0) return
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(
        `${identity}, now ${counterValueLabel(system, life)}`,
      )
    }
    setRecentDelta((current) => current + difference)
    if (deltaTimer.current) clearTimeout(deltaTimer.current)
    deltaTimer.current = setTimeout(() => setRecentDelta(0), DELTA_VISIBLE_MS)
  }, [identity, life, system])
  useEffect(() => () => void (deltaTimer.current && clearTimeout(deltaTimer.current)), [])

  const ownershipLabel =
    ownership === "owned"
      ? "Your seat"
      : ownership === "unowned"
        ? "View only"
        : ownership === "disabled"
          ? "Controls unavailable"
          : undefined
  const statusLabel = pendingCount ? `${pendingCount} pending` : ""
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
    (statusLabel ? spacing.xxxs + 18 : 0)
  const showStatus = statusEdgeLength === 0 || statusEdgeInset === 0 || availableStatusOffset >= 0
  const statusTopOffset =
    statusEdgeInset > 0 && statusEdgeLength > 0
      ? Math.min(defaultStatusOffset, availableStatusOffset)
      : defaultStatusOffset

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
        eliminated ? ", eliminated by commander damage" : ""
      }`}
      onLayout={measureCard}
      style={[
        themed($card),
        compact && themed($compactCard),
        ownership === "disabled" && themed($disabledCard),
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
        accessibilityElementsHidden={commanderOverviewOpen || !!commanderCardMode}
        importantForAccessibility={
          commanderOverviewOpen || commanderCardMode ? "no-hide-descendants" : "auto"
        }
        style={[
          themed($content),
          (commanderCardMode || commanderOverviewOpen) && themed($mutedContent),
        ]}
      >
        <View
          testID={`life-readout-seat-${seatNumber}`}
          pointerEvents="none"
          style={[themed($readout), safeContentStyle]}
        >
          {eliminated ? (
            <View
              testID={`life-eliminated-seat-${seatNumber}`}
              pointerEvents="none"
              style={themed($eliminated)}
            >
              <Text
                text="✕"
                style={[themed($eliminatedMark), { color: foreground }]}
                maxFontSizeMultiplier={1}
              />
            </View>
          ) : null}
          <Text
            testID={`life-total-seat-${seatNumber}`}
            text={String(life)}
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
            style={[themed($statusLayer), { transform: [{ rotate: `${contentRotation}deg` }] }]}
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
                {statusLabel ? (
                  <Text
                    text={statusLabel}
                    weight="bold"
                    size="xxs"
                    maxFontSizeMultiplier={1.3}
                    numberOfLines={1}
                    style={[themed($status), { color: foreground }]}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>
      {commanderDamage && commanderOverviewOpen && !commanderCardMode ? (
        <Animated.View
          testID={`commander-overview-seat-${seatNumber}`}
          entering={commanderOverviewEntering}
          exiting={commanderOverviewExiting}
          accessibilityViewIsModal={!localCommander}
          style={[
            themed($commanderOverview),
            compact && themed($compactCommanderOverview),
            { backgroundColor: color },
          ]}
        >
          <View style={[themed($commanderOverviewContent), safeContentStyle]}>
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
                    (contentInsets?.left ?? 0) -
                    (contentInsets?.right ?? 0),
                  0,
                ),
                height: Math.max(
                  cardSize.height -
                    cardPadding * 2 -
                    (contentInsets?.top ?? 0) -
                    (contentInsets?.bottom ?? 0),
                  0,
                ),
              }}
            />
          </View>
          {!localCommander ? (
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              <Pressable
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
              </Pressable>
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
      ) : !commanderOverviewOpen && ownership !== "unowned" ? (
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
          onChange={onChange}
          onLongChange={() => setEditorOpen(true)}
        />
      ) : null}
      {commanderDamage && !localCommander && !commanderCardMode && !commanderOverviewOpen ? (
        <Pressable
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
      {commanderDamage?.inspection && !commanderCardMode ? (
        <CommanderStrip
          seatNumber={seatNumber}
          identity={identity}
          ownerPlayerId={commanderDamage.ownerPlayerId}
          players={commanderDamage.players ?? []}
          seats={commanderDamage.seats}
          incoming={commanderDamage.incoming}
          shape={shape}
          color={color}
          foreground={foreground}
          contentRotation={contentRotation}
          contentInsets={contentInsets}
          compact={compact}
          open={commanderOverviewOpen}
          disabled={disabled}
          inspectDisabled={inspectDisabled}
          onToggle={commanderDamage.inspection.onToggle}
          onPressSword={beginCommanderAssignment}
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
}

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

export function getPlayerMarkCorner(rotation: LifeCardContentRotation, padding: number): ViewStyle {
  if (rotation === 90) return { left: padding, bottom: padding }
  if (rotation === -90) return { right: padding, top: padding }
  if (rotation === 180) return { left: padding, top: padding }
  return { right: padding, bottom: padding }
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

const $eliminated: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
  zIndex: 3,
})

const $eliminatedMark: ThemedStyle<TextStyle> = () => ({
  fontSize: 176,
  lineHeight: 184,
  opacity: 0.22,
})

const $disabledCard: ThemedStyle<ViewStyle> = () => ({ opacity: 0.72 })
const $status: ThemedStyle<TextStyle> = () => ({ textAlign: "center", opacity: 0.9 })
