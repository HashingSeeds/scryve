import { type ReactElement, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import * as Haptics from "expo-haptics"
import Svg, { Path } from "react-native-svg"

import { localGameRepository } from "@/features/game/localPersistence"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { spacing } from "@/theme/spacing"
import type { ThemedStyle } from "@/theme/types"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "../BoardPressable"
import { overlayTint } from "../LifeControls"
import { Text } from "../Text"

const LETTERS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"] as const
const DIGITS = ["123", "456", "789"] as const
const DIGIT_ROW = "1234567890"
const SYMBOLS = ["-", "'", ".", ":", "é", "&", "♀", "♂"] as const

export const KEY_HEIGHT = 40
export const COMPACT_KEY_HEIGHT = 32
/** why: a thumb-sized key, the size the system keyboard's keys hit. */
export const FULL_KEY_SIZE = 44
export const KEY_GAP = spacing.xxs
export const ROW_GAP = spacing.xxs + 1

export function tallestKeypadHeight(compact?: boolean) {
  const rows = DIGITS.length + 2
  return rows * (compact ? COMPACT_KEY_HEIGHT : KEY_HEIGHT) + (rows - 1) * ROW_GAP
}

type Key = {
  id: string
  label: string
  icon?: ReactElement
  accessibilityLabel: string
  wide?: boolean
  active?: boolean
  onPress: () => void
}

export function PokemonKeypad({
  seatNumber,
  ink,
  digitsOnly,
  capitalize,
  compact,
  full,
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
  /**
   * why: the counter name panel opts into 44pt keys whose gaps also take touches, a numbers layer no taller than the letters, and a bottom row that leaves `clearance` (an x range across the keypad's `width`) free for the panel's Close.
   */
  full?: { width: number; clearance?: { start: number; end: number } }
  onType: (text: string) => void
  onDelete: () => void
  onDone: () => void
}) {
  const { themed } = useAppTheme()
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
  // why: ⇧ and ⌫ render at very different sizes in the iOS and Android system fonts, so the glyph keys draw their own icons.
  const iconSize = compact ? 18 : 22

  const typed = (char: string): Key => {
    const text = upper ? char : char.toLowerCase()
    return {
      id: char.toLowerCase(),
      label: text,
      accessibilityLabel: char,
      onPress: () => {
        onType(text)
        setShift(undefined)
      },
    }
  }
  const shiftKey: Key = {
    id: "shift",
    label: "⇧",
    icon: <KeyIcon paths={SHIFT_PATHS} color={ink} size={iconSize} filled={upper} />,
    accessibilityLabel: translate("board:keypad.shift"),
    wide: true,
    active: upper,
    onPress: () => setShift(!upper),
  }
  const del: Key = {
    id: "delete",
    label: "⌫",
    accessibilityLabel: translate("common:delete"),
    wide: true,
    icon: <KeyIcon paths={DELETE_PATHS} color={ink} size={iconSize} />,
    onPress: onDelete,
  }
  const done: Key = {
    id: "hide-keypad",
    label: translate("common:done"),
    accessibilityLabel: translate("board:keypad.hide"),
    wide: true,
    onPress: onDone,
  }
  const lettersKey: Key = {
    id: "letters",
    label: translate("board:keypad.lettersKey"),
    accessibilityLabel: translate("board:keypad.letters"),
    wide: true,
    onPress: () => setDigitsChosen(false),
  }
  const space: Key = {
    id: "space",
    label: translate("board:keypad.spaceKey"),
    accessibilityLabel: translate("board:keypad.space"),
    wide: true,
    onPress: () => onType(" "),
  }
  const rows: Key[][] =
    full && digits && !digitsOnly
      ? [[...DIGIT_ROW].map(typed), [...SYMBOLS.map(typed), del], [lettersKey, space, done]]
      : digits
        ? [
            ...DIGITS.map((row) => [...row].map(typed)),
            ...(digitsOnly ? [] : [SYMBOLS.map(typed)]),
            [digitsOnly ? done : lettersKey, typed("0"), del],
          ]
        : [
            ...LETTERS.map((row, index) =>
              index === LETTERS.length - 1
                ? [shiftKey, ...[...row].map(typed), del]
                : [...row].map(typed),
            ),
            [
              {
                id: "numbers",
                label: "123",
                accessibilityLabel: translate("board:keypad.numbers"),
                wide: true,
                onPress: () => setDigitsChosen(true),
              },
              space,
              done,
            ],
          ]
  const keyHeight = full ? FULL_KEY_SIZE : compact ? COMPACT_KEY_HEIGHT : KEY_HEIGHT
  const slop = full
    ? { top: ROW_GAP / 2, bottom: ROW_GAP / 2, left: KEY_GAP / 2, right: KEY_GAP / 2 }
    : undefined
  const keyButton = (key: Key) => (
    <BoardPressable
      key={key.id}
      testID={`pokemon-key-${key.id}-seat-${seatNumber}`}
      accessibilityRole="button"
      accessibilityLabel={key.accessibilityLabel}
      accessibilityState={key.active === undefined ? undefined : { selected: key.active }}
      hitSlop={slop}
      onPress={() => {
        if (reduceMotion === false && localGameRepository.hapticsEnabled())
          void Haptics.selectionAsync().catch(() => undefined)
        key.onPress()
      }}
      style={({ pressed: down }) => [
        keyStyle,
        key.wide && !digits && $wide,
        (down || key.active) && pressed,
      ]}
    >
      {key.icon ?? (
        <Text
          text={key.label}
          size={key.wide && !digits ? "xxs" : "xs"}
          weight="medium"
          style={[inkStyle, $label]}
        />
      )}
    </BoardPressable>
  )

  return (
    <View testID={`pokemon-keypad-seat-${seatNumber}`} style={$keypad}>
      {rows.map((row, index) => (
        <View key={index} style={[themed($row), { height: keyHeight }]}>
          {index === rows.length - 1 && full?.clearance
            ? aroundClearance(row, { width: full.width, clearance: full.clearance }, keyButton)
            : row.map(keyButton)}
        </View>
      ))}
    </View>
  )
}

/**
 * why: Close stays where the dice bag was, which can fall anywhere along the bottom row, so the row's keys split around it. Each key goes to the side its evenly spaced center falls on, and each side's keys share that side.
 */
function aroundClearance(
  row: readonly Key[],
  { width, clearance }: { width: number; clearance: { start: number; end: number } },
  keyButton: (key: Key) => ReactElement,
) {
  const middle = (clearance.start + clearance.end) / 2
  const before = row.filter((_, index) => ((index + 0.5) / row.length) * width < middle)
  const after = row.slice(before.length)
  return (
    <>
      {before.length ? (
        <View style={[$clearanceSide, { width: Math.max(0, clearance.start - KEY_GAP) }]}>
          {before.map(keyButton)}
        </View>
      ) : null}
      <View style={{ width: before.length ? clearance.end - clearance.start : clearance.end }} />
      {after.length ? <View style={[$clearanceSide, $fill]}>{after.map(keyButton)}</View> : null}
    </>
  )
}

const SHIFT_PATHS = ["M12 3.5 L20.5 12 H15.5 V19.5 H8.5 V12 H3.5 Z"]
export const DELETE_PATHS = [
  "M9 5 H19.5 Q21.5 5 21.5 7 V17 Q21.5 19 19.5 19 H9 L2.5 12 Z",
  "M11.5 9 L17 15 M17 9 L11.5 15",
]

export function KeyIcon({
  paths,
  color,
  size,
  filled = false,
}: {
  paths: readonly string[]
  color: string
  size: number
  filled?: boolean
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {paths.map((d, index) => (
        <Path
          key={d}
          d={d}
          fill={filled && index === 0 ? color : "none"}
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  )
}

const $wide: ViewStyle = { flex: 2 }
const $fill: ViewStyle = { flex: 1 }
const $clearanceSide: ViewStyle = { flexDirection: "row", gap: KEY_GAP }
const $label: TextStyle = { textAlign: "center" }
// why: beside the form on a short seat, the number layer is taller than the seat, so rows give up height instead of spilling over the header.
const $keypad: ViewStyle = { gap: ROW_GAP, flexShrink: 1 }
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.xxs,
  flexShrink: 1,
})
const $key: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minWidth: 0,
  borderRadius: 7,
  alignItems: "center",
  justifyContent: "center",
})
const $compactKey: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minWidth: 0,
  borderRadius: 6,
  alignItems: "center",
  justifyContent: "center",
})
