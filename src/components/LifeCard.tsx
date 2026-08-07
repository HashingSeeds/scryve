import { useEffect, useRef, useState } from "react"
import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from "react-native"

import { MAX_LIFE_DELTA } from "@/features/game/domain"
import type { LifeDelta } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import { Button } from "./Button"
import { DialogCard, $dialogActions, $dialogButton } from "./DialogCard"
import { LifeControls, overlayTint } from "./LifeControls"
import type { LifeCardContentRotation } from "./playerCardTypes"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"
import { TextField } from "./TextField"

const DELTA_VISIBLE_MS = 1800
type LifeEditMode = "add" | "subtract" | "set"

export type { LifeCardContentRotation } from "./playerCardTypes"

export interface LifeCardProps {
  playerName: string
  seatNumber: number
  life: number
  color: string
  compact?: boolean
  contentRotation?: LifeCardContentRotation
  lifeFontSize?: number
  disabled?: boolean
  ownership?: "owned" | "unowned" | "disabled"
  pendingCount?: number
  onChange: (delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
}

export function LifeCard({
  playerName,
  seatNumber,
  life,
  color,
  compact,
  contentRotation = 0,
  lifeFontSize,
  disabled,
  ownership,
  pendingCount = 0,
  onChange,
  style,
}: LifeCardProps) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const foreground = accessibleForeground(color)
  const contentRotationStyle: TextStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined
  const displayName = playerName.trim() || "unnamed player"
  const identity = `Seat ${seatNumber}, ${displayName}`
  const markSize = compact ? 36 : 44
  const lifeTargetRadius = compact ? 42 : 58
  const cardPadding = compact ? spacing.xxs : spacing.xs
  const markStyle = getPlayerMarkPlacement(
    contentRotation,
    markSize,
    lifeTargetRadius + spacing.xs,
    cardPadding,
  )

  const [recentDelta, setRecentDelta] = useState(0)
  const [editMode, setEditMode] = useState<LifeEditMode | null>(null)
  const [editValue, setEditValue] = useState("")
  const previousLife = useRef(life)
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const difference = life - previousLife.current
    previousLife.current = life
    if (difference === 0) return
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(`${identity}, now ${life} life`)
    }
    setRecentDelta((current) => current + difference)
    if (deltaTimer.current) clearTimeout(deltaTimer.current)
    deltaTimer.current = setTimeout(() => setRecentDelta(0), DELTA_VISIBLE_MS)
  }, [identity, life])
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
  const parsedValue = Number(editValue)
  const isWholeNumber = editValue.trim() !== "" && Number.isInteger(parsedValue)
  const requestedDelta =
    editMode === "add" ? parsedValue : editMode === "subtract" ? -parsedValue : parsedValue - life
  const validEdit =
    isWholeNumber &&
    (editMode === "set" || parsedValue > 0) &&
    (requestedDelta === 0 || (Math.abs(requestedDelta) <= MAX_LIFE_DELTA && requestedDelta !== 0))

  function openEditor(mode: LifeEditMode) {
    setEditMode(mode)
    setEditValue(mode === "set" ? String(life) : "")
  }

  function closeEditor() {
    setEditMode(null)
    setEditValue("")
  }

  function applyEdit() {
    if (!validEdit) return
    if (requestedDelta !== 0) onChange(requestedDelta)
    closeEditor()
  }

  const editTitle =
    editMode === "add" ? "Add life" : editMode === "subtract" ? "Subtract life" : "Set life"

  return (
    <View
      testID={`life-card-seat-${seatNumber}`}
      accessibilityLabel={`${identity}${ownershipLabel ? `, ${ownershipLabel}` : ""}`}
      style={[
        themed($card),
        compact && themed($compactCard),
        ownership === "disabled" && themed($disabledCard),
        { backgroundColor: color },
        style,
      ]}
    >
      <PlayerMark
        seatNumber={seatNumber}
        color={foreground}
        rotation={contentRotation}
        spinning={ownership === "owned"}
        size={markSize}
        style={[themed($mark), markStyle]}
      />
      <View pointerEvents="box-none" style={themed($content)}>
        {statusLabel ? (
          <Text
            text={statusLabel}
            weight="bold"
            size="xxs"
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={[
              themed($status),
              contentRotation === 180 && { marginTop: markSize },
              contentRotationStyle,
              { color: foreground },
            ]}
          />
        ) : null}
        <View
          testID={`life-readout-seat-${seatNumber}`}
          pointerEvents="box-none"
          style={themed($readout)}
        >
          <Pressable
            testID={`life-total-button-seat-${seatNumber}`}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!disabled }}
            accessibilityLabel={`${identity}, ${life} life`}
            accessibilityHint="Long press to set life to a new number"
            delayLongPress={450}
            onLongPress={() => openEditor("set")}
            style={({ pressed }) => [
              themed(compact ? $compactLifeButton : $lifeButton),
              pressed && !disabled && { backgroundColor: overlayTint(foreground, 0.14) },
            ]}
          >
            <Text
              testID={`life-total-seat-${seatNumber}`}
              text={String(life)}
              accessible={false}
              accessibilityLabel={`${identity}, ${life} life`}
              accessibilityLiveRegion="polite"
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={[
                themed(compact ? $compactLife : $life),
                lifeFontSize
                  ? { fontSize: lifeFontSize, lineHeight: Math.ceil(lifeFontSize * 1.1) }
                  : null,
                contentRotationStyle,
                { color: foreground },
              ]}
            />
          </Pressable>
          <Text
            testID={`life-delta-seat-${seatNumber}`}
            text={recentDelta > 0 ? `+${recentDelta}` : String(recentDelta)}
            weight="bold"
            size="xs"
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={[
              themed($delta),
              themed(compact ? $compactDeltaPosition : $deltaPosition),
              recentDelta === 0 ? themed($deltaIdle) : themed($deltaActive),
              contentRotationStyle,
              { color: foreground, backgroundColor: overlayTint(foreground, 0.16) },
            ]}
          />
        </View>
      </View>
      <LifeControls
        playerName={displayName}
        seatNumber={seatNumber}
        disabled={disabled}
        contrastCheckedForeground={foreground}
        compact={compact}
        contentRotation={contentRotation}
        onChange={onChange}
        onLongChange={(direction) => openEditor(direction > 0 ? "add" : "subtract")}
      />
      {editMode ? (
        <DialogCard
          visible
          onClose={closeEditor}
          backdropTestID={`life-editor-backdrop-seat-${seatNumber}`}
          backdropAccessibilityLabel="Cancel life edit"
          dialogTestID={`life-editor-dialog-seat-${seatNumber}`}
          accessibilityViewIsModal
        >
          <Text text={editTitle} preset="subheading" style={themed($dialogTitle)} />
          <TextField
            testID={`life-editor-input-seat-${seatNumber}`}
            autoFocus
            selectTextOnFocus
            label={editMode === "set" ? "New life total" : "Amount"}
            value={editValue}
            keyboardType={editMode === "set" ? "numbers-and-punctuation" : "number-pad"}
            returnKeyType="done"
            status={editValue && !validEdit ? "error" : undefined}
            helper={
              editValue && !validEdit
                ? editMode === "set"
                  ? `Enter a whole number within ${MAX_LIFE_DELTA} of the current total.`
                  : `Enter a whole number from 1 to ${MAX_LIFE_DELTA}.`
                : undefined
            }
            onChangeText={setEditValue}
            onSubmitEditing={applyEdit}
          />
          <View style={themed($dialogActions)}>
            <Button text="Cancel" style={themed($dialogButton)} onPress={closeEditor} />
            <Button
              testID={`life-editor-apply-seat-${seatNumber}`}
              text={editMode === "set" ? "Set life" : editTitle}
              preset="reversed"
              disabled={!validEdit}
              style={themed($dialogButton)}
              onPress={applyEdit}
            />
          </View>
        </DialogCard>
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
  ...StyleSheet.absoluteFillObject,
  alignItems: "center",
  justifyContent: "center",
})

const $compactCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.xxs,
  borderRadius: spacing.md,
})

const $mark: ThemedStyle<ViewStyle> = () => ({ position: "absolute", zIndex: 2 })

export function getPlayerMarkPlacement(
  rotation: LifeCardContentRotation,
  size: number,
  distanceFromLifeCenter: number,
  cardPadding = 0,
): ViewStyle {
  const centeredOffset = -size / 2 + cardPadding
  const directionalOffset = distanceFromLifeCenter + cardPadding
  if (rotation === 90)
    return {
      left: "50%",
      marginLeft: directionalOffset,
      top: "50%",
      marginTop: centeredOffset,
    }
  if (rotation === -90)
    return {
      right: "50%",
      marginRight: directionalOffset,
      top: "50%",
      marginTop: centeredOffset,
    }
  if (rotation === 180)
    return {
      top: "50%",
      marginTop: directionalOffset,
      left: "50%",
      marginLeft: centeredOffset,
    }
  return {
    bottom: "50%",
    marginBottom: directionalOffset,
    left: "50%",
    marginLeft: centeredOffset,
  }
}

const $life: ThemedStyle<TextStyle> = () => ({
  width: "100%",
  fontSize: 60,
  lineHeight: 66,
  textAlign: "center",
  fontVariant: ["tabular-nums"],
})

const $compactLife: ThemedStyle<TextStyle> = () => ({
  width: "100%",
  fontSize: 42,
  lineHeight: 48,
  textAlign: "center",
  fontVariant: ["tabular-nums"],
})

const $lifeButton: ThemedStyle<ViewStyle> = () => ({
  width: 116,
  height: 116,
  borderRadius: 58,
  alignItems: "center",
  justifyContent: "center",
})

const $compactLifeButton: ThemedStyle<ViewStyle> = () => ({
  width: 84,
  height: 84,
  borderRadius: 42,
  alignItems: "center",
  justifyContent: "center",
})

const $delta: ThemedStyle<TextStyle> = ({ spacing }) => ({
  position: "absolute",
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.xxxs,
  borderRadius: spacing.sm,
  overflow: "hidden",
  textAlign: "center",
  fontVariant: ["tabular-nums"],
})

const $deltaPosition: ThemedStyle<TextStyle> = ({ spacing }) => ({
  top: "50%",
  marginTop: 58 + spacing.xxs,
})

const $compactDeltaPosition: ThemedStyle<TextStyle> = ({ spacing }) => ({
  top: "50%",
  marginTop: 42 + spacing.xxs,
})

const $deltaIdle: ThemedStyle<TextStyle> = () => ({ opacity: 0 })
const $deltaActive: ThemedStyle<TextStyle> = () => ({ opacity: 1 })

const $disabledCard: ThemedStyle<ViewStyle> = () => ({ opacity: 0.72 })
const $status: ThemedStyle<TextStyle> = () => ({ textAlign: "center", opacity: 0.9 })
const $dialogTitle: ThemedStyle<TextStyle> = () => ({ textAlign: "center" })
