import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { COMMANDER_LETHAL_DAMAGE } from "@/features/game/domain"
import type { GamePlayer, PlayerId } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import type { CommanderBoardSeat } from "./commanderDamageLayout"
import { overlayTint } from "./LifeControls"
import {
  cornerOffset,
  type LifeCardEdge,
  type LifeCardScreenEdges,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
} from "./playerCardTypes"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"

const DISC_SIZE = 24
const COMPACT_DISC_SIZE = 20

export interface CommanderStripProps {
  seatNumber: number
  identity: string
  ownerPlayerId: PlayerId
  players: readonly GamePlayer[]
  seats: readonly CommanderBoardSeat[]
  incoming: Record<PlayerId, number>
  foreground: string
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  screenEdges?: LifeCardScreenEdges
  compact?: boolean
  open: boolean
  inspectDisabled?: boolean
  onToggle: () => void
}

export function CommanderStrip({
  seatNumber,
  identity,
  ownerPlayerId,
  players,
  seats,
  incoming,
  foreground,
  contentRotation,
  contentInsets,
  screenEdges,
  compact,
  open,
  inspectDisabled,
  onToggle,
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
  if (dealt.length === 0) return null

  return (
    <View
      testID={`commander-strip-seat-${seatNumber}`}
      style={[
        themed($strip),
        stripEdge(contentRotation, spacing.xs, contentInsets, screenEdges),
        {
          flexDirection: stripDirection(contentRotation),
        },
      ]}
    >
      <View
        testID={`commander-map-seat-${seatNumber}`}
        style={[themed($map), open && { backgroundColor: overlayTint(foreground, 0.24) }]}
      >
        {boardRows.map((row, rowIndex) => (
          <View key={rowIndex} style={themed($mapRow)}>
            {row.map(({ playerId }) => {
              const playerIndex = players.findIndex(({ id }) => id === playerId)
              const player = players[playerIndex]
              if (!player) return null
              const size = { width: disc, height: disc }
              if (playerId === ownerPlayerId)
                return (
                  <View
                    key={playerId}
                    testID={`commander-own-seat-${seatNumber}`}
                    style={[themed($ownSeat), size]}
                  >
                    <PlayerMark
                      seatNumber={playerIndex + 1}
                      shape={player.shape}
                      color={foreground}
                      rotation={contentRotation}
                      size={Math.round(disc * 0.6)}
                    />
                  </View>
                )
              const total = incoming[playerId] ?? 0
              const ink = accessibleForeground(player.color)
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
                    size,
                    { backgroundColor: player.color, borderColor: overlayTint(foreground, 0.5) },
                    total === 0 && themed($idleDisc),
                    total >= COMMANDER_LETHAL_DAMAGE && [
                      themed($lethalDisc),
                      { borderColor: foreground },
                    ],
                    pressed && { opacity: 0.72 },
                  ]}
                >
                  {total > 0 ? (
                    <Text
                      text={String(total)}
                      weight="bold"
                      maxFontSizeMultiplier={1}
                      style={[
                        themed(compact ? $compactCount : $count),
                        { color: ink },
                        glyphRotation,
                      ]}
                    />
                  ) : (
                    <PlayerMark
                      seatNumber={playerIndex + 1}
                      shape={player.shape}
                      color={ink}
                      rotation={contentRotation}
                      size={Math.round(disc * 0.5)}
                    />
                  )}
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
    </View>
  )
}

function stripDirection(rotation: LifeCardContentRotation): ViewStyle["flexDirection"] {
  if (rotation === 90) return "column"
  if (rotation === -90) return "column-reverse"
  if (rotation === 180) return "row-reverse"
  return "row"
}

const STRIP_CORNER = {
  0: ["bottom", "right", "left"],
  180: ["top", "left", "right"],
  90: ["left", "bottom", "top"],
  [-90]: ["right", "top", "bottom"],
} as const satisfies Record<LifeCardContentRotation, readonly LifeCardEdge[]>

function stripEdge(
  rotation: LifeCardContentRotation,
  gap: number,
  insets?: LifeCardContentInsets,
  screenEdges?: LifeCardScreenEdges,
): ViewStyle {
  const [edge, side, start] = STRIP_CORNER[rotation]
  return {
    [edge]: cornerOffset(gap, edge, side, insets, screenEdges),
    [side]: cornerOffset(gap, side, edge, insets, screenEdges),
    [start]: gap + (insets?.[start] ?? 0),
  }
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

const $idleDisc: ThemedStyle<ViewStyle> = () => ({ opacity: 0.45 })

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

const $ownSeat: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
  opacity: 0.35,
})
