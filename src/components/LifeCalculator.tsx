import { Fragment, useState } from "react"
import type { LayoutChangeEvent, TextStyle, ViewStyle } from "react-native"
import { StyleSheet, useWindowDimensions, View } from "react-native"
import Animated, { FadeIn, FadeOut } from "react-native-reanimated"
import Svg, { Circle, Rect } from "react-native-svg"

import { MAX_LIFE_DELTA } from "@/features/game/domain"
import { LifeLog, type LifeLogStep } from "@/features/game/LifeLog"
import type { PlaySystemId } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { accessibleForeground } from "@/utils/colorContrast"
import { useCloseOnBack } from "@/utils/useCloseOnBack"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import { overlayTint } from "./LifeControls"
import type {
  LifeCardContentInsets,
  LifeCardContentRotation,
  LifeCardMenuCorner,
  LifeCardMenuEdge,
} from "./playerCardTypes"
import {
  menuClearance,
  contentInsetsFor,
  MENU_CLEARANCE,
  rotatedLayerStyle,
} from "./pokemon/pokemonCardLayout"
import { DELETE_PATHS, KeyIcon } from "./pokemon/PokemonKeypad"
import { Text } from "./Text"
import { flooredLifeDelta } from "../../convex/lib/systems"

const COLUMN_KEYS = ["1", "2", "3", "00", "4", "5", "6", "0", "7", "8", "9", "⌫"] as const
const BESIDE_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"] as const
const MAX_DIGITS = String(MAX_LIFE_DELTA).length
// why: below this height a column squeezes the keys too small to hit, so the keypad moves beside the number.
const COLUMN_MIN_HEIGHT = 300
// why: the trail stays a glance at recent play, sized to the seat, rather than a ticker across a wide sheet.
const TRAIL_STEPS = { beside: 2, column: 3, wide: 5 }
const TRAIL_WIDE = 520
const TRAIL_GAP = 7
// why: a generous per-character width at the trail's text size, so six-digit totals drop older steps instead of overflowing.
const TRAIL_CHAR_WIDTH = 8
// why: large system text still grows the trail, but only so far, so the fit estimate holds and the keypad keeps its room.
const TRAIL_MAX_FONT_SCALE = 1.3
const FADE_MS = 160

type Props = {
  playerId?: string
  seatNumber: number
  playerName: string
  life: number
  system?: PlaySystemId
  color: string
  rotation: LifeCardContentRotation
  cardWidth: number
  cardHeight: number
  contentInsets?: LifeCardContentInsets
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
  onChange: (delta: number) => void
  onClose: () => void
}

const GLYPH_KEYS = [8.6, 12, 15.4].flatMap((cx) => [13, 17].map((cy) => ({ cx, cy })))

export function CalculatorGlyph({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4.5} y={2.5} width={15} height={19} rx={3} stroke={color} strokeWidth={1.9} />
      <Rect x={7.5} y={5.5} width={9} height={4} rx={1} stroke={color} strokeWidth={1.6} />
      {GLYPH_KEYS.map(({ cx, cy }) => (
        <Circle key={`${cx}:${cy}`} cx={cx} cy={cy} r={1.15} fill={color} />
      ))}
    </Svg>
  )
}

export function LifeCalculator({
  playerId,
  seatNumber,
  playerName,
  life,
  system,
  color,
  rotation,
  cardWidth,
  cardHeight,
  contentInsets,
  menuCorner,
  menuEdgeCenter,
  onChange,
  onClose,
}: Props) {
  const { theme } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const [entry, setEntry] = useState("")
  const amount = Number(entry)
  // why: halving rounds the total up, as Yu-Gi-Oh! rounds halved Life Points; past the largest accepted change, ½ stays off rather than closing with nothing applied.
  const halved = Math.ceil(life / 2) - life
  const halving = Math.abs(halved) <= MAX_LIFE_DELTA ? halved : 0
  const damaged = life + flooredLifeDelta(system, life, -amount)
  const background = mixColorsInLinearLight(color, "#000000", 0.82)
  const ink = accessibleForeground(background)
  const damage = mixColorsInLinearLight(theme.colors.error, background, 0.55)
  const gain = mixColorsInLinearLight(theme.colors.success, background, 0.55)
  const sideways = Math.abs(rotation) === 90
  const height = sideways ? cardWidth : cardHeight
  const insets = contentInsetsFor(rotation, contentInsets)
  const clearance = menuClearance(rotation, menuCorner, menuEdgeCenter)
  const beside = height > 0 && height - insets.top - insets.bottom < COLUMN_MIN_HEIGHT
  const fade = reducedMotion === false
  const inkText = { color: ink }

  useCloseOnBack(true, onClose)

  function press(key: (typeof COLUMN_KEYS)[number]) {
    setEntry((current) => {
      if (key === "⌫") return current.slice(0, -1)
      if (!current && key.startsWith("0")) return current
      const next = current + key
      return next.length <= MAX_DIGITS ? next : current
    })
  }

  function apply(delta: number) {
    if (delta) onChange(delta)
    onClose()
  }

  const key = (label: (typeof COLUMN_KEYS)[number]) => (
    <BoardPressable
      key={label}
      testID={`life-calculator-key-${label === "⌫" ? "delete" : label}-seat-${seatNumber}`}
      accessibilityRole="button"
      accessibilityLabel={label === "⌫" ? translate("common:delete") : label}
      onPress={() => press(label)}
      style={({ pressed }) => [$key, { backgroundColor: overlayTint(ink, pressed ? 0.36 : 0.18) }]}
    >
      {label === "⌫" ? (
        <KeyIcon paths={DELETE_PATHS} color={ink} size={beside ? 18 : 22} />
      ) : (
        <Text text={label} weight="medium" size={beside ? "xs" : "sm"} style={inkText} />
      )}
    </BoardPressable>
  )
  const keys = beside ? BESIDE_KEYS : COLUMN_KEYS
  const columns = beside ? 3 : 4
  const keypad = (
    <View
      testID={`life-calculator-keypad-seat-${seatNumber}`}
      style={[$keypad, beside && $keypadBeside]}
    >
      {Array.from({ length: keys.length / columns }, (_, row) => (
        <View key={row} style={[$keyRow, beside ? $keyRowBeside : $keyRowColumn]}>
          {keys.slice(row * columns, row * columns + columns).map(key)}
        </View>
      ))}
    </View>
  )

  const actionSpecs = [
    {
      id: "damage",
      label: beside ? "−" : translate("board:calculator.damage"),
      accessibilityLabel: translate("board:calculator.subtractFrom", { amount, name: playerName }),
      delta: -amount,
      fill: damage,
    },
    {
      id: "half",
      label: "½",
      accessibilityLabel: translate("board:calculator.halve", { name: playerName }),
      delta: halving,
      fill: undefined,
    },
    {
      id: "gain",
      label: beside ? "+" : translate("board:calculator.gain"),
      accessibilityLabel: translate("board:calculator.addTo", { amount, name: playerName }),
      delta: amount,
      fill: gain,
    },
  ] as const
  const actions = (
    <View style={$actions}>
      {actionSpecs.map(({ id, label, accessibilityLabel, delta, fill }) => (
        <BoardPressable
          key={id}
          testID={`life-calculator-${id}-seat-${seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ disabled: !delta }}
          disabled={!delta}
          onPress={() => apply(delta)}
          style={({ pressed }) => [
            $action,
            fill
              ? { backgroundColor: fill }
              : { borderColor: theme.colors.tint, borderWidth: 1.5, backgroundColor: background },
            pressed && $pressed,
            !delta && $disabled,
          ]}
        >
          <Text
            text={label}
            weight="bold"
            size={beside ? "xs" : "sm"}
            numberOfLines={1}
            style={{ color: fill ? accessibleForeground(fill) : theme.colors.tint }}
          />
        </BoardPressable>
      ))}
    </View>
  )
  const trail = playerId ? (
    <LifeLog playerId={playerId} life={life}>
      {(steps) => (
        <LifeTrail
          steps={steps}
          beside={beside}
          showTotal={entry !== ""}
          seatNumber={seatNumber}
          playerName={playerName}
          ink={ink}
          // why: the theme red reads at about 2:1 on a darkened seat, so it leans toward the ink to stay legible.
          damage={mixColorsInLinearLight(theme.colors.error, ink, 0.3)}
          gain={theme.colors.success}
        />
      )}
    </LifeLog>
  ) : null
  const readout = (
    <View style={beside ? undefined : $centered}>
      <Text
        testID={`life-calculator-value-seat-${seatNumber}`}
        text={entry || String(life)}
        accessibilityLiveRegion="polite"
        numberOfLines={1}
        style={[
          beside ? $besideValue : $value,
          { color: entry ? theme.colors.tint : ink },
          !beside && $centeredText,
        ]}
      />
      <Text
        text={
          entry ? previewText(damaged, life + amount) : translate("board:calculator.typeAmount")
        }
        size="xxs"
        numberOfLines={beside ? 2 : 1}
        style={[inkText, $hint, !beside && $centeredText]}
      />
      {trail}
    </View>
  )

  return (
    <Animated.View
      testID={`life-calculator-seat-${seatNumber}`}
      accessibilityViewIsModal
      aria-modal
      entering={fade ? FadeIn.duration(FADE_MS) : undefined}
      exiting={fade ? FadeOut.duration(FADE_MS) : undefined}
      style={[
        StyleSheet.absoluteFill,
        rotatedLayerStyle(rotation, cardWidth, cardHeight),
        beside ? $besideSheet : $sheet,
        {
          backgroundColor: background,
          paddingTop: (beside ? 6 : 12) + insets.top,
          paddingBottom: (beside ? 6 : 12) + insets.bottom,
          paddingLeft: (beside ? 8 : 12) + insets.left,
          paddingRight: (beside ? 8 : 12) + insets.right,
        },
      ]}
    >
      <View style={[$header, { marginLeft: clearance.left, marginRight: clearance.right }]}>
        <Text
          text={playerName}
          weight="bold"
          size={beside ? "xs" : "sm"}
          numberOfLines={1}
          style={[inkText, $title]}
        />
        {/* why: a menu at the middle of this edge sits between the name and the close button. */}
        {clearance.top ? <View style={{ width: MENU_CLEARANCE * 2 }} /> : null}
        <View style={$closeSlot}>
          <BoardPressable
            testID={`life-calculator-close-seat-${seatNumber}`}
            accessibilityRole="button"
            accessibilityLabel={translate("board:calculator.close", { name: playerName })}
            hitSlop={12}
            onPress={onClose}
            style={$close}
          >
            <View
              style={[$closeStroke, { backgroundColor: ink, transform: [{ rotate: "45deg" }] }]}
            />
            <View
              style={[$closeStroke, { backgroundColor: ink, transform: [{ rotate: "-45deg" }] }]}
            />
          </BoardPressable>
        </View>
      </View>
      {beside ? (
        <View style={$besideBody}>
          <View style={$besideReadout}>
            {readout}
            {actions}
          </View>
          {keypad}
        </View>
      ) : (
        <>
          <View style={$columnReadout}>{readout}</View>
          {keypad}
          {actions}
        </>
      )}
    </Animated.View>
  )
}

function previewText(damaged: number, gained: number) {
  return `− → ${damaged} · + → ${gained}`
}

function signed(delta: number) {
  return `${delta < 0 ? "−" : "+"}${Math.abs(delta)}`
}

// why: the newest total is the big number above, so the trail ends on the change that reached it until a typed amount takes that number's place.
function LifeTrail({
  steps,
  beside,
  showTotal,
  seatNumber,
  playerName,
  ink,
  damage,
  gain,
}: {
  steps: readonly LifeLogStep[]
  beside: boolean
  showTotal: boolean
  seatNumber: number
  playerName: string
  ink: string
  damage: string
  gain: string
}) {
  const [width, setWidth] = useState(0)
  const charWidth =
    TRAIL_CHAR_WIDTH * Math.min(useWindowDimensions().fontScale, TRAIL_MAX_FONT_SCALE)
  if (steps.length < 2) return null
  const total = String(steps[steps.length - 1].life)
  const label = steps
    .map(({ delta, life }) =>
      delta === undefined
        ? `${life}`
        : translate("board:calculator.logStep", { delta: signed(delta), life }),
    )
    .join(", ")
  const cap = beside
    ? TRAIL_STEPS.beside
    : width >= TRAIL_WIDE
      ? TRAIL_STEPS.wide
      : TRAIL_STEPS.column
  const changes = steps.slice(1).map(({ id, delta = 0 }, index) => ({
    id,
    delta,
    from: steps[index].life,
  }))
  const fits = (count: number) =>
    changes
      .slice(changes.length - count)
      .reduce(
        (sum, { delta, from }) =>
          sum + (`${from}`.length + signed(delta).length) * charWidth + TRAIL_GAP * 2,
        (count < changes.length ? charWidth + TRAIL_GAP : 0) +
          (showTotal ? total.length * charWidth : 0),
      ) <= width
  let count = Math.min(cap, changes.length)
  // why: a seat too narrow for even one change shows none rather than wrapping into the keypad.
  while (count > 0 && !fits(count)) count--
  const shown = changes.slice(changes.length - count)
  const item = (text: string, style: TextStyle, bold = false) => (
    <Text
      text={text}
      size="xxs"
      weight={bold ? "bold" : undefined}
      numberOfLines={1}
      maxFontSizeMultiplier={TRAIL_MAX_FONT_SCALE}
      style={[{ color: ink }, style]}
    />
  )

  return (
    <View
      testID={`life-calculator-log-seat-${seatNumber}`}
      accessible
      accessibilityLabel={translate("board:calculator.log", { name: playerName, steps: label })}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={[$trail, !beside && $trailCentered]}
    >
      {count > 0 && count < changes.length ? item("…", $trailTotal) : null}
      {shown.map(({ id, delta, from }) => (
        <Fragment key={id}>
          {item(String(from), $trailTotal)}
          {item(signed(delta), { ...$trailText, color: delta < 0 ? damage : gain }, true)}
        </Fragment>
      ))}
      {showTotal && width > 0 ? item(total, $trailText) : null}
    </View>
  )
}

const $sheet: ViewStyle = { zIndex: 20, gap: 8 }
const $besideSheet: ViewStyle = { zIndex: 20, gap: 4 }
const $header: ViewStyle = { flexDirection: "row", alignItems: "center", minHeight: 28 }
const $title: TextStyle = { flex: 1 }
const $closeSlot: ViewStyle = { flex: 1, alignItems: "flex-end" }
const $close: ViewStyle = { alignItems: "center", height: 28, justifyContent: "center", width: 28 }
const $closeStroke: ViewStyle = { borderRadius: 1, height: 2, position: "absolute", width: 18 }
const $columnReadout: ViewStyle = { flex: 1, justifyContent: "center", minHeight: 64 }
const $centered: ViewStyle = { alignItems: "center" }
const $centeredText: TextStyle = { textAlign: "center" }
const $value: TextStyle = { fontSize: 48, lineHeight: 56, fontVariant: ["tabular-nums"] }
const $besideValue: TextStyle = { fontSize: 30, lineHeight: 36, fontVariant: ["tabular-nums"] }
const $besideBody: ViewStyle = { flex: 1, flexDirection: "row", gap: 8, minHeight: 0 }
const $besideReadout: ViewStyle = { flex: 1, justifyContent: "space-between", minWidth: 0 }
const $keypad: ViewStyle = { gap: 5, flexShrink: 1, minHeight: 0 }
const $keypadBeside: ViewStyle = { flex: 1.15, gap: 4 }
const $keyRow: ViewStyle = { flexDirection: "row", gap: 5 }
// why: a column row keeps a full key height and gives way only when the seat runs short.
const $keyRowColumn: ViewStyle = { height: 44, flexShrink: 1, minHeight: 28 }
const $keyRowBeside: ViewStyle = { flex: 1, gap: 4 }
const $key: ViewStyle = {
  flex: 1,
  minWidth: 0,
  borderRadius: 8,
  alignItems: "center",
  justifyContent: "center",
}
const $actions: ViewStyle = { flexDirection: "row", gap: 5 }
const $action: ViewStyle = {
  flex: 1,
  minHeight: 38,
  borderRadius: 8,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 4,
}
const $hint: TextStyle = { opacity: 0.72 }
// why: if a glyph runs wider than the fit estimate, the trail clips at the seat edge instead of wrapping into the keypad.
const $trail: ViewStyle = {
  alignSelf: "stretch",
  flexDirection: "row",
  gap: TRAIL_GAP,
  marginTop: 2,
  overflow: "hidden",
}
const $trailCentered: ViewStyle = { justifyContent: "center" }
const $trailText: TextStyle = { flexShrink: 0, fontVariant: ["tabular-nums"] }
const $trailTotal: TextStyle = { ...$trailText, opacity: 0.6 }
const $pressed: ViewStyle = { opacity: 0.75 }
const $disabled: ViewStyle = { opacity: 0.35 }
