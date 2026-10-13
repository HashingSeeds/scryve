import { useEffect, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { BoardPressable } from "./BoardPressable"
import { chipRowOrigin, contentFrame, contentInset } from "./CounterChips"
import { overlayTint } from "./LifeControls"
import type {
  LifeCardContentInsets,
  LifeCardContentRotation,
  LifeCardMenuEdge,
} from "./playerCardTypes"
import { Text } from "./Text"

export const CLAIM_ARM_MS = 1000

export type CommanderClaim = {
  claimId: string
  attackerName: string
  delta: number
  onConfirm: () => void
  onDecline: () => void
}

export interface CommanderClaimBannerProps {
  seatNumber: number
  claims: readonly CommanderClaim[]
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  menuEdgeCenter?: LifeCardMenuEdge
  cardSize: { width: number; height: number }
  compact?: boolean
  disabled?: boolean
}

export function CommanderClaimBanner({
  seatNumber,
  claims,
  contentRotation,
  contentInsets,
  menuEdgeCenter,
  cardSize,
  compact,
  disabled,
}: CommanderClaimBannerProps) {
  const {
    themed,
    theme: { colors, spacing },
  } = useAppTheme()
  const claim = claims[0]
  const claimId = claim?.claimId
  const [armedClaimId, setArmedClaimId] = useState<string>()
  useEffect(() => {
    if (!claimId) return
    const timer = setTimeout(() => setArmedClaimId(claimId), CLAIM_ARM_MS)
    return () => clearTimeout(timer)
  }, [claimId])
  if (!claim || cardSize.width === 0 || cardSize.height === 0) return null

  const armed = armedClaimId === claim.claimId
  const inert = !armed || !!disabled
  const damage = Math.abs(claim.delta)
  const more = claims.length - 1
  const origin = chipRowOrigin({ compact, contentRotation, contentInsets, menuEdgeCenter, spacing })
  const gap = compact ? spacing.xxs : spacing.xs
  const ink = colors.board.text
  const actions = [
    { kind: "decline", text: "Decline", onPress: claim.onDecline },
    { kind: "confirm", text: "Confirm", onPress: claim.onConfirm },
  ] as const

  return (
    <View
      testID={`commander-claim-frame-seat-${seatNumber}`}
      pointerEvents="box-none"
      style={[contentFrame(contentRotation, cardSize), $layer]}
    >
      <View
        testID={`commander-claim-banner-seat-${seatNumber}`}
        accessibilityLiveRegion="polite"
        style={[
          themed($banner),
          {
            top: origin.top,
            left: origin.left,
            right: gap + contentInset(contentRotation, contentInsets, "right"),
            backgroundColor: colors.board.background,
          },
        ]}
      >
        <View style={themed($summary)}>
          <Text
            text={`${claim.attackerName} dealt ${damage}`}
            weight="bold"
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={[themed($headline), { color: ink }]}
          />
          {more > 0 ? (
            <Text
              testID={`commander-claim-more-seat-${seatNumber}`}
              text={`${more} more`}
              accessibilityLabel={`${more} more pending`}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={[themed($more), { color: ink }]}
            />
          ) : null}
        </View>
        <View style={themed($actions)}>
          {actions.map(({ kind, text, onPress }) => (
            <BoardPressable
              key={kind}
              testID={`commander-${kind}-seat-${seatNumber}-${claim.claimId}`}
              accessibilityRole="button"
              accessibilityLabel={`${text} ${damage} commander damage from ${claim.attackerName}`}
              accessibilityState={{ disabled: inert }}
              disabled={inert}
              onPress={() => {
                if (armed) onPress()
              }}
              style={({ pressed }) => [
                themed($action),
                kind === "confirm" && { backgroundColor: overlayTint(ink, 0.18) },
                pressed && { backgroundColor: overlayTint(ink, 0.3) },
                inert && $inert,
              ]}
            >
              <Text
                text={text}
                weight="bold"
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={[themed($actionLabel), { color: ink }]}
              />
            </BoardPressable>
          ))}
        </View>
      </View>
    </View>
  )
}

const $layer: ViewStyle = { zIndex: 9 }

const $banner: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "center",
  columnGap: spacing.xs,
  rowGap: spacing.xxxs,
  padding: spacing.xxs,
  paddingLeft: spacing.sm,
  borderRadius: spacing.sm,
})

const $summary: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexShrink: 1,
  alignItems: "baseline",
  gap: spacing.xxs,
})

const $headline: ThemedStyle<TextStyle> = () => ({ flexShrink: 1, fontSize: 15, lineHeight: 20 })

const $more: ThemedStyle<TextStyle> = () => ({ fontSize: 13, lineHeight: 18, opacity: 0.78 })

const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xxs,
})

const $action: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 40,
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
  borderRadius: spacing.xs,
})

const $actionLabel: ThemedStyle<TextStyle> = () => ({ fontSize: 15, lineHeight: 20 })

const $inert: ViewStyle = { opacity: 0.48 }
