import { memo, useEffect, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native"
import Svg, { Circle, Path } from "react-native-svg"

import type { TableRules } from "@/features/game/playSystems"
import type { TableRuntime } from "@/features/game/tableRuntime"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"

import { BoardPressable } from "./BoardPressable"
import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import { overlayTint } from "./LifeControls"
import type {
  LifeCardContentInsets,
  LifeCardContentRotation,
  LifeCardEdge,
  LifeCardMenuEdge,
} from "./playerCardTypes"
import { Text } from "./Text"
import { playerTableOf } from "../../convex/lib/table"

/** why: what one seat shows and may change. The plain parts compare structurally in the memoized card; PlayerGrid keeps the callbacks stable. */
export interface SeatTable {
  rules: TableRules
  counters: Readonly<Record<string, number>>
  /** why: designation ids this seat holds, in rules order. */
  held: readonly string[]
  /** why: connected seats owned by another device still show their chips, but only the owner changes them. */
  editable: boolean
  adjustCounter: (counterId: string, delta: number) => void
  takeDesignation: (designationId: string) => void
  releaseDesignation: (designationId: string) => void
}

const NO_COUNTERS: Readonly<Record<string, number>> = {}

/** why: the per-seat slice of the table, or nothing when the game's rules have no counters or designations to show. */
export function seatTableState(
  runtime: TableRuntime | undefined,
  playerId: string,
): Pick<SeatTable, "rules" | "counters" | "held"> | undefined {
  if (!runtime) return undefined
  const { table, tableRules: rules } = runtime
  if (rules.counters.length === 0 && rules.designations.length === 0) return undefined
  return {
    rules,
    counters: playerTableOf(table, playerId).counters ?? NO_COUNTERS,
    held: rules.designations.flatMap(({ id }) => (table.designations[id] === playerId ? [id] : [])),
  }
}

/** why: a counter at its losing count (10 poison) knocks the seat out, just as lethal commander damage does. */
export function losingCounter({ rules, counters }: Pick<SeatTable, "rules" | "counters">) {
  return rules.counters.find(
    ({ id, losesAt }) => losesAt !== undefined && (counters[id] ?? 0) >= losesAt,
  )
}

// why: glyphs are keyed by counter or designation id, so any system that reuses an id gets its glyph and new ids fall back to a plain dot.
const GLYPHS: Record<string, string> = {
  poison: "M12 2v20",
  commanderTax: "M6 3h12v18l-6-4-6 4zM12 7v6M9 10h6",
  monarch: "M3 19h18M4.5 15.5 3 7l5 4 4-6 4 6 5-4-1.5 8.5z",
  initiative: "M6 21V10a6 6 0 0 1 12 0v11M3 21h18M12 13v4",
  plus: "M12 5v14M5 12h14",
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

/** why: chips and sheets lay out upright in the seat's reading frame, then turn with the card's content. */
function contentFrame(
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

function contentInset(
  rotation: LifeCardContentRotation,
  insets: LifeCardContentInsets | undefined,
  edge: LifeCardEdge,
) {
  return insets?.[CONTENT_EDGES[rotation][edge]] ?? 0
}

// why: the game menu button is centered on the seam between cards, so a seat whose inner edge holds it starts its chips below the button.
const MENU_CLEARANCE = 42
const COMPACT_MENU_CLEARANCE = 37

type Sheet = { kind: "edit"; counterId: string } | { kind: "add" }

export interface CounterChipsProps {
  seat: SeatTable
  seatNumber: number
  identity: string
  color: string
  foreground: string
  compact?: boolean
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  menuEdgeCenter?: LifeCardMenuEdge
  cardSize: { width: number; height: number }
  /** why: the open sheet covers the card, so the card drops its own controls from touch, focus, and screen readers meanwhile. */
  onSheetOpenChange?: (open: boolean) => void
}

/** why: counters and designations sit on the card's inner edge, facing the table. Tap a chip to bump it, hold it to edit or remove, and the faint + adds a counter or takes a designation. */
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
  onSheetOpenChange,
}: CounterChipsProps) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const longPressed = useRef(false)
  const { rules, counters, held, editable } = seat
  const shown = rules.counters.filter(({ id }) => (counters[id] ?? 0) > 0)
  const heldDesignations = rules.designations.filter(({ id }) => held.includes(id))
  const webAnnouncement = useAnnouncements(seat, identity)
  const sheetOpen = sheet !== null

  useEffect(() => {
    if (!editable) setSheet(null)
  }, [editable])

  useEffect(() => {
    if (!sheetOpen) return
    onSheetOpenChange?.(true)
    return () => onSheetOpenChange?.(false)
  }, [onSheetOpenChange, sheetOpen])

  if (cardSize.width === 0 || cardSize.height === 0) return null
  const frame = contentFrame(contentRotation, cardSize)
  const glyphSize = compact ? 13 : 15
  const menuClearance =
    menuEdgeCenter === CONTENT_EDGES[contentRotation].top
      ? compact
        ? COMPACT_MENU_CLEARANCE
        : MENU_CLEARANCE
      : 0
  const top =
    (compact ? spacing.xxs : spacing.xs) +
    contentInset(contentRotation, contentInsets, "top") +
    menuClearance

  return (
    <>
      {Platform.OS === "web" ? (
        <Text text={webAnnouncement} accessibilityLiveRegion="polite" style={$visuallyHidden} />
      ) : null}
      {!sheetOpen && (shown.length > 0 || heldDesignations.length > 0 || editable) ? (
        <View
          testID={`counter-chips-frame-seat-${seatNumber}`}
          pointerEvents="box-none"
          style={[frame, $layer]}
        >
          <View
            testID={`counter-chips-seat-${seatNumber}`}
            pointerEvents="box-none"
            style={[themed(compact ? $compactRow : $row), { top }]}
          >
            {shown.map((counter) => {
              const value = counters[counter.id] ?? 0
              const lethal = counter.losesAt !== undefined && value >= counter.losesAt
              const content = (
                <>
                  <TableGlyph id={counter.id} size={glyphSize} color={foreground} />
                  <Text
                    text={String(value)}
                    weight={lethal ? "bold" : "medium"}
                    maxFontSizeMultiplier={1.2}
                    style={[themed(compact ? $compactValue : $value), { color: foreground }]}
                  />
                </>
              )
              const label = `${identity}, ${counter.label}`
              const valueText =
                counter.losesAt !== undefined ? `${value} of ${counter.losesAt}` : String(value)
              const chipStyle = [
                themed(compact ? $compactChip : $chip),
                // why: reaching a losing count (10 poison) outlines the chip, like the lethal commander disc.
                lethal && { borderColor: foreground },
              ]
              if (!editable)
                return (
                  <View
                    key={counter.id}
                    testID={`counter-chip-${seatNumber}-${counter.id}`}
                    accessible
                    accessibilityLabel={label}
                    accessibilityValue={{ text: valueText }}
                    style={chipStyle}
                  >
                    {content}
                  </View>
                )
              return (
                <BoardPressable
                  key={counter.id}
                  testID={`counter-chip-${seatNumber}-${counter.id}`}
                  accessibilityRole="adjustable"
                  accessibilityLabel={label}
                  accessibilityValue={{ text: valueText }}
                  accessibilityHint={`Tap to add ${counter.step}. Long press to edit or remove.`}
                  accessibilityActions={[
                    { name: "increment" },
                    { name: "decrement" },
                    { name: "longpress", label: `Edit ${counter.label}` },
                  ]}
                  onAccessibilityAction={({ nativeEvent }) => {
                    if (nativeEvent.actionName === "increment")
                      seat.adjustCounter(counter.id, counter.step)
                    else if (nativeEvent.actionName === "decrement")
                      seat.adjustCounter(counter.id, -Math.min(counter.step, value))
                    else if (nativeEvent.actionName === "longpress")
                      setSheet({ kind: "edit", counterId: counter.id })
                  }}
                  hitSlop={{ top: 6, bottom: 6 }}
                  delayLongPress={450}
                  onPressIn={() => {
                    longPressed.current = false
                  }}
                  onLongPress={() => {
                    longPressed.current = true
                    setSheet({ kind: "edit", counterId: counter.id })
                  }}
                  onPress={() => {
                    if (longPressed.current) return
                    seat.adjustCounter(counter.id, counter.step)
                  }}
                  style={({ pressed }) => [
                    chipStyle,
                    pressed && { backgroundColor: overlayTint(foreground, 0.14) },
                  ]}
                >
                  {content}
                </BoardPressable>
              )
            })}
            {heldDesignations.map((designation) => (
              <View
                key={designation.id}
                testID={`designation-chip-${seatNumber}-${designation.id}`}
                accessible
                accessibilityLabel={`${identity}, ${designation.label}`}
                style={themed(compact ? $compactChip : $chip)}
              >
                <TableGlyph id={designation.id} size={glyphSize} color={foreground} />
                {compact ? null : (
                  <Text
                    text={designation.label}
                    weight="bold"
                    size="xxs"
                    maxFontSizeMultiplier={1.2}
                    numberOfLines={1}
                    style={{ color: foreground }}
                  />
                )}
              </View>
            ))}
            {editable ? (
              <BoardPressable
                testID={`counter-add-seat-${seatNumber}`}
                accessibilityRole="button"
                accessibilityLabel={`${identity}, counters and designations`}
                hitSlop={{ top: 6, bottom: 6 }}
                onPress={() => setSheet({ kind: "add" })}
                style={({ pressed }) => [
                  themed(compact ? $compactChip : $chip),
                  themed($addChip),
                  pressed && { backgroundColor: overlayTint(foreground, 0.14) },
                ]}
              >
                <TableGlyph id="plus" size={glyphSize} color={foreground} />
              </BoardPressable>
            ) : null}
          </View>
        </View>
      ) : null}
      {sheet ? (
        <CounterSheet
          sheet={sheet}
          seat={seat}
          seatNumber={seatNumber}
          identity={identity}
          color={color}
          compact={compact}
          frame={frame}
          contentRotation={contentRotation}
          contentInsets={contentInsets}
          menuClearance={menuClearance}
          onEdit={(counterId) => setSheet({ kind: "edit", counterId })}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  )
}, structurallyEqual)

/**
 * why: like life, every change to a seat's counters is spoken once, whether this device or another made it. A moved designation is spoken only for the seat that took it. Native platforms announce directly; react-native-web's announce is a no-op, so web gets the message back for a polite live region.
 */
function useAnnouncements({ rules, counters, held }: SeatTable, identity: string) {
  const previous = useRef({ counters, held })
  const [webMessage, setWebMessage] = useState("")
  useEffect(() => {
    const before = previous.current
    previous.current = { counters, held }
    const changes = [
      ...rules.counters.flatMap(({ id, label }) => {
        const value = counters[id] ?? 0
        return value === (before.counters[id] ?? 0) ? [] : [`${label} ${value}`]
      }),
      ...rules.designations.flatMap(({ id, label }) =>
        held.includes(id) && !before.held.includes(id) ? [`now ${label}`] : [],
      ),
    ]
    if (changes.length === 0) return
    const message = `${identity}, ${changes.join(", ")}`
    if (Platform.OS === "web") setWebMessage(message)
    else AccessibilityInfo.announceForAccessibility(message)
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
  contentRotation,
  contentInsets,
  menuClearance,
  onEdit,
  onClose,
}: {
  sheet: Sheet
  seat: SeatTable
  seatNumber: number
  identity: string
  color: string
  compact?: boolean
  frame: ViewStyle
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  menuClearance: number
  onEdit: (counterId: string) => void
  onClose: () => void
}) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const sheetColor = mixColorsInLinearLight(color, "#000000", 0.34)
  const ink = accessibleForeground(sheetColor)
  const gap = compact ? spacing.xxs : spacing.xs
  const padding = {
    paddingTop: gap + contentInset(contentRotation, contentInsets, "top") + menuClearance,
    paddingBottom: gap + contentInset(contentRotation, contentInsets, "bottom"),
    paddingLeft: gap + contentInset(contentRotation, contentInsets, "left"),
    paddingRight: gap + contentInset(contentRotation, contentInsets, "right"),
  }
  const counter =
    sheet.kind === "edit" ? seat.rules.counters.find(({ id }) => id === sheet.counterId) : undefined
  const value = counter ? (seat.counters[counter.id] ?? 0) : 0

  function textButton(testID: string, text: string, onPress: () => void, label = text) {
    return (
      <BoardPressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
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

  return (
    <View
      testID={`counter-sheet-seat-${seatNumber}`}
      accessibilityViewIsModal
      style={[frame, $sheet, padding, { backgroundColor: sheetColor }]}
    >
      {counter ? (
        <>
          <View pointerEvents="box-none" style={$halves}>
            {([-1, 1] as const).map((direction) => (
              <BoardPressable
                key={direction}
                testID={`counter-edit-${seatNumber}-${counter.id}-${direction > 0 ? "plus" : "minus"}`}
                accessibilityRole="button"
                accessibilityLabel={`${identity}, ${direction > 0 ? "add" : "subtract"} ${counter.step} ${counter.label}`}
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
          <View pointerEvents="none" style={themed($sheetHeader)}>
            <TableGlyph id={counter.id} size={16} color={ink} />
            <Text
              text={counter.label}
              weight="bold"
              size="xs"
              numberOfLines={1}
              style={{ color: ink }}
            />
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
            {textButton(
              `counter-remove-${seatNumber}`,
              "Remove",
              () => {
                if (value > 0) seat.adjustCounter(counter.id, -value)
                onClose()
              },
              `Remove ${counter.label}`,
            )}
            {textButton(`counter-done-${seatNumber}`, "Done", onClose)}
          </View>
        </>
      ) : (
        <>
          <View style={[$sheetCenter, themed($options)]}>
            {seat.rules.counters.map((option) => {
              const current = seat.counters[option.id] ?? 0
              // why: a counter in play opens its editor from here too, so keyboard users can correct it without a long press.
              return (
                <SheetOption
                  key={option.id}
                  testID={`counter-option-${seatNumber}-${option.id}`}
                  id={option.id}
                  label={option.label}
                  value={current > 0 ? current : undefined}
                  accessibilityLabel={
                    current > 0 ? `Edit ${option.label}, ${current}` : `Add ${option.label}`
                  }
                  ink={ink}
                  onPress={() => {
                    if (current > 0) return onEdit(option.id)
                    seat.adjustCounter(option.id, option.step)
                    onClose()
                  }}
                />
              )
            })}
            {seat.rules.designations.map((option) => {
              const holds = seat.held.includes(option.id)
              return (
                <SheetOption
                  key={option.id}
                  testID={`designation-option-${seatNumber}-${option.id}`}
                  id={option.id}
                  label={option.label}
                  accessibilityLabel={`${holds ? "Give up" : "Take"} ${option.label}`}
                  selected={holds}
                  ink={ink}
                  onPress={() => {
                    if (holds) seat.releaseDesignation(option.id)
                    else seat.takeDesignation(option.id)
                    onClose()
                  }}
                />
              )
            })}
          </View>
          <View pointerEvents="box-none" style={themed($sheetFooter)}>
            {textButton(`counter-close-${seatNumber}`, "Close", onClose)}
          </View>
        </>
      )}
    </View>
  )
}

function SheetOption({
  testID,
  id,
  label,
  value,
  accessibilityLabel,
  selected,
  ink,
  onPress,
}: {
  testID: string
  id: string
  label: string
  value?: number
  accessibilityLabel: string
  selected?: boolean
  ink: string
  onPress: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <BoardPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        themed($option),
        pressed && { backgroundColor: overlayTint(ink, 0.14) },
      ]}
    >
      <TableGlyph id={id} size={16} color={ink} />
      <Text
        text={label}
        weight={selected ? "bold" : "medium"}
        size="xs"
        numberOfLines={1}
        style={[themed($optionLabel), { color: ink }, !selected && $muted]}
      />
      {value !== undefined ? (
        <Text
          text={String(value)}
          weight="bold"
          size="xs"
          style={[themed($optionValue), { color: ink }]}
        />
      ) : null}
      {selected ? <View style={[themed($selectedDot), { backgroundColor: ink }]} /> : null}
    </BoardPressable>
  )
}

const $layer: ViewStyle = { zIndex: 10 }

// why: the row stays inside the seat's reading frame and wraps toward the life total when a narrow sideways card cannot fit every chip on one line.
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: spacing.xs,
  right: spacing.xs,
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "center",
  alignItems: "center",
  gap: spacing.xxxs,
})

const $compactRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: spacing.xxs,
  right: spacing.xxs,
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "center",
  alignItems: "center",
})

const $chip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
  minHeight: 36,
  minWidth: 36,
  justifyContent: "center",
  paddingHorizontal: spacing.xs,
  borderRadius: spacing.xs,
  borderWidth: 1.5,
  borderColor: "transparent",
})

const $compactChip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxxs,
  minHeight: 32,
  minWidth: 28,
  justifyContent: "center",
  paddingHorizontal: spacing.xxs,
  borderRadius: spacing.xs,
  borderWidth: 1.5,
  borderColor: "transparent",
})

const $addChip: ThemedStyle<ViewStyle> = () => ({ opacity: 0.5 })

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

const $textButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 36,
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
  borderRadius: spacing.xs,
})

const $options: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  alignContent: "center",
  gap: spacing.xxxs,
})

const $option: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  minHeight: 40,
  minWidth: "45%",
  flexGrow: 1,
  paddingHorizontal: spacing.xs,
  borderRadius: spacing.xs,
})

const $optionLabel: ThemedStyle<TextStyle> = () => ({ flexShrink: 1 })

const $muted: TextStyle = { opacity: 0.78 }

const $optionValue: ThemedStyle<TextStyle> = () => ({
  marginLeft: "auto",
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
  borderRadius: 3,
  marginLeft: "auto",
})
