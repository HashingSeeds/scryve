import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"
import Svg, { Path, Rect } from "react-native-svg"

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
  armedAction?: "send" | "done"
  stagedAgainstOwner?: number
  /** Space the card reserved for the board, already mapped onto the board's own axes. */
  maxSize?: { width: number; height: number }
  compact?: boolean
  foreground: string
  seatNumber: number
  onPressSword?: () => void
  onStage?: (step: number) => void
  style?: StyleProp<ViewStyle>
}

export const commanderCellTestId = (seatNumber: number, playerId: PlayerId) =>
  `commander-cell-seat-${seatNumber}-${playerId}`
export const commanderSwordTestId = (seatNumber: number) => `commander-sword-seat-${seatNumber}`
export const commanderStageTestId = (seatNumber: number, step: number) =>
  `commander-stage-seat-${seatNumber}-${step}`

function Sword({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2.5 L14.1 6.4 V14.4 H9.9 V6.4 Z" fill={color} />
      <Rect x={6.8} y={14.6} width={10.4} height={1.9} rx={0.9} fill={color} />
      <Rect x={11.05} y={16.9} width={1.9} height={4.6} rx={0.9} fill={color} />
    </Svg>
  )
}

export function CommanderDamageBoard({
  ownerPlayerId,
  seats,
  rows,
  columns,
  contentRotation,
  incoming,
  armedPlayerId,
  armedAction = "done",
  stagedAgainstOwner = 0,
  maxSize,
  compact,
  foreground,
  seatNumber,
  onPressSword,
  onStage,
  style,
}: CommanderDamageBoardProps) {
  const { themed } = useAppTheme()
  const grid = commanderBoardGrid({ seats, rows, columns, rotation: contentRotation })
  const size = commanderCellSize({
    rows: grid.rows,
    columns: grid.columns,
    gap: CELL_GAP,
    preferred: compact ? COMMANDER_COMPACT_CELL_SIZE : COMMANDER_CELL_SIZE,
    maxSize,
  })
  const armed = armedPlayerId === ownerPlayerId
  const targetable = Boolean(armedPlayerId) && armedPlayerId !== ownerPlayerId

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
                      : armedAction === "send"
                        ? `Send commander damage from seat ${seatNumber}`
                        : `Done assigning commander damage from seat ${seatNumber}`
                  }
                  onPress={onPressSword}
                  hitSlop={7}
                  style={[
                    themed($cell),
                    { width: size, height: size, borderColor: overlayTint(foreground, 0.4) },
                    armed && { backgroundColor: overlayTint(foreground, 0.32) },
                  ]}
                >
                  <Sword size={size * 0.72} color={foreground} />
                </Pressable>
              )

            const total = incoming[playerId] ?? 0
            const attacker = targetable && playerId === armedPlayerId
            const staged = attacker ? stagedAgainstOwner : 0
            const projected = total + staged
            const lethal = projected >= COMMANDER_LETHAL_DAMAGE
            return (
              <View key={columnIndex} style={themed($cellGroup)}>
                {attacker ? (
                  <Pressable
                    testID={commanderStageTestId(seatNumber, -1)}
                    accessibilityRole="button"
                    accessibilityLabel={`One less commander damage to seat ${seatNumber}`}
                    onPress={() => onStage?.(-1)}
                    hitSlop={8}
                    style={[themed($step), { borderColor: overlayTint(foreground, 0.4) }]}
                  >
                    <Text text="−" size="xxs" weight="bold" style={{ color: foreground }} />
                  </Pressable>
                ) : null}
                <View
                  testID={commanderCellTestId(seatNumber, playerId)}
                  style={[
                    themed($cell),
                    { width: size, height: size, borderColor: overlayTint(foreground, 0.4) },
                    projected === 0 && staged === 0 && themed($cellIdle),
                    (staged !== 0 || lethal) && { backgroundColor: overlayTint(foreground, 0.32) },
                  ]}
                >
                  <Text
                    text={String(projected)}
                    weight={lethal ? "bold" : "medium"}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                    style={[
                      themed($cellText),
                      { color: foreground, fontSize: Math.max(9, Math.round(size * 0.44)) },
                    ]}
                  />
                </View>
                {attacker ? (
                  <Pressable
                    testID={commanderStageTestId(seatNumber, 1)}
                    accessibilityRole="button"
                    accessibilityLabel={`One more commander damage to seat ${seatNumber}`}
                    onPress={() => onStage?.(1)}
                    hitSlop={8}
                    style={[themed($step), { borderColor: overlayTint(foreground, 0.4) }]}
                  >
                    <Text text="+" size="xxs" weight="bold" style={{ color: foreground }} />
                  </Pressable>
                ) : null}
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

const $cellGroup: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
})

const $cell: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderRadius: spacing.xs,
})

const $cellIdle: ThemedStyle<ViewStyle> = () => ({ opacity: 0.35 })

const $cellText: ThemedStyle<TextStyle> = () => ({
  textAlign: "center",
  fontVariant: ["tabular-nums"],
})

const $step: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: 28,
  height: 28,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderRadius: spacing.xxs,
  marginHorizontal: spacing.xxxs,
})
