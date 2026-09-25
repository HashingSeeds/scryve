import { useEffect } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"

import { MAX_COMMANDER_DAMAGE } from "@/features/game/domain"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

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
  submitLabel: "Done" | "Send"
  mark?: CommanderAttacker
  submitDisabled?: boolean
  onSubmit: () => void
  onCancel?: () => void
}

type PendingClaim = {
  kind: "claim"
  claimId: string
  attackerName: string
  damage: number
  additionalClaims: number
  onConfirm: () => void
  onDecline: () => void
}

export type CommanderDamageCardMode = AssignmentTarget | AssignmentSource | PendingClaim

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
  const controlForeground =
    mode.kind === "target" || (life !== undefined && mode.kind === "claim")
      ? foreground
      : theme.colors.board.text

  return (
    <Animated.View
      testID={`commander-card-mode-seat-${seatNumber}`}
      accessibilityLabel={modeAccessibilityLabel(mode)}
      style={[
        themed($overlay),
        compact && themed($compactOverlay),
        lifeCardContentInsetStyle(contentInsets),
        mode.kind === "target"
          ? {
              borderColor: overlayTint(foreground, 0.28),
              backgroundColor: overlayTint(foreground, 0.04),
            }
          : themed($activePlayerOverlay),
        mode.kind === "source" && mode.mark && { borderColor: mode.mark.color },
        life !== undefined && mode.kind !== "source" && themed($localOverlay),
        entranceStyle,
      ]}
    >
      <View testID={`commander-card-content-seat-${seatNumber}`} style={$safeContent}>
        {mode.kind === "target" ? (
          <View
            testID={`commander-target-seat-${seatNumber}`}
            style={[themed($zones), zonesRotationStyle(contentRotation)]}
          >
            <CommanderAction
              testID={`commander-stage-seat-${seatNumber}--1`}
              label={`Remove one commander damage from seat ${seatNumber}`}
              text="−"
              foreground={controlForeground}
              rotationStyle={rotationStyle}
              compact={compact}
              disabled={mode.total <= 0}
              onPress={() => mode.onChange(-1)}
            />
            <CommanderAction
              testID={`commander-stage-seat-${seatNumber}-1`}
              label={`Add one commander damage to seat ${seatNumber}`}
              text="+"
              foreground={controlForeground}
              rotationStyle={rotationStyle}
              compact={compact}
              disabled={mode.total >= MAX_COMMANDER_DAMAGE}
              onPress={() => mode.onChange(1)}
            />
          </View>
        ) : mode.kind === "claim" ? (
          <View style={[themed($zones), zonesRotationStyle(contentRotation)]}>
            <CommanderAction
              testID={`commander-decline-seat-${seatNumber}-${mode.claimId}`}
              label={`Decline ${mode.damage} commander damage from ${mode.attackerName}`}
              text="Decline"
              foreground={controlForeground}
              rotationStyle={rotationStyle}
              compact={compact}
              onPress={mode.onDecline}
            />
            <CommanderAction
              testID={`commander-confirm-seat-${seatNumber}-${mode.claimId}`}
              label={`Confirm ${mode.damage} commander damage from ${mode.attackerName}`}
              text="Confirm"
              foreground={controlForeground}
              rotationStyle={rotationStyle}
              compact={compact}
              emphasized
              onPress={mode.onConfirm}
            />
          </View>
        ) : (
          <View style={[themed($zones), zonesRotationStyle(contentRotation)]}>
            {mode.onCancel ? (
              <CommanderAction
                testID={`commander-cancel-seat-${seatNumber}`}
                label={`Cancel assigning commander damage from seat ${seatNumber}`}
                text="Cancel"
                foreground={controlForeground}
                rotationStyle={rotationStyle}
                compact={compact}
                onPress={mode.onCancel}
              />
            ) : null}
            <CommanderAction
              testID={`commander-${mode.submitLabel === "Send" ? "send" : "done"}-seat-${seatNumber}`}
              label={`${mode.submitLabel} assigning commander damage from seat ${seatNumber}`}
              text={mode.submitLabel}
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

        {mode.kind !== "source" ? (
          <View
            pointerEvents="none"
            accessible={life !== undefined}
            accessibilityLabel={
              life !== undefined ? `${modeAccessibilityLabel(mode)}, ${life} life` : undefined
            }
            accessibilityLiveRegion={life !== undefined ? "polite" : undefined}
            style={[themed($summary), rotationStyle]}
          >
            {mode.kind === "target" ? (
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
                    text={`${life} life`}
                    maxFontSizeMultiplier={1.2}
                    style={[themed($localLife), { color: foreground }]}
                    numberOfLines={1}
                  />
                ) : null}
              </View>
            ) : mode.kind === "claim" ? (
              <>
                <Text
                  text={`${mode.attackerName} dealt ${mode.damage}`}
                  weight="bold"
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                  style={[themed($headline), { color: controlForeground }]}
                />
                <Text
                  text={
                    mode.additionalClaims > 0
                      ? `Confirm commander damage · ${mode.additionalClaims} more pending`
                      : "Confirm commander damage"
                  }
                  size="xxs"
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                  style={[themed($caption), { color: controlForeground }]}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </View>
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
    <Pressable
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
    </Pressable>
  )
}

function zonesRotationStyle(rotation: LifeCardContentRotation): ViewStyle {
  if (rotation === 90) return { flexDirection: "column" }
  if (rotation === -90) return { flexDirection: "column-reverse" }
  return { flexDirection: "row" }
}

function modeAccessibilityLabel(mode: CommanderDamageCardMode) {
  if (mode.kind === "target") return `${mode.total} commander damage from ${mode.attackerName}`
  if (mode.kind === "claim") return `${mode.attackerName} claims ${mode.damage} commander damage`
  return `Assigning commander damage from ${mode.playerName}`
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
  borderColor: colors.board.text,
  borderWidth: 3,
})

const $safeContent: ViewStyle = { flex: 1 }

const $zones: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
})

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
const $headline: ThemedStyle<TextStyle> = () => ({
  fontSize: 16,
  lineHeight: 20,
  textAlign: "center",
})
const $caption: ThemedStyle<TextStyle> = () => ({ opacity: 0.78, textAlign: "center" })

const $localOverlay: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.transparent,
  borderWidth: 0,
})
const $localTotal: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.xxs,
})
const $attackerChip: ThemedStyle<ViewStyle> = () => ({
  transform: [{ translateY: -3 }],
  width: 44,
  height: 44,
  borderRadius: 22,
  borderWidth: 2,
  alignItems: "center",
  justifyContent: "center",
})
const $compactAttackerChip: ThemedStyle<ViewStyle> = () => ({
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
