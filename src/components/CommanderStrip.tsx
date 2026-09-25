import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { COMMANDER_LETHAL_DAMAGE } from "@/features/game/domain"
import type { GamePlayer, PlayerId } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import type { CommanderBoardSeat } from "./commanderDamageLayout"
import { overlayTint } from "./LifeControls"
import type { LifeCardContentRotation } from "./playerCardTypes"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

const DISC_SIZE = 24
const COMPACT_DISC_SIZE = 20
const SWORD_SIZE = 36

export interface CommanderStripProps {
  seatNumber: number
  identity: string
  ownerPlayerId: PlayerId
  players: readonly GamePlayer[]
  seats: readonly CommanderBoardSeat[]
  incoming: Record<PlayerId, number>
  shape?: PlayerMarkShape
  color: string
  foreground: string
  contentRotation: LifeCardContentRotation
  compact?: boolean
  open: boolean
  disabled?: boolean
  inspectDisabled?: boolean
  onToggle: () => void
  onPressSword: () => void
}

export function CommanderStrip({
  seatNumber,
  identity,
  ownerPlayerId,
  players,
  seats,
  incoming,
  shape,
  color,
  foreground,
  contentRotation,
  compact,
  open,
  disabled,
  inspectDisabled,
  onToggle,
  onPressSword,
}: CommanderStripProps) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const disc = compact ? COMPACT_DISC_SIZE : DISC_SIZE
  const glyphRotation: ViewStyle = { transform: [{ rotate: `${contentRotation}deg` }] }
  const dealt = players.filter(({ id }) => id !== ownerPlayerId && (incoming[id] ?? 0) > 0)
  const boardRows = Array.from(new Set(seats.map(({ row }) => row)))
    .sort((a, b) => a - b)
    .map((row) => seats.filter((seat) => seat.row === row).sort((a, b) => a.column - b.column))
  const sword = (size: number) => (
    <Pressable
      key={ownerPlayerId}
      testID={`commander-mark-seat-${seatNumber}`}
      accessibilityRole="button"
      accessibilityLabel={`Assign commander damage from ${identity}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPressSword}
      style={({ pressed }) => [
        themed($sword),
        { width: size, height: size },
        pressed && { opacity: 0.72 },
      ]}
    >
      <PlayerMark
        seatNumber={seatNumber}
        shape={shape}
        color={foreground}
        rotation={contentRotation}
        insetSwordColor={color}
        size={size}
      />
    </Pressable>
  )

  return (
    <View
      testID={`commander-strip-seat-${seatNumber}`}
      style={[
        themed($strip),
        stripEdge(contentRotation, spacing.xs),
        { flexDirection: stripDirection(contentRotation) },
      ]}
    >
      {dealt.length === 0 ? (
        sword(SWORD_SIZE)
      ) : (
        <View
          testID={`commander-map-seat-${seatNumber}`}
          style={[themed($map), open && { backgroundColor: overlayTint(foreground, 0.24) }]}
        >
          {boardRows.map((row, rowIndex) => (
            <View key={rowIndex} style={themed($mapRow)}>
              {row.map(({ playerId }) => {
                if (playerId === ownerPlayerId) return sword(disc)
                const player = players.find(({ id }) => id === playerId)
                const total = incoming[playerId] ?? 0
                if (!player || total === 0)
                  return <View key={playerId} style={{ width: disc, height: disc }} />
                return (
                  <Pressable
                    key={playerId}
                    testID={`commander-pip-seat-${seatNumber}-${playerId}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${open ? "Close" : "Show"} commander damage for ${identity}, ${total} from ${player.name}`}
                    accessibilityState={{ expanded: open, disabled: !!inspectDisabled }}
                    disabled={inspectDisabled}
                    hitSlop={2}
                    onPress={onToggle}
                    style={({ pressed }) => [
                      themed($disc),
                      {
                        width: disc,
                        height: disc,
                        backgroundColor: player.color,
                        borderColor: overlayTint(foreground, 0.5),
                      },
                      total >= COMMANDER_LETHAL_DAMAGE && [
                        themed($lethalDisc),
                        { borderColor: foreground },
                      ],
                      pressed && { opacity: 0.72 },
                    ]}
                  >
                    <Text
                      text={String(total)}
                      weight="bold"
                      maxFontSizeMultiplier={1}
                      style={[
                        themed(compact ? $compactCount : $count),
                        { color: accessibleForeground(player.color) },
                        glyphRotation,
                      ]}
                    />
                  </Pressable>
                )
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function stripDirection(rotation: LifeCardContentRotation): ViewStyle["flexDirection"] {
  if (rotation === 90) return "column"
  if (rotation === -90) return "column-reverse"
  if (rotation === 180) return "row-reverse"
  return "row"
}

function stripEdge(rotation: LifeCardContentRotation, inset: number): ViewStyle {
  if (rotation === 90) return { left: inset, top: inset, bottom: inset }
  if (rotation === -90) return { right: inset, top: inset, bottom: inset }
  if (rotation === 180) return { top: inset, left: inset, right: inset }
  return { bottom: inset, left: inset, right: inset }
}

const $strip: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  zIndex: 10,
  justifyContent: "flex-end",
  alignItems: "center",
})

const $map: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxxs,
  padding: spacing.xxs,
  borderRadius: spacing.xs,
})

const $mapRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.xxxs,
})

const $disc: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 999,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
})

const $lethalDisc: ThemedStyle<ViewStyle> = () => ({ borderWidth: 2 })

const $count: ThemedStyle<TextStyle> = () => ({
  fontSize: 13,
  lineHeight: 16,
  fontVariant: ["tabular-nums"],
})

const $compactCount: ThemedStyle<TextStyle> = () => ({
  fontSize: 11,
  lineHeight: 14,
  fontVariant: ["tabular-nums"],
})

const $sword: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
})
