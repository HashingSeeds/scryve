import { Fragment, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { ColorChoices } from "./ColorChoices"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

export type TeamColors = {
  values: readonly string[]
  editable?: (team: number) => boolean
  open?: number
  onOpen: (team?: number) => void
  onChange: (team: number, color: string) => void
}

export function TeamPicker({
  players,
  teams,
  colors: teamColors,
  onSwap,
}: {
  players: readonly ({ name: string; color: string; shape?: PlayerMarkShape } | undefined)[]
  teams: readonly (readonly number[])[]
  colors?: TeamColors
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
      {teams.map((team, index) => {
        const color = teamColors?.values[index]
        const open = teamColors?.open === index
        return (
          <Fragment key={index}>
            <View testID={`team-${index + 1}`} style={themed($team)}>
              {teamColors && color && (teamColors.editable?.(index) ?? true) ? (
                <Pressable
                  testID={`team-color-${index + 1}`}
                  accessibilityRole="button"
                  accessibilityLabel={translate("play:newGame.teamColor", { team: index + 1 })}
                  accessibilityState={{ expanded: open }}
                  hitSlop={10}
                  onPress={() => teamColors.onOpen(open ? undefined : index)}
                  style={[
                    $disc,
                    { borderColor: open ? colors.tint : colors.separator },
                    open && $openDisc,
                  ]}
                >
                  <View style={[$discFill, { backgroundColor: color }]} />
                </Pressable>
              ) : (
                <Text
                  text={String(index + 1)}
                  weight="semiBold"
                  style={[$number, { color: colors.textDim }]}
                />
              )}
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
                    accessibilityLabel={translate("play:newGame.teamPlayer", {
                      name,
                      team: index + 1,
                    })}
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
            {teamColors && color && open ? (
              <ColorChoices
                testID={`team-colors-${index + 1}`}
                value={color}
                taken={
                  new Set(
                    teamColors.values.flatMap((other, team) =>
                      team === index ? [] : [other.toUpperCase()],
                    ),
                  )
                }
                inline
                onChange={(next) => {
                  teamColors.onChange(index, next)
                  teamColors.onOpen(undefined)
                }}
              />
            ) : null}
          </Fragment>
        )
      })}
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
const $number: TextStyle = { width: 28, textAlign: "center", fontVariant: ["tabular-nums"] }
const $disc: ViewStyle = {
  width: 28,
  height: 28,
  borderRadius: 14,
  borderWidth: 1,
  padding: 2,
}
const $openDisc: ViewStyle = { borderWidth: 2, padding: 1 }
const $discFill: ViewStyle = { flex: 1, borderRadius: 12 }
const $name: TextStyle = { flexShrink: 1 }
const $picked: TextStyle = { textDecorationLine: "underline" }
const $openMark: ViewStyle = { width: 24, height: 24 }
