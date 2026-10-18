import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, useWindowDimensions, View } from "react-native"

import {
  swapSeats,
  type PlayerGridLayoutVariant,
  type SeatOrder,
} from "@/features/game/playerLayouts"
import type { GamePlayer } from "@/features/game/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import { getPlayerGridLayout, getPlayerGridRowFlex, getPlayerGridRows } from "./playerGridGeometry"
import { Text } from "./Text"

export function SeatArrangement({
  players,
  layoutVariant,
  seatOrder,
  testID = "seat-arrangement",
  onChange,
}: {
  players: readonly Pick<GamePlayer, "id" | "name" | "color">[]
  layoutVariant: PlayerGridLayoutVariant
  seatOrder: SeatOrder | undefined
  testID?: string
  onChange: (seatOrder: SeatOrder) => void
}) {
  const { themed } = useAppTheme()
  const { width, height } = useWindowDimensions()
  const [pickedSlot, setPickedSlot] = useState<number>()
  const layout = getPlayerGridLayout({ playerCount: players.length, width, height, layoutVariant })
  const rows = getPlayerGridRows(players.length, layout)
  const aspectRatio = width / height
  const mapWidth = Math.min(Math.min(260, height * 0.3) * aspectRatio, width - 96, 320)

  function pressSlot(slot: number) {
    if (pickedSlot === undefined) return setPickedSlot(slot)
    if (pickedSlot !== slot) onChange(swapSeats(seatOrder, players.length, pickedSlot, slot))
    setPickedSlot(undefined)
  }

  return (
    <View testID={testID} style={[themed($map), { width: mapWidth, aspectRatio }]}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[themed($row), { flex: getPlayerGridRowFlex(row, layout) }]}>
          {row.map((slot, columnIndex) => {
            if (slot === null) return <View key={`empty-${columnIndex}`} style={$cell} />
            const player = players[seatOrder?.[slot] ?? slot]
            const picked = pickedSlot === slot
            const foreground = accessibleForeground(player.color)
            return (
              <Pressable
                key={player.id}
                testID={`${testID}-slot-${slot}`}
                accessibilityRole="button"
                accessibilityLabel={translate("board:seats.seat", { name: player.name })}
                accessibilityState={{ selected: picked }}
                onPress={() => pressSlot(slot)}
                style={({ pressed }) => [
                  themed($seat),
                  $cell,
                  { backgroundColor: player.color },
                  picked && { borderColor: foreground },
                  pressed && $pressedSeat,
                ]}
              >
                <Text
                  text={player.name}
                  size="xxs"
                  weight="medium"
                  numberOfLines={2}
                  style={[$name, { color: foreground }]}
                />
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const $map: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignSelf: "center",
  gap: spacing.xxs,
  padding: spacing.xxs,
  backgroundColor: colors.board.background,
  borderRadius: 8,
})
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  gap: spacing.xxs,
})
const $cell: ViewStyle = { flex: 1 }
const $seat: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  justifyContent: "center",
  padding: spacing.xxxs,
  borderWidth: 3,
  borderColor: "transparent",
  borderRadius: 6,
})
const $pressedSeat: ViewStyle = { opacity: 0.78 }
const $name: TextStyle = { textAlign: "center" }
