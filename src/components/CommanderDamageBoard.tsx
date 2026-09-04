import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { COMMANDER_LETHAL_DAMAGE } from "@/features/game/domain"
import type { PlayerId } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import {
  COMMANDER_CELL_SIZE,
  COMMANDER_COMPACT_CELL_SIZE,
  commanderBoardGrid,
  commanderCellSize,
  type CommanderBoardSeat,
} from "./commanderDamageLayout"
import { overlayTint } from "./LifeControls"
import type { LifeCardContentRotation } from "./playerCardTypes"
import { Sword } from "./Sword"
import { Text } from "./Text"

const CELL_GAP = 2

export interface CommanderDamageBoardProps {
  ownerPlayerId: PlayerId
  seats: readonly CommanderBoardSeat[]
  rows: number
  columns: number
  contentRotation: LifeCardContentRotation
  incoming: Record<PlayerId, number>
  armedPlayerId?: PlayerId | null
  /** Space the card reserved for the board, already mapped onto the board's own axes. */
  maxSize?: { width: number; height: number }
  compact?: boolean
  expanded?: boolean
  foreground: string
  seatNumber: number
  onPressSword?: () => void
  style?: StyleProp<ViewStyle>
}

export const commanderCellTestId = (seatNumber: number, playerId: PlayerId) =>
  `commander-cell-seat-${seatNumber}-${playerId}`
export const commanderSwordTestId = (seatNumber: number) => `commander-sword-seat-${seatNumber}`
export const commanderStageTestId = (seatNumber: number, step: number) =>
  `commander-stage-seat-${seatNumber}-${step}`

export function CommanderDamageBoard({
  ownerPlayerId,
  seats,
  rows,
  columns,
  contentRotation,
  incoming,
  armedPlayerId,
  maxSize,
  compact,
  expanded,
  foreground,
  seatNumber,
  onPressSword,
  style,
}: CommanderDamageBoardProps) {
  const { themed } = useAppTheme()
  const grid = commanderBoardGrid({ seats, rows, columns })
  const seatedGlyphRotation: ViewStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined
  const size = commanderCellSize({
    rows: grid.rows,
    columns: grid.columns,
    gap: CELL_GAP,
    preferred: expanded
      ? compact
        ? 88
        : 120
      : compact
        ? COMMANDER_COMPACT_CELL_SIZE
        : COMMANDER_CELL_SIZE,
    maxSize,
  })
  const armed = armedPlayerId === ownerPlayerId

  return (
    <View
      testID={`commander-board-seat-${seatNumber}`}
      accessibilityLabel={`Commander damage taken by seat ${seatNumber}`}
      style={[themed($board), style]}
    >
      {grid.cells.map((cellRow, rowIndex) => (
        <View key={rowIndex} style={themed($row)}>
          {cellRow.map((playerId, columnIndex) => {
            if (!playerId) return <View key={columnIndex} style={{ width: size, height: size }} />

            if (playerId === ownerPlayerId)
              return (
                <Pressable
                  key={columnIndex}
                  testID={commanderSwordTestId(seatNumber)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: armed }}
                  accessibilityLabel={
                    !armed
                      ? `Assign commander damage from seat ${seatNumber}`
                      : `Assigning commander damage from seat ${seatNumber}`
                  }
                  onPress={onPressSword}
                  hitSlop={7}
                  style={[
                    themed($cell),
                    { width: size, height: size, borderColor: overlayTint(foreground, 0.4) },
                    armed && { backgroundColor: overlayTint(foreground, 0.32) },
                  ]}
                >
                  <View style={seatedGlyphRotation}>
                    <Sword size={size * 0.72} color={foreground} />
                  </View>
                </Pressable>
              )

            const total = incoming[playerId] ?? 0
            const lethal = total >= COMMANDER_LETHAL_DAMAGE
            const fontSize = Math.max(9, Math.round(size * 0.6))
            return (
              <View
                key={columnIndex}
                testID={commanderCellTestId(seatNumber, playerId)}
                style={[
                  themed($cell),
                  { width: size, height: size, borderColor: overlayTint(foreground, 0.4) },
                  total === 0 && themed($cellIdle),
                  lethal && { backgroundColor: overlayTint(foreground, 0.32) },
                ]}
              >
                <Text
                  text={String(total)}
                  weight={lethal ? "bold" : "medium"}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                  style={[
                    themed($cellText),
                    { color: foreground, fontSize, lineHeight: Math.round(fontSize * 1.1) },
                    seatedGlyphRotation,
                  ]}
                />
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const $board: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxxs,
  alignItems: "center",
})

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xxxs,
  alignItems: "center",
})

const $cell: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderRadius: spacing.xs,
})

const $cellIdle: ThemedStyle<ViewStyle> = () => ({ opacity: 0.5 })

const $cellText: ThemedStyle<TextStyle> = () => ({
  textAlign: "center",
  fontVariant: ["tabular-nums"],
})
