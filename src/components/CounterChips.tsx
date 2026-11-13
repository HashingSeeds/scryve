import { memo, useEffect, useRef, useState, type Ref } from "react"
import type { Insets, StyleProp, TextStyle, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, View } from "react-native"
import Animated, { FadeIn, FadeOut } from "react-native-reanimated"
import Svg, { Circle, Path } from "react-native-svg"

import { toolLabel, type DiceTool } from "@/features/game/dice"
import { tableItemLabel, tableItemShortLabel, type TableRules } from "@/features/game/playSystems"
import { rememberCounterName, suggestedCounterNames } from "@/features/game/recentCounterNames"
import type { TableRuntime } from "@/features/game/tableRuntime"
import board from "@/i18n/en/board"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { radius } from "@/theme/radius"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { CounterNameSlot } from "./CounterNamePanel"
import { DiceBagGlyph, DieFace } from "./DiceGlyph"
import type { SeatDiceBag } from "./DiceSeatOverlay"
import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import { Icon } from "./Icon"
import { overlayTint } from "./LifeControls"
import { PlanarGlyph } from "./modes/ModeSeam"
import {
  CUTOUT_ENDS_INSIDE_INSET,
  useCornerSlide,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardEdge,
  type LifeCardMenuEdge,
} from "./playerCardTypes"
import { seatIdentityMetrics } from "./SeatIdentity"
import { Text } from "./Text"
import { TextField } from "./TextField"
import { targetSlop } from "./touchTarget"
import { NO_TABLE } from "../../convex/lib/systems"
import {
  customCounterId,
  customCounterName,
  customCounterNameOf,
  holdsDesignation,
  MAX_CUSTOM_COUNTER,
  MAX_CUSTOM_COUNTER_NAME_LENGTH,
  MAX_CUSTOM_COUNTERS,
  playerTableOf,
  type CustomCounter,
} from "../../convex/lib/table"

/** why: what one seat shows and may change. The plain parts compare structurally in the memoized card; PlayerGrid keeps the callbacks stable. */
export interface SeatTable {
  rules: TableRules
  counters: Readonly<Record<string, number>>
  held: readonly string[]
  editable: boolean
  adjustCounter: (counterId: string, delta: number) => void
  takeDesignation: (designationId: string) => void
  releaseDesignation: (designationId: string) => void
  tableItemRules?: Readonly<Partial<Record<string, string>>>
  openRule?: (ruleId: string) => void
}

const NO_COUNTERS: Readonly<Record<string, number>> = {}

export const DICE_ONLY_SEAT: SeatTable = {
  rules: NO_TABLE,
  counters: NO_COUNTERS,
  held: [],
  editable: false,
  adjustCounter: () => {},
  takeDesignation: () => {},
  releaseDesignation: () => {},
}

export function seatTableState(
  runtime: TableRuntime | undefined,
  playerId: string,
): Pick<SeatTable, "rules" | "counters" | "held"> | undefined {
  if (!runtime) return undefined
  const { table, tableRules: rules } = runtime
  if (rules.counters.length === 0 && rules.designations.length === 0 && !rules.customCounters)
    return undefined
  const seat = playerTableOf(table, playerId)
  const counters = seat.counters ?? NO_COUNTERS
  const custom = rules.customCounters ? (seat.customCounters ?? []) : []
  return {
    rules: custom.length
      ? { ...rules, counters: [...rules.counters, ...custom.map(customCounterRule)] }
      : rules,
    counters: custom.length
      ? {
          ...counters,
          ...Object.fromEntries(custom.map(({ name, value }) => [customCounterId(name), value])),
        }
      : counters,
    held: rules.designations.flatMap((designation) =>
      holdsDesignation(table, designation, playerId) ? [designation.id] : [],
    ),
  }
}

const customCounterRule = ({ name }: CustomCounter) => ({
  id: customCounterId(name),
  label: name,
  step: 1,
  max: MAX_CUSTOM_COUNTER,
})

type OutReasonId = keyof typeof board.outReason

const isOutReasonId = (id: string): id is OutReasonId => Object.hasOwn(board.outReason, id)

export function counterOutReason({ id, label }: { id: string; label: string }) {
  return isOutReasonId(id) ? translate(`board:outReason.${id}`) : label.toLowerCase()
}

const LEVEL_UP = "M6 13l6-6 6 6M6 19l6-6 6 6"

const GLYPHS: Record<string, string> = {
  poison: "M12 2v20",
  energy: "M13 2 4 14h7l-1 8 9-12h-7z",
  experience: LEVEL_UP,
  xp: LEVEL_UP,
  commanderTax: "M6 3h12v18l-6-4-6 4zM12 7v6M9 10h6",
  monarch: "M3 19h18M4.5 15.5 3 7l5 4 4-6 4 6 5-4-1.5 8.5z",
  initiative: "M6 21V10a6 6 0 0 1 12 0v11M3 21h18M12 13v4",
  marked: "M12 5a7 7 0 1 0 0 14 7 7 0 1 0 0-14M12 2v6M12 16v6M2 12h6M16 12h6",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
}
const RINGED = new Set(["poison"])

export function TableGlyph({ id, size, color }: { id: string; size: number; color: string }) {
  const path = GLYPHS[id]
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path ? null : <Circle cx={12} cy={12} r={4} fill={color} />}
      {RINGED.has(id) ? <Circle cx={12} cy={12} r={7} /> : null}
      {path ? <Path d={path} /> : null}
    </Svg>
  )
}

const CONTENT_EDGES = {
  0: { top: "top", right: "right", bottom: "bottom", left: "left" },
  90: { top: "right", right: "bottom", bottom: "left", left: "top" },
  [-90]: { top: "left", right: "top", bottom: "right", left: "bottom" },
  180: { top: "bottom", right: "left", bottom: "top", left: "right" },
} as const satisfies Record<LifeCardContentRotation, Record<LifeCardEdge, LifeCardEdge>>

export function contentFrame(
  rotation: LifeCardContentRotation,
  size: { width: number; height: number },
): ViewStyle {
  const sideways = Math.abs(rotation) === 90
  return {
    position: "absolute",
    width: sideways ? size.height : size.width,
    height: sideways ? size.width : size.height,
    left: sideways ? (size.width - size.height) / 2 : 0,
    top: sideways ? (size.height - size.width) / 2 : 0,
    transform: [{ rotate: `${rotation}deg` }],
  }
}

/** why: the life − and + ignore the safe area and ink about 18 dp in, so tracker icons and dice do too, clearing only a corner camera hole or a top notch or Dynamic Island. */
function sheetSideInset(
  rotation: LifeCardContentRotation,
  insets: LifeCardContentInsets | undefined,
  edge: LifeCardEdge,
) {
  const cardEdge = CONTENT_EDGES[rotation][edge]
  if (insets?.cutout?.edge === cardEdge) return insets.cutout.size
  return cardEdge === "top"
    ? Math.max(SHEET_SIDE, (insets?.top ?? 0) - CUTOUT_ENDS_INSIDE_INSET)
    : SHEET_SIDE
}

export function contentInset(
  rotation: LifeCardContentRotation,
  insets: LifeCardContentInsets | undefined,
  edge: LifeCardEdge,
) {
  return insets?.[CONTENT_EDGES[rotation][edge]] ?? 0
}

const MENU_CLEARANCE = 42
const COMPACT_MENU_CLEARANCE = 37
const CHIP_SIZE = 36
const COMPACT_CHIP_SIZE = 32

export function seatBagSize(compact?: boolean) {
  return seatIdentityMetrics(compact).icon + 8
}
const COMPACT_CHIP_WIDTH = 28
/** why: below this column width "0 Commander tax" no longer fits on one line, so items with a short label use it. */
const SHORT_LABEL_COLUMN = 180
const RULE_LINK_WIDTH = 28
/** why: a column narrower than this gives its label the room instead, and a long press on the option opens its rule. */
const RULE_BUTTON_COLUMN = 132

type Sheet = { kind: "edit"; counterId: string } | { kind: "add" } | { kind: "name" }

const ADD_TRIGGER = "add"
const LIVE_REGION_REISSUE_MS = 100

function moveFocus(target: View | null | undefined) {
  if (!target) return
  if (Platform.OS === "web") target.focus()
  else AccessibilityInfo.sendAccessibilityEvent(target, "focus")
}

export interface CounterChipsProps {
  seat: SeatTable
  dice?: SeatDiceBag
  bagAt: ({ right: number } | { left: number }) & { bottom: number }
  seatNumber: number
  identity: string
  color: string
  foreground: string
  compact?: boolean
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  menuEdgeCenter?: LifeCardMenuEdge
  cardSize: { width: number; height: number }
  nameEnd?: number
  hidden?: readonly string[]
  onRowWidth?: (width: number) => void
  bagless?: boolean
  onSheetOpenChange?: (open: boolean) => void
}

type ChipItem =
  | { kind: "designation"; key: string; designation: { id: string; label: string } }
  | {
      kind: "counter"
      key: string
      counter: TableRules["counters"][number]
      value: number
      lethal: boolean
    }

const OVERFLOW_KEY = "\u0000overflow"

export function fitChips(
  widths: readonly number[],
  room: number,
  gap: number,
  overflowWidth: number,
): { shown: number; overflow: number } {
  const all = widths.reduce((total, width, index) => total + width + (index ? gap : 0), 0)
  if (all <= room) return { shown: widths.length, overflow: 0 }
  if (overflowWidth > room) return { shown: 0, overflow: 0 }
  let used = overflowWidth
  let shown = 0
  for (const width of widths) {
    if (used + gap + width > room) break
    used += gap + width
    shown += 1
  }
  return { shown, overflow: widths.length - shown }
}

export function chipRowOrigin(input: {
  compact?: boolean
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  menuEdgeCenter?: LifeCardMenuEdge
  spacing: { xxs: number; xs: number }
}) {
  const { compact, contentRotation, contentInsets, menuEdgeCenter, spacing } = input
  const gap = compact ? spacing.xxs : spacing.xs
  const menuClearance =
    menuEdgeCenter === CONTENT_EDGES[contentRotation].top
      ? compact
        ? COMPACT_MENU_CLEARANCE
        : MENU_CLEARANCE
      : 0
  return {
    top: gap + contentInset(contentRotation, contentInsets, "top") + menuClearance,
    left: gap + contentInset(contentRotation, contentInsets, "left"),
  }
}

export const CounterChips = memo(function CounterChips({
  seat,
  seatNumber,
  identity,
  color,
  foreground,
  compact,
  contentRotation,
  contentInsets,
  menuEdgeCenter,
  cardSize,
  nameEnd,
  hidden,
  onRowWidth,
  bagless,
  dice,
  bagAt,
  onSheetOpenChange,
}: CounterChipsProps) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const longPressed = useRef(false)
  const triggers = useRef(new Map<string, View>()).current
  const returnFocusTo = useRef<string | null>(null)
  const trigger = (key: string) => (node: View | null) => {
    if (node) triggers.set(key, node)
    else triggers.delete(key)
  }
  const openSheet = (next: Sheet, from: string) => {
    returnFocusTo.current = from
    setSheet(next)
  }
  const { rules, counters, held, editable } = seat
  const items: ChipItem[] = [
    ...rules.designations.flatMap((designation) =>
      held.includes(designation.id)
        ? [{ kind: "designation" as const, key: designation.id, designation }]
        : [],
    ),
    ...rules.counters.flatMap((counter) => {
      const value = counters[counter.id] ?? 0
      return value > 0 && !hidden?.includes(counter.id)
        ? [
            {
              kind: "counter" as const,
              key: counter.id,
              counter,
              value,
              lethal: counter.losesAt !== undefined && value >= counter.losesAt,
            },
          ]
        : []
    }),
  ]
  const [widths, setWidths] = useState<Readonly<Record<string, number>>>({})
  const measure = (key: string, width: number) =>
    setWidths((current) => (current[key] === width ? current : { ...current, [key]: width }))
  const webAnnouncement = useAnnouncements(seat, identity)
  const [rowWidth, setRowWidth] = useState(0)
  const shownRowWidth = items.length > 0 ? rowWidth : 0
  useEffect(() => {
    onRowWidth?.(shownRowWidth)
  }, [onRowWidth, shownRowWidth])
  const sheetOpen = sheet !== null

  useEffect(() => {
    if (editable) return
    returnFocusTo.current = null
    setSheet(null)
  }, [editable])

  useEffect(() => {
    if (sheetOpen || returnFocusTo.current === null) return
    const from = returnFocusTo.current
    returnFocusTo.current = null
    moveFocus(triggers.get(from) ?? triggers.get(ADD_TRIGGER))
  }, [sheetOpen, triggers])

  useEffect(() => {
    if (!sheetOpen) return
    onSheetOpenChange?.(true)
    return () => onSheetOpenChange?.(false)
  }, [onSheetOpenChange, sheetOpen])

  if (cardSize.width === 0 || cardSize.height === 0) return null
  const frame = contentFrame(contentRotation, cardSize)
  const frameWidth = Math.abs(contentRotation) === 90 ? cardSize.height : cardSize.width
  const frameHeight = Math.abs(contentRotation) === 90 ? cardSize.width : cardSize.height
  const bagSize = seatBagSize(compact)
  const glyphSize = compact ? 13 : 15
  const { top } = chipRowOrigin({
    compact,
    contentRotation,
    contentInsets,
    menuEdgeCenter,
    spacing,
  })
  const bagSlop = targetSlop({ width: bagSize, height: bagSize }, bagAt)
  const bagShown = !bagless && (editable || !!dice)
  const chipGap = compact ? spacing.xxxs : spacing.xxs
  const fromLeft = "left" in bagAt
  const bagInset = fromLeft ? bagAt.left : bagAt.right
  const rowInset = bagInset + (bagShown ? bagSize + chipGap : 0)
  const menuOnRow = menuEdgeCenter === CONTENT_EDGES[contentRotation].bottom
  const stopAt = nameEnd ?? frameWidth / 2
  const room = Math.max(
    0,
    Math.min(
      (fromLeft ? stopAt - rowInset : frameWidth - rowInset - stopAt) - chipGap,
      menuOnRow
        ? frameWidth / 2 - (compact ? COMPACT_MENU_CLEARANCE : MENU_CLEARANCE) - rowInset
        : Infinity,
    ),
  )
  const unmeasured = compact ? COMPACT_CHIP_WIDTH : CHIP_SIZE
  const fit = fitChips(
    items.map((item) => widths[item.key] ?? unmeasured),
    room,
    chipGap,
    widths[OVERFLOW_KEY] ?? unmeasured,
  )
  const chipBox = themed(compact ? $compactChip : $chip)
  const chipStyleOf = (item: ChipItem) => [
    chipBox,
    item.kind === "counter" && item.lethal && { borderColor: foreground },
  ]
  const chipFace = (item: ChipItem) => {
    if (item.kind === "designation")
      return <TableGlyph id={item.designation.id} size={glyphSize} color={foreground} />
    const customName = customCounterNameOf(item.counter.id)
    return (
      <>
        {customName === undefined ? (
          <TableGlyph id={item.counter.id} size={glyphSize} color={foreground} />
        ) : (
          <Text
            text={customName}
            size="xxs"
            weight="bold"
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
            style={[compact ? $compactCustomChipName : $customChipName, { color: foreground }]}
          />
        )}
        <Text
          text={String(item.value)}
          weight={item.lethal ? "bold" : "medium"}
          maxFontSizeMultiplier={1.2}
          style={[themed(compact ? $compactValue : $value), { color: foreground }]}
        />
      </>
    )
  }
  const overflowFace = (count: number) => (
    <Text
      text={`+${count}`}
      weight="bold"
      maxFontSizeMultiplier={1.2}
      style={[themed(compact ? $compactValue : $value), { color: foreground }]}
    />
  )
  return (
    <>
      {Platform.OS === "web" ? (
        <Text
          testID={`counter-announcer-seat-${seatNumber}`}
          text={webAnnouncement}
          accessibilityLiveRegion="polite"
          style={$visuallyHidden}
        />
      ) : null}
      {!sheetOpen && items.length > 0 ? (
        <View
          testID={`counter-chips-frame-seat-${seatNumber}`}
          pointerEvents="box-none"
          style={[frame, $layer]}
        >
          <View
            pointerEvents="none"
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[$measureRow, { gap: chipGap }]}
          >
            {items.map((item) => (
              <View
                key={item.key}
                onLayout={({ nativeEvent }) => measure(item.key, nativeEvent.layout.width)}
                style={chipStyleOf(item)}
              >
                {chipFace(item)}
              </View>
            ))}
            <View
              onLayout={({ nativeEvent }) => measure(OVERFLOW_KEY, nativeEvent.layout.width)}
              style={chipBox}
            >
              {overflowFace(items.length)}
            </View>
          </View>
          <View
            testID={`counter-chips-seat-${seatNumber}`}
            pointerEvents="box-none"
            onLayout={({ nativeEvent: { layout } }) => setRowWidth(layout.width)}
            style={[
              $bottomRow,
              fromLeft ? [$fromLeft, { left: rowInset }] : [$fromRight, { right: rowInset }],
              { gap: chipGap, bottom: bagAt.bottom, height: bagSize },
            ]}
          >
            {items.slice(0, fit.shown).map((item) => {
              const style = chipStyleOf(item)
              if (item.kind === "designation")
                return (
                  <View
                    key={item.key}
                    testID={`designation-chip-${seatNumber}-${item.designation.id}`}
                    accessible
                    accessibilityLabel={translate("board:counters.seatItem", {
                      identity,
                      label: tableItemLabel(item.designation),
                    })}
                    style={style}
                  >
                    {chipFace(item)}
                  </View>
                )
              const { counter, value } = item
              const counterLabel = tableItemLabel(counter)
              const label = translate("board:counters.seatItem", { identity, label: counterLabel })
              const valueText =
                counter.losesAt !== undefined
                  ? translate("board:counters.valueOutOf", { value, max: counter.losesAt })
                  : String(value)
              if (!editable)
                return (
                  <View
                    key={item.key}
                    testID={`counter-chip-${seatNumber}-${counter.id}`}
                    accessible
                    accessibilityLabel={label}
                    accessibilityValue={{ text: valueText }}
                    style={style}
                  >
                    {chipFace(item)}
                  </View>
                )
              return (
                <BoardPressable
                  key={item.key}
                  ref={trigger(counter.id)}
                  testID={`counter-chip-${seatNumber}-${counter.id}`}
                  accessibilityRole="adjustable"
                  accessibilityLabel={label}
                  accessibilityValue={{ text: valueText }}
                  accessibilityHint={translate("board:counters.chipHint", { step: counter.step })}
                  accessibilityActions={[
                    { name: "increment" },
                    { name: "decrement" },
                    {
                      name: "longpress",
                      label: translate("board:counters.edit", { label: counterLabel }),
                    },
                  ]}
                  onAccessibilityAction={({ nativeEvent }) => {
                    if (nativeEvent.actionName === "increment")
                      seat.adjustCounter(counter.id, counter.step)
                    else if (nativeEvent.actionName === "decrement")
                      seat.adjustCounter(counter.id, -Math.min(counter.step, value))
                    else if (nativeEvent.actionName === "longpress")
                      openSheet({ kind: "edit", counterId: counter.id }, counter.id)
                  }}
                  hitSlop={{ top: 6, bottom: 6 }}
                  delayLongPress={450}
                  onPressIn={() => {
                    longPressed.current = false
                  }}
                  onLongPress={() => {
                    longPressed.current = true
                    openSheet({ kind: "edit", counterId: counter.id }, counter.id)
                  }}
                  onPress={() => {
                    if (longPressed.current) return
                    seat.adjustCounter(counter.id, counter.step)
                  }}
                  style={({ pressed }) => [
                    style,
                    pressed && { backgroundColor: overlayTint(foreground, 0.14) },
                  ]}
                >
                  {chipFace(item)}
                </BoardPressable>
              )
            })}
            {fit.overflow > 0 ? (
              bagShown ? (
                <BoardPressable
                  testID={`counter-overflow-seat-${seatNumber}`}
                  accessibilityRole="button"
                  accessibilityLabel={translate("board:counters.more", {
                    identity,
                    count: fit.overflow,
                  })}
                  hitSlop={{ top: 6, bottom: 6 }}
                  onPress={() => openSheet({ kind: "add" }, ADD_TRIGGER)}
                  style={({ pressed }) => [
                    chipBox,
                    pressed && { backgroundColor: overlayTint(foreground, 0.14) },
                  ]}
                >
                  {overflowFace(fit.overflow)}
                </BoardPressable>
              ) : (
                <View
                  testID={`counter-overflow-seat-${seatNumber}`}
                  accessible
                  accessibilityLabel={translate("board:counters.more", {
                    identity,
                    count: fit.overflow,
                  })}
                  style={chipBox}
                >
                  {overflowFace(fit.overflow)}
                </View>
              )
            ) : null}
          </View>
        </View>
      ) : null}
      {!sheetOpen && bagShown ? (
        <View pointerEvents="box-none" style={[frame, $layer]}>
          <BoardPressable
            ref={trigger(ADD_TRIGGER)}
            testID={`seat-bag-seat-${seatNumber}`}
            accessibilityRole="button"
            accessibilityLabel={translate("board:dice.openBag", { identity })}
            hitSlop={bagSlop}
            onPress={() => openSheet({ kind: "add" }, ADD_TRIGGER)}
            style={({ pressed }) => [
              themed(compact ? $compactChip : $chip),
              themed($addChip),
              { position: "absolute", ...bagAt, width: bagSize, height: bagSize },
              pressed && { backgroundColor: overlayTint(foreground, 0.14) },
            ]}
          >
            <DiceBagGlyph inkHeight={seatIdentityMetrics(compact).icon} color={foreground} />
          </BoardPressable>
        </View>
      ) : null}
      {sheet?.kind === "name" && Platform.OS !== "web" ? (
        <CounterNameSlot
          cardSize={cardSize}
          request={{
            seatNumber,
            color,
            compact,
            rotation: contentRotation,
            close: {
              left: fromLeft ? bagAt.left : frameWidth - bagAt.right - bagSize,
              top: frameHeight - bagAt.bottom - bagSize,
              size: bagSize,
              glyph: compact ? 13 : 15,
              slop: bagSlop,
            },
            taken: seat.rules.counters.flatMap(({ id }) => customCounterNameOf(id) ?? []),
            onAdd: (name) => {
              seat.adjustCounter(customCounterId(name), 1)
              rememberCounterName(name)
              setSheet(null)
            },
            onClose: () => setSheet(null),
          }}
        />
      ) : sheet ? (
        <CounterSheet
          sheet={sheet}
          seat={seat}
          seatNumber={seatNumber}
          identity={identity}
          color={color}
          compact={compact}
          frame={frame}
          width={frameWidth}
          contentRotation={contentRotation}
          contentInsets={contentInsets}
          closeSlop={bagSlop}
          closeButton={{
            left: fromLeft ? bagAt.left : frameWidth - bagAt.right - bagSize,
            top: frameHeight - bagAt.bottom - bagSize,
            size: bagSize,
          }}
          topClearance={top}
          dice={dice}
          onEdit={(counterId) => setSheet({ kind: "edit", counterId })}
          onName={() => setSheet({ kind: "name" })}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  )
}, structurallyEqual)

/**
 * why: every counter change is spoken once, from this device or another; a moved designation only for the seat that took it. react-native-web's announce is a no-op, so web gets the message back for a polite live region.
 */
function useAnnouncements({ rules, counters, held }: SeatTable, identity: string) {
  const previous = useRef({ counters, held })
  const [webMessage, setWebMessage] = useState("")
  const reissue = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(reissue.current), [])
  useEffect(() => {
    const before = previous.current
    previous.current = { counters, held }
    const changes = [
      ...rules.counters.flatMap((counter) => {
        const value = counters[counter.id] ?? 0
        return value === (before.counters[counter.id] ?? 0)
          ? []
          : [translate("board:counters.changed", { label: tableItemLabel(counter), value })]
      }),
      ...rules.designations.flatMap((designation) =>
        held.includes(designation.id) && !before.held.includes(designation.id)
          ? [translate("board:counters.nowHolds", { label: tableItemLabel(designation) })]
          : [],
      ),
    ]
    if (changes.length === 0) return
    const message = translate("board:counters.announcement", {
      identity,
      changes: changes.join(", "),
    })
    if (Platform.OS !== "web") return AccessibilityInfo.announceForAccessibility(message)
    // why: a live region only speaks when its text changes, so it clears first and the message lands a beat later; retaking Monarch is read again.
    clearTimeout(reissue.current)
    setWebMessage("")
    reissue.current = setTimeout(() => setWebMessage(message), LIVE_REGION_REISSUE_MS)
  }, [counters, held, identity, rules])
  return webMessage
}

function CounterSheet({
  sheet,
  seat,
  seatNumber,
  identity,
  color,
  compact,
  frame,
  width,
  contentRotation,
  contentInsets,
  closeButton,
  closeSlop,
  topClearance,
  dice,
  onEdit,
  onName,
  onClose,
}: {
  sheet: Sheet
  seat: SeatTable
  seatNumber: number
  identity: string
  color: string
  compact?: boolean
  frame: ViewStyle
  width: number
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  /** why: Close sits exactly where the bag was, so the same tap opens and closes the sheet. */
  closeButton: { left: number; top: number; size: number; width?: number }
  closeSlop: Insets
  topClearance: number
  dice?: SeatDiceBag
  onEdit: (counterId: string) => void
  onName: () => void
  onClose: () => void
}) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const sheetColor = mixColorsInLinearLight(color, "#000000", 0.34)
  const fade = useReducedMotion() === false
  const slide = useCornerSlide()
  const ink = accessibleForeground(sheetColor)
  const gap = compact ? spacing.xxs : spacing.xs
  const trackers =
    seat.rules.counters.length + seat.rules.designations.length > 0 || !!seat.rules.customCounters
  // why: with both, dice take the bag's half of the card and trackers the other, so neither scrolls; only the dice half keeps clear of Close in its corner.
  const split = !!dice && trackers && sheet.kind === "add"
  const closeOnLeft = closeButton.left < width / 2
  const [allDice, setAllDice] = useState(false)
  const closeRow = closeButton.size + gap
  const padding = {
    paddingTop: topClearance,
    paddingBottom:
      gap + (split ? 0 : closeRow) + contentInset(contentRotation, contentInsets, "bottom"),
    paddingLeft: sheetSideInset(contentRotation, contentInsets, "left"),
    paddingRight: sheetSideInset(contentRotation, contentInsets, "right"),
  }
  const sheetWidth = width - padding.paddingLeft - padding.paddingRight
  const slim = split && sheetWidth - NARROW_DICE_WIDTH - DIVIDER_SPACE < TRACKER_LABEL_MIN
  const diceColumn = slim ? SLIM_DICE_WIDTH : NARROW_DICE_WIDTH
  const trackerWidth = sheetWidth - (split ? diceColumn + DIVIDER_SPACE : 0)
  const oneColumn = trackerWidth / 2 < TWO_COLUMN_MIN
  const optionColumn = oneColumn ? trackerWidth : trackerWidth / 2
  const strip = split && allDice && !slim
  const iconOnly = slim || strip
  // why: beside the trackers, every die on a slim sheet runs off the card, so the dice take the whole sheet and the lit more button is the way back.
  const showTrackers = trackers && !(slim && allDice)
  const roomForRule = optionColumn >= RULE_BUTTON_COLUMN && !iconOnly
  const counter =
    sheet.kind === "edit" ? seat.rules.counters.find(({ id }) => id === sheet.counterId) : undefined
  const value = counter ? (seat.counters[counter.id] ?? 0) : 0
  const counterLabel = counter ? tableItemLabel(counter) : ""
  const ruleId = counter && seat.tableItemRules?.[counter.id]
  const { openRule } = seat
  const optionRule = (id: string) => {
    const rule = seat.tableItemRules?.[id]
    return rule && openRule ? { id: rule, onPress: () => openRule(rule) } : undefined
  }
  const firstControl = useRef<View>(null)
  const sheetKey = sheet.kind === "edit" ? sheet.counterId : sheet.kind
  const customCount = seat.rules.counters.filter(({ id }) => customCounterNameOf(id)).length
  const offersCustom = seat.rules.customCounters === true && customCount < MAX_CUSTOM_COUNTERS
  useEffect(() => moveFocus(firstControl.current), [sheetKey])

  return (
    // why: a layout animation owns its view's transform, so the fade wraps the turned frame rather than sitting on it.
    <Animated.View
      pointerEvents="box-none"
      entering={fade ? FadeIn.duration(SHEET_FADE_MS) : undefined}
      exiting={fade ? FadeOut.duration(SHEET_FADE_MS) : undefined}
      style={[StyleSheet.absoluteFill, $sheet]}
    >
      <View
        testID={`counter-sheet-seat-${seatNumber}`}
        accessibilityViewIsModal
        style={[frame, padding, { backgroundColor: sheetColor }]}
      >
        {counter ? (
          <>
            <View pointerEvents="box-none" style={$halves}>
              {([-1, 1] as const).map((direction) => (
                <BoardPressable
                  key={direction}
                  ref={direction < 0 ? firstControl : undefined}
                  testID={`counter-edit-${seatNumber}-${counter.id}-${direction > 0 ? "plus" : "minus"}`}
                  accessibilityRole="button"
                  accessibilityLabel={translate(
                    direction > 0 ? "board:counters.add" : "board:counters.subtract",
                    { identity, step: counter.step, label: counterLabel },
                  )}
                  onPress={() =>
                    seat.adjustCounter(
                      counter.id,
                      direction > 0 ? counter.step : -Math.min(counter.step, value),
                    )
                  }
                  style={({ pressed }) => [
                    themed($half),
                    { alignItems: direction > 0 ? "flex-end" : "flex-start" },
                    pressed && { backgroundColor: overlayTint(ink, 0.14) },
                  ]}
                >
                  <Text
                    text={direction > 0 ? "+" : "−"}
                    style={[themed(compact ? $compactSheetGlyph : $sheetGlyph), { color: ink }]}
                  />
                </BoardPressable>
              ))}
            </View>
            <View pointerEvents="box-none" style={themed($sheetHeader)}>
              <View pointerEvents="none" style={[themed($sheetHeader), $shrink]}>
                <TableGlyph id={counter.id} size={16} color={ink} />
                <Text
                  text={counterLabel}
                  weight="bold"
                  size="xs"
                  numberOfLines={1}
                  style={[$shrink, { color: ink }]}
                />
              </View>
              {ruleId && openRule ? (
                <BoardPressable
                  testID={`counter-rule-${seatNumber}`}
                  accessibilityRole="link"
                  accessibilityLabel={translate("board:counters.rule", { rule: ruleId })}
                  hitSlop={8}
                  onPress={() => openRule(ruleId)}
                >
                  <Text text={`§${ruleId}`} size="xs" style={[$ruleLink, { color: ink }, $muted]} />
                </BoardPressable>
              ) : null}
            </View>
            <View pointerEvents="none" style={$sheetCenter}>
              <Text
                testID={`counter-edit-value-${seatNumber}`}
                text={String(value)}
                maxFontSizeMultiplier={1.2}
                style={[themed(compact ? $compactSheetValue : $sheetValue), { color: ink }]}
              />
            </View>
            <View pointerEvents="box-none" style={themed($sheetFooter)}>
              <SheetTextButton
                testID={`counter-remove-${seatNumber}`}
                text={translate("common:remove")}
                accessibilityLabel={translate("board:counters.remove", { label: counterLabel })}
                ink={ink}
                onPress={() => {
                  if (value > 0) seat.adjustCounter(counter.id, -value)
                  onClose()
                }}
              />
            </View>
          </>
        ) : sheet.kind === "name" ? (
          <View style={[$fill, KEYBOARD_CLEAR_HALF[contentRotation]]}>
            <NameCounter
              seatNumber={seatNumber}
              ink={ink}
              taken={seat.rules.counters.flatMap(({ id }) => customCounterNameOf(id) ?? [])}
              onAdd={(name) => {
                seat.adjustCounter(customCounterId(name), 1)
                rememberCounterName(name)
                onClose()
              }}
            />
          </View>
        ) : (
          <>
            {/* why: six Commander options outgrow the shortest compact seats; scrolling keeps every option and Close reachable. */}
            <View
              testID={`counter-options-seat-${seatNumber}`}
              style={split ? [$split, closeOnLeft && $splitReversed] : $optionScroll}
            >
              {showTrackers ? (
                <Animated.View layout={slide} style={strip ? $iconStrip : $optionScroll}>
                  <ScrollView
                    style={$optionScroll}
                    contentContainerStyle={[$optionScrollContent, themed($options)]}
                  >
                    {seat.rules.counters.map((option, index) => {
                      const current = seat.counters[option.id] ?? 0
                      const optionLabel = tableItemLabel(option)
                      const rule = optionRule(option.id)
                      const shortLabel =
                        optionColumn <
                        SHORT_LABEL_COLUMN + (rule && roomForRule ? RULE_LINK_WIDTH : 0)
                      return (
                        <SheetOption
                          key={option.id}
                          ref={index === 0 ? firstControl : undefined}
                          testID={`counter-option-${seatNumber}-${option.id}`}
                          id={option.id}
                          label={shortLabel ? tableItemShortLabel(option) : optionLabel}
                          value={current}
                          accessibilityLabel={
                            current > 0
                              ? translate("board:counters.editWithValue", {
                                  label: optionLabel,
                                  value: current,
                                })
                              : translate("board:counters.add", {
                                  identity,
                                  step: option.step,
                                  label: optionLabel,
                                })
                          }
                          ink={ink}
                          rule={rule}
                          ruleButton={roomForRule}
                          oneColumn={oneColumn}
                          stacked={strip}
                          ruleTestID={`counter-rule-${seatNumber}-${option.id}`}
                          iconOnly={iconOnly}
                          slide={slide}
                          fade={fade}
                          onPress={() => {
                            if (split && allDice) return setAllDice(false)
                            if (current > 0) return onEdit(option.id)
                            seat.adjustCounter(option.id, option.step)
                            onClose()
                          }}
                        />
                      )
                    })}
                    {seat.rules.designations.map((option, index) => {
                      const holds = seat.held.includes(option.id)
                      const optionLabel = tableItemLabel(option)
                      return (
                        <SheetOption
                          key={option.id}
                          ref={
                            index === 0 && seat.rules.counters.length === 0
                              ? firstControl
                              : undefined
                          }
                          testID={`designation-option-${seatNumber}-${option.id}`}
                          id={option.id}
                          label={optionLabel}
                          accessibilityLabel={translate(
                            holds ? "board:counters.giveUp" : "board:counters.take",
                            { label: optionLabel },
                          )}
                          selected={holds}
                          ink={ink}
                          rule={optionRule(option.id)}
                          ruleButton={roomForRule}
                          oneColumn={oneColumn}
                          stacked={strip}
                          ruleTestID={`designation-rule-${seatNumber}-${option.id}`}
                          iconOnly={iconOnly}
                          slide={slide}
                          fade={fade}
                          onPress={() => {
                            if (split && allDice) return setAllDice(false)
                            if (holds) seat.releaseDesignation(option.id)
                            else seat.takeDesignation(option.id)
                            onClose()
                          }}
                        />
                      )
                    })}
                    {offersCustom ? (
                      <SheetOption
                        ref={
                          seat.rules.counters.length === 0 && seat.rules.designations.length === 0
                            ? firstControl
                            : undefined
                        }
                        testID={`counter-option-${seatNumber}-custom`}
                        id="plus"
                        label={translate(
                          optionColumn < SHORT_LABEL_COLUMN
                            ? "board:counters.customShort"
                            : "board:counters.custom",
                        )}
                        accessibilityLabel={translate("board:counters.custom")}
                        ink={ink}
                        ruleButton={roomForRule}
                        oneColumn={oneColumn}
                        stacked={strip}
                        ruleTestID={`counter-rule-${seatNumber}-custom`}
                        iconOnly={iconOnly}
                        slide={slide}
                        fade={fade}
                        onPress={() => {
                          if (split && allDice) return setAllDice(false)
                          onName()
                        }}
                      />
                    ) : null}
                  </ScrollView>
                </Animated.View>
              ) : null}
              {split && showTrackers ? (
                <Animated.View layout={slide} pointerEvents="none" style={$sideDividerSlot}>
                  <View style={[$sideDivider, { backgroundColor: ink }]} />
                </Animated.View>
              ) : null}
              {dice ? (
                <Animated.View
                  layout={slide}
                  style={
                    split
                      ? [
                          $narrowDice,
                          allDice ? $diceHalf : { width: diceColumn },
                          { paddingBottom: closeRow },
                        ]
                      : $diceHalf
                  }
                >
                  <DiceSection
                    seatNumber={seatNumber}
                    dice={dice}
                    ink={ink}
                    compact={compact}
                    narrow={split}
                    slim={slim}
                    allDice={allDice}
                    slide={slide}
                    fade={fade}
                    onAllDice={() => setAllDice((open) => !open)}
                    onRolled={onClose}
                  />
                </Animated.View>
              ) : null}
            </View>
          </>
        )}
        <BoardPressable
          testID={`counter-close-${seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel={translate("common:close")}
          hitSlop={closeSlop}
          onPress={onClose}
          style={({ pressed }) => [
            themed(compact ? $compactChip : $chip),
            {
              position: "absolute",
              left: closeButton.left,
              top: closeButton.top,
              minHeight: closeButton.size,
              minWidth: closeButton.width ?? closeButton.size,
            },
            pressed && { backgroundColor: overlayTint(ink, 0.14) },
          ]}
        >
          <TableGlyph id="close" size={compact ? 13 : 15} color={ink} />
        </BoardPressable>
      </View>
    </Animated.View>
  )
}

function NameCounter({
  seatNumber,
  ink,
  taken,
  onAdd,
}: {
  seatNumber: number
  ink: string
  taken: readonly string[]
  onAdd: (name: string) => void
}) {
  const { themed } = useAppTheme()
  const [draft, setDraft] = useState("")
  const [recent] = useState(() =>
    suggestedCounterNames().filter(
      (name) => !taken.some((held) => held.toLocaleLowerCase() === name.toLocaleLowerCase()),
    ),
  )
  const name = customCounterName(draft)
  return (
    <View style={themed($nameCounter)}>
      <TextField
        testID={`counter-name-${seatNumber}`}
        accessibilityLabel={translate("board:counters.customName")}
        placeholder={translate("board:counters.customName")}
        placeholderTextColor={overlayTint(ink, 0.6)}
        autoFocus
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={MAX_CUSTOM_COUNTER_NAME_LENGTH}
        returnKeyType="done"
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={() => name && onAdd(name)}
        inputWrapperStyle={[themed($nameInput), { borderColor: overlayTint(ink, 0.5) }]}
        style={{ color: ink }}
      />
      {recent.length > 0 ? (
        <View style={themed($recentNames)}>
          {recent.map((recentName) => (
            <BoardPressable
              key={recentName}
              testID={`counter-recent-${seatNumber}-${recentName}`}
              accessibilityRole="button"
              accessibilityLabel={translate("board:counters.customRecent", { label: recentName })}
              hitSlop={4}
              onPress={() => onAdd(recentName)}
              style={({ pressed }) => [
                themed($recentName),
                { borderColor: overlayTint(ink, 0.4) },
                pressed && { backgroundColor: overlayTint(ink, 0.14) },
              ]}
            >
              <Text
                text={recentName}
                size="xs"
                weight="medium"
                numberOfLines={1}
                style={{ color: ink }}
              />
            </BoardPressable>
          ))}
        </View>
      ) : null}
      {name ? (
        <View style={themed($sheetFooter)}>
          <SheetTextButton
            testID={`counter-name-add-${seatNumber}`}
            text={translate("board:counters.customAdd")}
            ink={ink}
            onPress={() => onAdd(name)}
          />
        </View>
      ) : null}
    </View>
  )
}

type SheetDice = SeatDiceBag

const QUICK_DICE: readonly DiceTool[] = ["d20", "d6", "coin"]

/** why: beside trackers the bag keeps three dice and a more button, which opens the rest over the trackers. */
function DiceSection({
  seatNumber,
  dice,
  ink,
  compact,
  narrow,
  slim,
  allDice,
  slide,
  fade,
  onAllDice,
  onRolled,
}: {
  seatNumber: number
  dice: SheetDice
  ink: string
  compact?: boolean
  narrow: boolean
  slim: boolean
  allDice: boolean
  slide?: ReturnType<typeof useCornerSlide>
  fade: boolean
  onAllDice: () => void
  onRolled: () => void
}) {
  const { themed } = useAppTheme()
  const { openPlane } = dice
  const tools = narrow && !allDice ? QUICK_DICE.slice(0, openPlane ? -1 : undefined) : dice.tools
  const glyph = slim ? 18 : compact ? 20 : 22
  const toolStyle = [themed($diceTool), slim && $slimDiceTool]
  return (
    <View style={themed($diceTools)}>
      {openPlane ? (
        <Animated.View layout={slide}>
          <BoardPressable
            testID={`bag-plane-seat-${seatNumber}`}
            accessibilityRole="button"
            accessibilityLabel={translate("board:planar.title")}
            accessibilityHint={translate("board:planar.opensPlane")}
            hitSlop={4}
            onPress={() => {
              onRolled()
              openPlane()
            }}
            style={({ pressed }) => [
              toolStyle,
              pressed && { backgroundColor: overlayTint(ink, 0.14) },
            ]}
          >
            <PlanarGlyph face="planeswalk" size={glyph} color={ink} />
          </BoardPressable>
        </Animated.View>
      ) : null}
      {tools.map((tool) => (
        <Animated.View
          key={tool}
          layout={slide}
          entering={fade ? FadeIn.duration(SHEET_FADE_MS) : undefined}
          exiting={fade ? FadeOut.duration(SHEET_FADE_MS) : undefined}
        >
          <DieButton
            seatNumber={seatNumber}
            tool={tool}
            dice={dice}
            ink={ink}
            size={slim ? 20 : compact ? 24 : 28}
            style={toolStyle}
            onRolled={onRolled}
          />
        </Animated.View>
      ))}
      {narrow ? (
        <Animated.View layout={slide}>
          <BoardPressable
            testID={`bag-more-dice-seat-${seatNumber}`}
            accessibilityRole="button"
            accessibilityLabel={translate("board:dice.moreDice")}
            accessibilityState={{ expanded: allDice }}
            hitSlop={4}
            onPress={onAllDice}
            style={({ pressed }) => [
              toolStyle,
              allDice && { backgroundColor: overlayTint(ink, 0.18) },
              pressed && { backgroundColor: overlayTint(ink, 0.14) },
            ]}
          >
            <Icon icon="more" size={glyph} color={ink} />
          </BoardPressable>
        </Animated.View>
      ) : null}
    </View>
  )
}

function DieButton({
  seatNumber,
  tool,
  dice,
  ink,
  size,
  style,
  onRolled,
}: {
  seatNumber: number
  tool: DiceTool
  dice: SheetDice
  ink: string
  size: number
  style: StyleProp<ViewStyle>
  onRolled: () => void
}) {
  const rollForSeat = () => {
    onRolled()
    dice.rollFor(tool)
  }
  return (
    <BoardPressable
      testID={`bag-tool-${tool}-seat-${seatNumber}`}
      accessibilityRole="button"
      accessibilityLabel={toolLabel(tool)}
      hitSlop={4}
      onPress={rollForSeat}
      style={({ pressed }) => [style, pressed && { backgroundColor: overlayTint(ink, 0.14) }]}
    >
      <DieFace tool={tool} size={size} color={ink} />
    </BoardPressable>
  )
}

function SheetTextButton({
  testID,
  text,
  accessibilityLabel = text,
  ink,
  onPress,
}: {
  testID: string
  text: string
  accessibilityLabel?: string
  ink: string
  onPress: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <BoardPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        themed($textButton),
        pressed && { backgroundColor: overlayTint(ink, 0.14) },
      ]}
    >
      <Text text={text} weight="bold" size="xs" style={{ color: ink }} />
    </BoardPressable>
  )
}

function SheetOption({
  ref,
  testID,
  id,
  label,
  value,
  accessibilityLabel,
  selected,
  ink,
  rule,
  ruleButton,
  ruleTestID,
  iconOnly,
  stacked,
  oneColumn,
  slide,
  fade,
  onPress,
}: {
  ruleButton: boolean
  iconOnly?: boolean
  stacked?: boolean
  oneColumn?: boolean
  slide?: ReturnType<typeof useCornerSlide>
  fade?: boolean
  ref?: Ref<View>
  testID: string
  id: string
  label: string
  value?: number
  accessibilityLabel: string
  selected?: boolean
  ink: string
  rule?: { id: string; onPress: () => void }
  ruleTestID: string
  onPress: () => void
}) {
  const { themed } = useAppTheme()
  const fadeIn = fade ? FadeIn.duration(SHEET_FADE_MS) : undefined
  const fadeOut = fade ? FadeOut.duration(SHEET_FADE_MS) : undefined
  return (
    <Animated.View layout={slide} style={[$optionCell, oneColumn && !iconOnly && $oneColumnCell]}>
      <BoardPressable
        ref={ref}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected: !!selected }}
        accessibilityActions={
          rule && !ruleButton
            ? [
                { name: "activate" },
                { name: "longpress", label: translate("board:counters.rule", { rule: rule.id }) },
              ]
            : undefined
        }
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "longpress") rule?.onPress()
          else if (nativeEvent.actionName === "activate") onPress()
        }}
        onLongPress={rule && !ruleButton ? rule.onPress : undefined}
        onPress={onPress}
        style={({ pressed }) => [
          themed($option),
          !ruleButton && themed($tightOption),
          stacked && $stackedOption,
          !(rule && ruleButton) && $optionFill,
          pressed && { backgroundColor: overlayTint(ink, 0.14) },
        ]}
      >
        <Animated.View layout={slide}>
          <TableGlyph id={id} size={16} color={ink} />
        </Animated.View>
        {iconOnly ? (
          <>
            {value ? (
              <Text
                text={String(value)}
                weight="bold"
                size="xs"
                style={[themed($optionValue), { color: ink }]}
              />
            ) : null}
            {selected ? <View style={[themed($selectedDot), { backgroundColor: ink }]} /> : null}
          </>
        ) : (
          <Animated.View entering={fadeIn} exiting={fadeOut} style={themed($optionWords)}>
            {value ? (
              <Text
                text={String(value)}
                weight="bold"
                size="xs"
                style={[themed($optionValue), { color: ink }]}
              />
            ) : null}
            <Text
              testID={`${testID}-label`}
              text={label}
              weight={selected ? "bold" : "medium"}
              size={ruleButton ? "xs" : "xxs"}
              numberOfLines={oneColumn ? ONE_COLUMN_LABEL_LINES : 1}
              adjustsFontSizeToFit={oneColumn}
              minimumFontScale={ONE_COLUMN_MIN_FONT_SCALE}
              style={[themed($optionLabel), { color: ink }, !selected && $muted]}
            />
            {selected ? <View style={[themed($selectedDot), { backgroundColor: ink }]} /> : null}
          </Animated.View>
        )}
      </BoardPressable>
      {rule && ruleButton ? (
        <Animated.View entering={fadeIn} exiting={fadeOut}>
          <BoardPressable
            testID={ruleTestID}
            accessibilityRole="link"
            accessibilityLabel={translate("board:counters.rule", { rule: rule.id })}
            hitSlop={6}
            onPress={rule.onPress}
            style={({ pressed }) => [
              themed($optionRule),
              pressed && { backgroundColor: overlayTint(ink, 0.14) },
            ]}
          >
            <Icon icon="info" size={15} color={ink} containerStyle={$muted} />
          </BoardPressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

const $layer: ViewStyle = { zIndex: 10 }

const $customChipName: TextStyle = { maxWidth: 72 }
const $compactCustomChipName: TextStyle = { maxWidth: 48 }

const $measureRow: ViewStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  flexDirection: "row",
  opacity: 0,
}

const $bottomRow: ViewStyle = { position: "absolute", alignItems: "center" }
const $fromLeft: ViewStyle = { flexDirection: "row" }
const $fromRight: ViewStyle = { flexDirection: "row-reverse" }

const $fill: ViewStyle = { flex: 1 }

/** why: the keyboard rises from the screen's bottom edge, which a sideways seat's content runs along, so naming a counter keeps to the half nearest the top of the screen. */
const KEYBOARD_CLEAR_HALF: Record<LifeCardContentRotation, ViewStyle | undefined> = {
  0: undefined,
  180: undefined,
  90: { width: "50%", alignSelf: "flex-start" },
  [-90]: { width: "50%", alignSelf: "flex-end" },
}

const $nameCounter: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  gap: spacing.xs,
  paddingHorizontal: spacing.xs,
})

const $nameInput: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "transparent",
  borderBottomWidth: 1.5,
  borderLeftWidth: 0,
  borderRadius: 0,
  borderRightWidth: 0,
  borderTopWidth: 0,
})

const $recentNames: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xxs,
})

const $recentName: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  borderRadius: radius.sm,
  borderWidth: 1,
  minHeight: 32,
  justifyContent: "center",
  paddingHorizontal: spacing.xs,
})

const $chip: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
  minHeight: CHIP_SIZE,
  minWidth: CHIP_SIZE,
  justifyContent: "center",
  paddingHorizontal: spacing.xs,
  borderRadius: radius.md,
  borderWidth: 1.5,
  borderColor: "transparent",
})

const $compactChip: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxxs,
  minHeight: COMPACT_CHIP_SIZE,
  minWidth: COMPACT_CHIP_WIDTH,
  justifyContent: "center",
  paddingHorizontal: spacing.xxs,
  borderRadius: radius.md,
  borderWidth: 1.5,
  borderColor: "transparent",
})

// why: the lowest opacity that keeps the plus at 3:1 on every seat color.
const $addChip: ThemedStyle<ViewStyle> = () => ({ opacity: 0.7 })

const $value: ThemedStyle<TextStyle> = () => ({
  fontSize: 15,
  lineHeight: 18,
  fontVariant: ["tabular-nums"],
})

const $compactValue: ThemedStyle<TextStyle> = () => ({
  fontSize: 13,
  lineHeight: 16,
  fontVariant: ["tabular-nums"],
})

const $sheet: ViewStyle = { zIndex: 20 }

const $halves: ViewStyle = { ...StyleSheet.absoluteFill, flexDirection: "row" }

const $half: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
})

const $sheetGlyph: ThemedStyle<TextStyle> = () => ({ fontSize: 40, lineHeight: 46, opacity: 0.6 })
const $compactSheetGlyph: ThemedStyle<TextStyle> = () => ({
  fontSize: 28,
  lineHeight: 32,
  opacity: 0.6,
})

const $sheetHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xxs,
})

const $shrink: ViewStyle = { flexShrink: 1 }

const $ruleLink: TextStyle = { textDecorationLine: "underline" }

const $sheetCenter: ViewStyle = { flex: 1, alignItems: "center", justifyContent: "center" }

const $sheetValue: ThemedStyle<TextStyle> = () => ({
  fontSize: 72,
  lineHeight: 80,
  fontVariant: ["tabular-nums"],
})

const $compactSheetValue: ThemedStyle<TextStyle> = () => ({
  fontSize: 48,
  lineHeight: 54,
  fontVariant: ["tabular-nums"],
})

const $sheetFooter: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
})

const $textButton: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  minHeight: 36,
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
  borderRadius: radius.md,
})

const $optionScroll: ViewStyle = { flex: 1 }

const $diceTools: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: spacing.xxxs,
})

const $diceTool: ThemedStyle<ViewStyle> = ({ radius }) => ({
  minWidth: DICE_TOOL_SIZE,
  minHeight: DICE_TOOL_SIZE,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: radius.md,
})

const $optionScrollContent: ViewStyle = { flexGrow: 1, alignItems: "center" }

const $options: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  alignContent: "center",
  rowGap: spacing.xxxs,
})

const $optionCell: ViewStyle = { flexDirection: "row", width: "50%" }

const $stackedOption: ViewStyle = { flexDirection: "column", justifyContent: "center", gap: 0 }

const $oneColumnCell: ViewStyle = { width: "100%" }

// why: a one-column bag on a crowded corner seat leaves about 42pt for a name, so a 20-character custom name needs three lines at 9pt to read in full.
const ONE_COLUMN_LABEL_LINES = 3
const ONE_COLUMN_MIN_FONT_SCALE = 0.75

// why: a narrower two-up column leaves no room for a name beside the glyph and value, so a crowded seat's trackers show bare values.
const TWO_COLUMN_MIN = 88

const $optionWords: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexShrink: 1,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $iconStrip: ViewStyle = { width: 2 * (16 + 2 * 4) + 8 }

const $split: ViewStyle = { flex: 1, flexDirection: "row" }
const $splitReversed: ViewStyle = { flexDirection: "row-reverse" }

const $diceHalf: ViewStyle = { flex: 1, justifyContent: "center" }

const $narrowDice: ViewStyle = { justifyContent: "center" }

const NARROW_DICE_WIDTH = 84
const SLIM_DICE_TOOL_SIZE = 32
const SLIM_DICE_WIDTH = SLIM_DICE_TOOL_SIZE
// why: below this a tracker name wraps a letter or two per line.
const TRACKER_LABEL_MIN = 72
const DIVIDER_SPACE = 2 * 8 + 1.5
// why: matches the life calculator, the card's other sheet, so both open and close alike.
const SHEET_FADE_MS = 160

// why: a layout transition owns its view's opacity, so the faded hairline sits inside the sliding slot.
const $sideDividerSlot: ViewStyle = { marginHorizontal: 8, marginVertical: 12 }
const $sideDivider: ViewStyle = { flex: 1, width: 1.5, borderRadius: radius.full, opacity: 0.3 }

const DICE_TOOL_SIZE = 40
const $slimDiceTool: ViewStyle = { minWidth: SLIM_DICE_TOOL_SIZE, minHeight: SLIM_DICE_TOOL_SIZE }
// why: a tight tracker row pads its icon by 4, which lands the icon where the life − and + ink.
const SHEET_SIDE = 14

const $option: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  flexShrink: 1,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  minHeight: 40,
  paddingHorizontal: spacing.xs,
  borderRadius: radius.md,
})

const $tightOption: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxs,
  paddingHorizontal: spacing.xxs,
})

// why: an option with a rule link keeps its content width, so the link sits beside its own label instead of the next option's.
const $optionFill: ViewStyle = { flex: 1 }

const $optionRule: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  justifyContent: "center",
  minHeight: 40,
  paddingHorizontal: spacing.xxs,
  borderRadius: radius.md,
})

const $optionLabel: ThemedStyle<TextStyle> = () => ({ flexShrink: 1 })

const $muted: TextStyle = { opacity: 0.78 }

const $optionValue: ThemedStyle<TextStyle> = () => ({
  fontVariant: ["tabular-nums"],
})

const $visuallyHidden: TextStyle = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  opacity: 0,
}

const $selectedDot: ThemedStyle<ViewStyle> = () => ({
  width: 6,
  height: 6,
  borderRadius: radius.full,
  marginLeft: "auto",
})
