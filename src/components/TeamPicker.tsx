import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

/** why: a seat with no player yet is still a place on a team, so an open seat can be traded too. Without `onSwap` the teams only show. */
export function TeamPicker({
  players,
  teams,
  onSwap,
}: {
  players: readonly ({ name: string; color: string; shape?: PlayerMarkShape } | undefined)[]
  teams: readonly (readonly number[])[]
  onSwap?: (first: number, second: number) => void
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const [picked, setPicked] = useState<number>()

  function press(seat: number) {
    if (picked === undefined || picked === seat) {
      setPicked(picked === seat ? undefined : seat)
      return
    }
    onSwap?.(picked, seat)
    setPicked(undefined)
  }

  return (
    <View style={themed($section)}>
      <Text tx="play:newGame.teams" preset="subheading" accessibilityRole="header" />
      {teams.map((team, index) => (
        <View key={index} testID={`team-${index + 1}`} style={themed($team)}>
          <Text
            text={String(index + 1)}
            weight="semiBold"
            style={[$number, { color: colors.textDim }]}
          />
          {team.map((seat) => {
            const player = players[seat]
            const name = player?.name ?? translate("connected:seats.openSeat")
            const selected = picked === seat
            return (
              <Pressable
                key={seat}
                testID={`team-player-${seat + 1}`}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: !onSwap }}
                accessibilityLabel={translate("play:newGame.teamPlayer", { name, team: index + 1 })}
                accessibilityHint={onSwap ? translate("play:newGame.teamSwapHint") : undefined}
                disabled={!onSwap}
                onPress={() => press(seat)}
                style={({ pressed }) => [themed($member), pressed && { opacity: 0.7 }]}
              >
                {player ? (
                  <PlayerMark
                    seatNumber={seat + 1}
                    shape={player.shape}
                    color={player.color}
                    size={24}
                  />
                ) : (
                  <View style={$openMark} />
                )}
                <Text
                  text={name}
                  weight={selected ? "bold" : "medium"}
                  numberOfLines={1}
                  style={[
                    $name,
                    !player && { color: colors.textDim },
                    selected && [$picked, { color: colors.tint }],
                  ]}
                />
              </Pressable>
            )
          })}
        </View>
      ))}
      {onSwap ? (
        <Text
          tx={picked === undefined ? "play:newGame.teamSwapHint" : "play:newGame.teamSwapPicked"}
          size="xs"
          style={{ color: colors.textDim }}
        />
      ) : null}
    </View>
  )
}

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $team: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 44,
})
const $member: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  minHeight: 44,
})
const $number: TextStyle = { width: 16, textAlign: "center", fontVariant: ["tabular-nums"] }
const $name: TextStyle = { flexShrink: 1 }
const $picked: TextStyle = { textDecorationLine: "underline" }
const $openMark: ViewStyle = { width: 24, height: 24 }
