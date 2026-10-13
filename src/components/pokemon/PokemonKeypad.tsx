import { useMemo, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import * as Haptics from "expo-haptics"

import { localGameRepository } from "@/features/game/localPersistence"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "../BoardPressable"
import { overlayTint } from "../LifeControls"
import { Text } from "../Text"

const LETTERS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"] as const
const DIGITS = ["123", "456", "789"] as const
const SYMBOLS = ["-", "'", ".", ":", "é", "&", "♀", "♂"] as const

type Key = {
  label: string
  accessibilityLabel: string
  wide?: boolean
  glyph?: boolean
  active?: boolean
  onPress: () => void
}

export function PokemonKeypad({
  seatNumber,
  ink,
  digitsOnly,
  capitalize,
  compact,
  onType,
  onDelete,
  onDone,
}: {
  seatNumber: number
  ink: string
  digitsOnly: boolean
  /** why: prize values read the name's case ("ex" vs "EX"), so letters can't all come out uppercase. */
  capitalize: boolean
  compact?: boolean
  onType: (text: string) => void
  onDelete: () => void
  onDone: () => void
}) {
  const { themed } = useAppTheme()
  const { hapticsEnabled } = useMemo(() => localGameRepository.loadSettings(), [])
  const reduceMotion = useReducedMotion()
  const [digitsChosen, setDigitsChosen] = useState(false)
  const digits = digitsOnly || digitsChosen
  const [shift, setShift] = useState<boolean>()
  const upper = shift ?? capitalize
  const keyStyle = [
    themed(compact ? $compactKey : $key),
    { backgroundColor: overlayTint(ink, 0.18) },
  ]
  const pressed = { backgroundColor: overlayTint(ink, 0.36) }
  const inkStyle = { color: ink }

  const typed = (char: string): Key => {
    const text = upper ? char : char.toLowerCase()
    return {
      label: text,
      accessibilityLabel: char,
      onPress: () => {
        onType(text)
        setShift(undefined)
      },
    }
  }
  const shiftKey: Key = {
    label: "⇧",
    accessibilityLabel: "Shift",
    wide: true,
    glyph: true,
    active: upper,
    onPress: () => setShift(!upper),
  }
  const del: Key = {
    label: "⌫",
    accessibilityLabel: "Delete",
    wide: true,
    glyph: true,
    onPress: onDelete,
  }
  const done: Key = {
    label: "Done",
    accessibilityLabel: "Hide keypad",
    wide: true,
    onPress: onDone,
  }
  const rows: Key[][] = digits
    ? [
        ...DIGITS.map((row) => [...row].map(typed)),
        ...(digitsOnly ? [] : [SYMBOLS.map(typed)]),
        [
          digitsOnly
            ? done
            : {
                label: "ABC",
                accessibilityLabel: "Letters",
                wide: true,
                onPress: () => setDigitsChosen(false),
              },
          typed("0"),
          del,
        ],
      ]
    : [
        ...LETTERS.map((row, index) =>
          index === LETTERS.length - 1
            ? [shiftKey, ...[...row].map(typed), del]
            : [...row].map(typed),
        ),
        [
          {
            label: "123",
            accessibilityLabel: "Numbers",
            wide: true,
            onPress: () => setDigitsChosen(true),
          },
          { label: "space", accessibilityLabel: "Space", wide: true, onPress: () => onType(" ") },
          done,
        ],
      ]

  return (
    <View testID={`pokemon-keypad-seat-${seatNumber}`} style={themed($keypad)}>
      {rows.map((row, index) => (
        <View key={index} style={themed($row)}>
          {row.map((key) => (
            <BoardPressable
              key={key.accessibilityLabel}
              testID={`pokemon-key-${key.accessibilityLabel.toLowerCase().replace(" ", "-")}-seat-${seatNumber}`}
              accessibilityRole="button"
              accessibilityLabel={key.accessibilityLabel}
              accessibilityState={key.active === undefined ? undefined : { selected: key.active }}
              onPress={() => {
                // why: a selection tick is the closest match to the system keyboard's key feedback.
                if (hapticsEnabled && reduceMotion === false)
                  void Haptics.selectionAsync().catch(() => undefined)
                key.onPress()
              }}
              style={({ pressed: down }) => [
                keyStyle,
                key.wide && !digits && $wide,
                (down || key.active) && pressed,
              ]}
            >
              <Text
                text={key.label}
                size={key.glyph ? (compact ? "lg" : "xl") : key.wide && !digits ? "xxs" : "xs"}
                weight="medium"
                style={[inkStyle, $label]}
              />
            </BoardPressable>
          ))}
        </View>
      ))}
    </View>
  )
}

const $wide: ViewStyle = { flex: 2 }
const $label: TextStyle = { textAlign: "center" }
const $keypad: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs + 1 })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.xxs,
})
const $key: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minWidth: 0,
  height: 40,
  borderRadius: 7,
  alignItems: "center",
  justifyContent: "center",
})
const $compactKey: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minWidth: 0,
  height: 32,
  borderRadius: 6,
  alignItems: "center",
  justifyContent: "center",
})
