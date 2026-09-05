import { useEffect } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"

import { MAX_COMMANDER_DAMAGE } from "@/features/game/domain"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { overlayTint } from "./LifeControls"
import type { LifeCardContentRotation } from "./playerCardTypes"
import { Sword } from "./Sword"
import { Text } from "./Text"

type AssignmentTarget = {
  kind: "target"
  attackerName: string
  total: number
  onChange: (step: -1 | 1) => void
}

type AssignmentSource = {
  kind: "source"
  playerName: string
  submitLabel: "Done" | "Send"
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
  compact?: boolean
  mode: CommanderDamageCardMode
}

export function CommanderDamageCardControls({
  seatNumber,
  foreground,
  contentRotation,
  compact,
  mode,
}: CommanderDamageCardControlsProps) {
  const { themed } = useAppTheme()
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
  const controlForeground = mode.kind === "target" ? foreground : "#FFFFFF"

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
        entranceStyle,
      ]}
    >
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
            showSword
            onPress={mode.onSubmit}
          />
        </View>
      )}

      {mode.kind !== "source" ? (
        <View pointerEvents="none" style={[themed($summary), rotationStyle]}>
          {mode.kind === "target" ? (
            <View style={themed($incomingTotal)}>
              <Text
                text="↓"
                weight="bold"
                maxFontSizeMultiplier={1.2}
                style={[themed(compact ? $compactIncoming : $incoming), { color: foreground }]}
              />
              <Text
                text={String(mode.total)}
                weight="bold"
                maxFontSizeMultiplier={1.2}
                style={[themed(compact ? $compactTotal : $total), { color: foreground }]}
              />
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
  showSword,
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
  showSword?: boolean
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
        emphasized && { backgroundColor: overlayTint(foreground, 0.18) },
        pressed && !disabled && { backgroundColor: overlayTint(foreground, 0.3) },
        disabled && themed($disabledAction),
      ]}
    >
      <View style={[themed($actionContent), rotationStyle]}>
        {showSword ? <Sword size={compact ? 30 : 40} color={foreground} /> : null}
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

const $activePlayerOverlay: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "#050505",
  borderColor: "#FFFFFF",
  borderWidth: 3,
})

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
