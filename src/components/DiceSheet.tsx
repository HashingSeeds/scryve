import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { AccessibilityInfo, ScrollView, View } from "react-native"

import type { GamePlayer } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Button } from "./Button"
import { DialogCard, type DialogOrigin } from "./DialogCard"
import { Text } from "./Text"

export interface DiceSheetProps {
  players: readonly Pick<GamePlayer, "id" | "name" | "color">[]
  origin?: DialogOrigin
  onClose: () => void
}

const D20_SIDES = 20
const COIN_FACES = ["Heads", "Tails"] as const

function randomIndex(count: number) {
  return Math.floor(Math.random() * count)
}

// why: a result is a state change with no focus move, and a repeat of the same result changes no text, so every press announces itself.
function announceResult(message: string) {
  AccessibilityInfo.announceForAccessibility(message)
}

/** why: dice results are table talk, so they live in this sheet's state only and are gone when it closes. */
export function DiceSheet({ players, origin, onClose }: DiceSheetProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const [d20, setD20] = useState<number>()
  const [coin, setCoin] = useState<(typeof COIN_FACES)[number]>()
  const [firstId, setFirstId] = useState<GamePlayer["id"]>()

  function rollD20() {
    const roll = randomIndex(D20_SIDES) + 1
    setD20(roll)
    announceResult(`d20, ${roll}`)
  }

  function flipCoin() {
    const face = COIN_FACES[randomIndex(COIN_FACES.length)]
    setCoin(face)
    announceResult(`Coin, ${face}`)
  }

  function pickFirst() {
    const player = players[randomIndex(players.length)]
    if (!player) return
    setFirstId(player.id)
    announceResult(`${player.name} goes first`)
  }

  return (
    <DialogCard
      visible
      onClose={onClose}
      origin={origin}
      backdropTestID="dice-backdrop"
      backdropAccessibilityLabel="Close dice"
      dialogTestID="dice-dialog"
      accessibilityViewIsModal
    >
      <Text text="Dice" preset="subheading" />

      {/* why: six seats make this taller than a landscape phone; the list scrolls and Close stays reachable. */}
      <ScrollView style={$scroll} contentContainerStyle={themed($scrollContent)}>
        <View style={themed($row)}>
          <Text text="d20" weight="medium" style={themed($rowLabel)} />
          <Text
            testID="dice-d20-result"
            text={d20 === undefined ? "" : String(d20)}
            weight="bold"
            style={themed($result)}
          />
          <Button testID="dice-d20-roll" text="Roll" style={themed($rowButton)} onPress={rollD20} />
        </View>

        <View style={themed($row)}>
          <Text text="Coin" weight="medium" style={themed($rowLabel)} />
          <Text testID="dice-coin-result" text={coin ?? ""} weight="bold" style={themed($result)} />
          <Button
            testID="dice-coin-flip"
            text="Flip"
            style={themed($rowButton)}
            onPress={flipCoin}
          />
        </View>

        <View style={themed($firstSection)}>
          <View style={themed($row)}>
            <Text text="First player" weight="medium" style={themed($rowLabel)} />
            <View style={$spacer} />
            <Button
              testID="dice-first-pick"
              text="Pick"
              style={themed($rowButton)}
              onPress={pickFirst}
            />
          </View>
          {players.map((player) => {
            const picked = player.id === firstId
            return (
              <View
                key={player.id}
                testID={`dice-player-${player.id}`}
                accessibilityState={{ selected: picked }}
                style={[themed($player), !picked && firstId !== undefined && themed($notFirst)]}
              >
                <View style={[$dot, { backgroundColor: player.color }]} />
                <Text
                  text={player.name}
                  numberOfLines={1}
                  weight={picked ? "bold" : "normal"}
                  style={[themed($playerName), picked && { color: colors.tint }]}
                />
                {picked ? (
                  <Text text="Goes first" weight="bold" style={{ color: colors.tint }} />
                ) : null}
              </View>
            )
          })}
        </View>
      </ScrollView>

      <Button text="Close" style={themed($rowButton)} onPress={onClose} />
    </DialogCard>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
})
const $rowLabel: ThemedStyle<TextStyle> = () => ({ minWidth: 56 })
const $result: ThemedStyle<TextStyle> = () => ({
  flex: 1,
  fontSize: 34,
  lineHeight: 40,
  textAlign: "center",
})
const $scroll: ViewStyle = { flexShrink: 1 }
const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.lg })
const $spacer: ViewStyle = { flex: 1 }
const $rowButton: ThemedStyle<ViewStyle> = () => ({ minHeight: 48, minWidth: 96, flexShrink: 0 })
const $firstSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $player: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 36,
})
const $notFirst: ThemedStyle<ViewStyle> = () => ({ opacity: 0.45 })
const $playerName: ThemedStyle<TextStyle> = () => ({ flex: 1 })
const $dot: ViewStyle = { width: 12, height: 12, borderRadius: 6 }
