import { useEffect, useRef, useState } from "react"
import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform, View } from "react-native"

import type { LifeDelta } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import { LifeControls, overlayTint } from "./LifeControls"
import type { LifeCardContentRotation } from "./playerCardTypes"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"

const DELTA_VISIBLE_MS = 1800

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
  const markStyle = getPlayerMarkPlacement(contentRotation, markSize, spacing.xs)

  const [recentDelta, setRecentDelta] = useState(0)
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
      <View pointerEvents="none" style={themed($content)}>
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
        <View style={themed($readout)}>
          <Text
            testID={`life-total-seat-${seatNumber}`}
            text={String(life)}
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
          <Text
            testID={`life-delta-seat-${seatNumber}`}
            text={recentDelta > 0 ? `+${recentDelta}` : String(recentDelta)}
            weight="bold"
            size="xs"
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={[
              themed($delta),
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
      />
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
})

const $readout: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignSelf: "stretch",
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
  edgeInset: number,
): ViewStyle {
  const centeredOffset = -size / 2
  if (rotation === 90) return { left: edgeInset, top: "50%", marginTop: centeredOffset }
  if (rotation === -90) return { right: edgeInset, top: "50%", marginTop: centeredOffset }
  if (rotation === 180) return { top: edgeInset, left: "50%", marginLeft: centeredOffset }
  return { bottom: edgeInset, left: "50%", marginLeft: centeredOffset }
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

const $delta: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginTop: spacing.xxs,
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.xxxs,
  borderRadius: spacing.sm,
  overflow: "hidden",
  textAlign: "center",
  fontVariant: ["tabular-nums"],
})

const $deltaIdle: ThemedStyle<TextStyle> = () => ({ opacity: 0 })
const $deltaActive: ThemedStyle<TextStyle> = () => ({ opacity: 1 })

const $disabledCard: ThemedStyle<ViewStyle> = () => ({ opacity: 0.72 })
const $status: ThemedStyle<TextStyle> = () => ({ textAlign: "center", opacity: 0.9 })
