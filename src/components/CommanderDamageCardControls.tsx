import { useEffect } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"

import { MAX_COMMANDER_DAMAGE } from "@/features/game/domain"
import { counterValueLabel, type PlaySystemId } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { overlayTint } from "./LifeControls"
import {
  lifeCardContentInsetStyle,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
} from "./playerCardTypes"
import { PlayerMark } from "./PlayerMark"
import { Sword } from "./Sword"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

const COMMANDER_SYSTEM = "mtg" satisfies PlaySystemId

export type CommanderAttacker = { color: string; shape?: PlayerMarkShape; seatNumber: number }

type AssignmentTarget = {
  kind: "target"
  attackerName: string
  attacker?: CommanderAttacker
  total: number
  onChange: (step: -1 | 1) => void
}

type AssignmentSource = {
  kind: "source"
  playerName: string
  submit: "done" | "send"
  mark?: CommanderAttacker
  submitDisabled?: boolean
  onSubmit: () => void
  onCancel?: () => void
}

export type CommanderDamageCardMode = AssignmentTarget | AssignmentSource

export interface CommanderDamageCardControlsProps {
  seatNumber: number
  foreground: string
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  compact?: boolean
  mode: CommanderDamageCardMode
  life?: number
}

export function CommanderDamageCardControls({
  seatNumber,
  foreground,
  contentRotation,
  contentInsets,
  compact,
  mode,
  life,
}: CommanderDamageCardControlsProps) {
  const { themed, theme } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const progress = useSharedValue(reducedMotion === false ? 0 : 1)
  const rotationStyle: ViewStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined

  useEffect(() => {
    progress.value = withTiming(1, { duration: motionDuration(reducedMotion, 160) })
  }, [progress, reducedMotion])

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.98 + progress.value * 0.02 }],
  }))
  const controlForeground = mode.kind === "target" ? foreground : theme.colors.board.text

  return (
    <Animated.View
      testID={`commander-card-mode-seat-${seatNumber}`}
      accessibilityLabel={modeAccessibilityLabel(mode)}
      style={[
        themed($overlay),
        compact && themed($compactOverlay),
        mode.kind === "target"
          ? {
              borderColor: overlayTint(foreground, 0.28),
              backgroundColor: overlayTint(foreground, 0.04),
            }
          : themed($activePlayerOverlay),
        life !== undefined && mode.kind !== "source" && themed($localOverlay),
        entranceStyle,
      ]}
    >
      <View
        testID={`commander-card-content-seat-${seatNumber}`}
        style={[$safeContent, lifeCardContentInsetStyle(contentInsets)]}
      >
        {mode.kind === "target" ? (
          <View
            testID={`commander-target-seat-${seatNumber}`}
            style={[themed($zones), zonesRotationStyle(contentRotation)]}
          >
            <CommanderAction
              testID={`commander-stage-seat-${seatNumber}--1`}
              label={translate("board:commander.removeOneFromSeat", { seat: seatNumber })}
              text="−"
              foreground={controlForeground}
              rotationStyle={rotationStyle}
              compact={compact}
              disabled={mode.total <= 0}
              onPress={() => mode.onChange(-1)}
            />
            <CommanderAction
              testID={`commander-stage-seat-${seatNumber}-1`}
              label={translate("board:commander.addOneToSeat", { seat: seatNumber })}
              text="+"
              foreground={controlForeground}
              rotationStyle={rotationStyle}
              compact={compact}
              disabled={mode.total >= MAX_COMMANDER_DAMAGE}
              onPress={() => mode.onChange(1)}
            />
          </View>
        ) : (
          <View style={[themed($zones), zonesRotationStyle(contentRotation)]}>
            {mode.onCancel ? (
              <CommanderAction
                testID={`commander-cancel-seat-${seatNumber}`}
                label={translate("board:commander.cancelAssigningFromSeat", { seat: seatNumber })}
                text={translate("common:cancel")}
                foreground={controlForeground}
                rotationStyle={rotationStyle}
                compact={compact}
                onPress={mode.onCancel}
              />
            ) : null}
            <CommanderAction
              testID={`commander-${mode.submit}-seat-${seatNumber}`}
              label={translate(`board:commander.submitAssigningFromSeat.${mode.submit}`, {
                seat: seatNumber,
              })}
              text={
                mode.submit === "send"
                  ? translate("board:commander.send")
                  : translate("common:done")
              }
              foreground={controlForeground}
              rotationStyle={rotationStyle}
              compact={compact}
              emphasized
              disabled={mode.submitDisabled}
              mark={mode.mark}
              markInset={theme.colors.board.background}
              onPress={mode.onSubmit}
            />
          </View>
        )}
      </View>

      {mode.kind === "target" ? (
        <View
          pointerEvents="none"
          accessible={life !== undefined}
          accessibilityLabel={
            life !== undefined
              ? translate("board:commander.targetWithLife", {
                  target: modeAccessibilityLabel(mode),
                  life: counterValueLabel(COMMANDER_SYSTEM, life),
                })
              : undefined
          }
          accessibilityLiveRegion={life !== undefined ? "polite" : undefined}
          style={[themed($summary), rotationStyle]}
        >
          <View style={life === undefined ? themed($incomingTotal) : themed($localTotal)}>
            {life === undefined ? (
              <Text
                text="↓"
                weight="bold"
                maxFontSizeMultiplier={1.2}
                style={[themed(compact ? $compactIncoming : $incoming), { color: foreground }]}
              />
            ) : null}
            <View style={themed($incomingTotal)}>
              {life !== undefined && mode.attacker ? (
                <View
                  testID={`commander-attacker-seat-${seatNumber}`}
                  style={[
                    themed(compact ? $compactAttackerChip : $attackerChip),
                    {
                      backgroundColor: mode.attacker.color,
                      borderColor: overlayTint(foreground, 0.6),
                    },
                  ]}
                >
                  <PlayerMark
                    seatNumber={mode.attacker.seatNumber}
                    shape={mode.attacker.shape}
                    color={accessibleForeground(mode.attacker.color)}
                    insetSwordColor={mode.attacker.color}
                    size={compact ? 22 : 30}
                  />
                </View>
              ) : null}
              <Text
                testID={`commander-total-seat-${seatNumber}`}
                text={String(mode.total)}
                weight="bold"
                maxFontSizeMultiplier={1.2}
                style={[themed(compact ? $compactTotal : $total), { color: foreground }]}
              />
            </View>
            {life !== undefined ? (
              <Text
                testID={`commander-life-seat-${seatNumber}`}
                text={counterValueLabel(COMMANDER_SYSTEM, life)}
                maxFontSizeMultiplier={1.2}
                style={[themed($localLife), { color: foreground }]}
                numberOfLines={1}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </Animated.View>
  )
}

function CommanderAction({
  testID,
  label,
  text,
  foreground,
  rotationStyle,
  compact,
  emphasized,
  disabled,
  mark,
  markInset,
  onPress,
}: {
  testID: string
  label: string
  text: string
  foreground: string
  rotationStyle?: ViewStyle
  compact?: boolean
  emphasized?: boolean
  disabled?: boolean
  mark?: CommanderAttacker
  markInset?: string
  onPress: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <BoardPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        themed($action),
        emphasized && !mark && { backgroundColor: overlayTint(foreground, 0.18) },
        pressed && !disabled && { backgroundColor: overlayTint(foreground, 0.3) },
        disabled && themed($disabledAction),
      ]}
    >
      <View style={[themed($actionContent), rotationStyle]}>
        {mark ? (
          <PlayerMark
            seatNumber={mark.seatNumber}
            shape={mark.shape}
            color={mark.color}
            insetSwordColor={markInset}
            size={compact ? 56 : 88}
          />
        ) : emphasized ? (
          <Sword size={compact ? 30 : 40} color={foreground} />
        ) : null}
        <Text
          text={text}
          weight="bold"
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={[
            themed(text.length === 1 ? (compact ? $compactGlyph : $glyph) : $actionLabel),
            { color: foreground },
          ]}
        />
      </View>
    </BoardPressable>
  )
}

function zonesRotationStyle(rotation: LifeCardContentRotation): ViewStyle {
  if (rotation === 90) return { flexDirection: "column" }
  if (rotation === -90) return { flexDirection: "column-reverse" }
  return { flexDirection: "row" }
}

function modeAccessibilityLabel(mode: CommanderDamageCardMode) {
  if (mode.kind === "target")
    return translate("board:commander.totalFrom", { damage: mode.total, name: mode.attackerName })
  return translate("board:commander.assigningFrom", { name: mode.playerName })
}

const $overlay: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  ...StyleSheet.absoluteFill,
  zIndex: 8,
  overflow: "hidden",
  borderWidth: 1,
  borderRadius: spacing.lg,
})

const $compactOverlay: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: spacing.md,
})

const $activePlayerOverlay: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.board.background,
  borderWidth: 0,
  borderRadius: 0,
})

const $safeContent: ViewStyle = { flex: 1 }

const $zones: ThemedStyle<ViewStyle> = () => ({ flex: 1 })

const $action: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
})

const $disabledAction: ThemedStyle<ViewStyle> = () => ({ opacity: 0.48 })

const $actionContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.xxxs,
})

const $summary: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: "10%",
  right: "10%",
  top: "30%",
  bottom: "30%",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xxxs,
})

const $total: ThemedStyle<TextStyle> = () => ({ fontSize: 58, lineHeight: 64 })
const $compactTotal: ThemedStyle<TextStyle> = () => ({ fontSize: 42, lineHeight: 46 })
const $incomingTotal: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
const $incoming: ThemedStyle<TextStyle> = () => ({ fontSize: 38, lineHeight: 44, opacity: 0.72 })
const $compactIncoming: ThemedStyle<TextStyle> = () => ({
  fontSize: 28,
  lineHeight: 34,
  opacity: 0.72,
})
const $glyph: ThemedStyle<TextStyle> = () => ({ fontSize: 64, lineHeight: 70 })
const $compactGlyph: ThemedStyle<TextStyle> = () => ({ fontSize: 46, lineHeight: 52 })
const $actionLabel: ThemedStyle<TextStyle> = () => ({ fontSize: 16, lineHeight: 20 })

const $localOverlay: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.transparent,
  borderWidth: 0,
})
const $localTotal: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.xxs,
})
const $attackerChip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: -44 - spacing.xs,
  transform: [{ translateY: -3 }],
  width: 44,
  height: 44,
  borderRadius: 22,
  borderWidth: 2,
  alignItems: "center",
  justifyContent: "center",
})
const $compactAttackerChip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: -32 - spacing.xs,
  transform: [{ translateY: -2 }],
  width: 32,
  height: 32,
  borderRadius: 16,
  borderWidth: 2,
  alignItems: "center",
  justifyContent: "center",
})
const $localLife: ThemedStyle<TextStyle> = ({ spacing }) => ({
  position: "absolute",
  top: "100%",
  marginTop: spacing.xxs,
  fontSize: 18,
  lineHeight: 22,
})
