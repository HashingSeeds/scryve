import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentRef,
} from "react"
import type { Insets, LayoutChangeEvent, ViewStyle } from "react-native"
import { AccessibilityInfo, ScrollView, View } from "react-native"
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import Svg, { Path } from "react-native-svg"

import { suggestedCounterNames } from "@/features/game/recentCounterNames"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { spacing } from "@/theme/spacing"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import { overlayTint } from "./LifeControls"
import { seatCardRadius, type LifeCardContentRotation } from "./playerCardTypes"
import { FULL_KEY_SIZE, KEY_GAP, PokemonKeypad, ROW_GAP } from "./pokemon/PokemonKeypad"
import { Text } from "./Text"
import { TextField } from "./TextField"
import { customCounterName, MAX_CUSTOM_COUNTER_NAME_LENGTH } from "../../convex/lib/table"

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** why: everything the board needs to draw one seat's name panel; Close sits on the dice bag's spot in the seat's turned content box. */
export interface CounterNameRequest {
  seatNumber: number
  color: string
  compact?: boolean
  rotation: LifeCardContentRotation
  close: { left: number; top: number; size: number; glyph: number; slop: Insets }
  taken: readonly string[]
  onAdd: (name: string) => void
  onClose: () => void
}

export interface CounterNameHost {
  open: (request: CounterNameRequest) => void
  close: (seatNumber: number) => void
}

/** why: the board stage draws the menu, seam, and tabs above the grid, so it hides them while a name panel covers the middle of the table. */
export const CounterNameOpenContext = createContext<((open: boolean) => void) | undefined>(
  undefined,
)

/** why: the board provides one per seat cell so a seat's name panel can draw above its neighbours; without one the panel stays inside its card. */
export const CounterNameHostContext = createContext<CounterNameHost | undefined>(undefined)

const KEY_ROWS = 4
const TEN_KEYS = 10 * FULL_KEY_SIZE + 9 * KEY_GAP
const PAD = spacing.xs
const KEYS_DEPTH = KEY_ROWS * FULL_KEY_SIZE + (KEY_ROWS - 1) * ROW_GAP
const OPEN_SPRING = { damping: 22, stiffness: 240, mass: 0.7 } as const
const CLOSE_TIMING = { duration: 240, easing: Easing.bezier(0.3, 0, 0.7, 1) } as const
// why: [cos, sin] of each content turn, exact so edges land on whole points.
const TURNS: Record<LifeCardContentRotation, readonly [number, number]> = {
  0: [1, 0],
  90: [0, 1],
  180: [-1, 0],
  [-90]: [0, -1],
}

function turn(rotation: LifeCardContentRotation, x: number, y: number, back = false) {
  const [cos, sine] = TURNS[rotation]
  const sin = back ? -sine : sine
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

/**
 * why: the panel is the seat stretched until a full-size keyboard fits, so it always contains the seat (and Close on its corner) and stays on the board. In the seat's own orientation the keys grow along the seat away from Close and inward from the player's edge, and the safe area bounds the keys but not the seat's own background.
 */
export function namePanelLayout(input: {
  seat: Rect
  board: Rect
  safe: Rect
  rotation: LifeCardContentRotation
  close: { left: number; top: number; size: number }
}) {
  const { seat, rotation, close } = input
  const sideways = Math.abs(rotation) === 90
  const width = sideways ? seat.height : seat.width
  const depth = sideways ? seat.width : seat.height
  const center = { x: seat.x + seat.width / 2, y: seat.y + seat.height / 2 }
  const toContent = ({ x, y, width: w, height: h }: Rect) => {
    const [a, b] = [
      turn(rotation, x - center.x, y - center.y, true),
      turn(rotation, x + w - center.x, y + h - center.y, true),
    ]
    return {
      x0: Math.min(a.x, b.x) + width / 2,
      x1: Math.max(a.x, b.x) + width / 2,
      y0: Math.min(a.y, b.y) + depth / 2,
      y1: Math.max(a.y, b.y) + depth / 2,
    }
  }
  const board = toContent(input.board)
  const safe = toContent(input.safe)
  const clamp = (start: number, length: number, min: number, max: number) =>
    Math.max(min, Math.min(start, max - length))

  const keysWidth = Math.min(TEN_KEYS, safe.x1 - safe.x0 - 2 * PAD)
  const blockWidth = keysWidth + 2 * PAD
  // why: the bottom key row centers on Close, which the card already placed clear of the player's edge.
  const padBottom = Math.max(KEY_GAP, depth - close.top - close.size / 2 - FULL_KEY_SIZE / 2)
  const blockDepth = PAD + FULL_KEY_SIZE + ROW_GAP + KEYS_DEPTH + padBottom
  const closeRight = close.left + close.size / 2 > width / 2
  const blockX = clamp(closeRight ? width - blockWidth : 0, blockWidth, safe.x0, safe.x1)
  const blockY = clamp(depth - blockDepth, blockDepth, safe.y0, board.y1)

  const x0 = Math.max(board.x0, Math.min(0, blockX))
  const x1 = Math.min(board.x1, Math.max(width, blockX + blockWidth))
  const y0 = Math.max(board.y0, Math.min(0, blockY))
  const y1 = Math.min(board.y1, Math.max(depth, blockY + blockDepth))
  const panel = { width: x1 - x0, depth: y1 - y0 }
  const middle = turn(rotation, (x0 + x1) / 2 - width / 2, (y0 + y1) / 2 - depth / 2)
  const outer = sideways
    ? { width: panel.depth, height: panel.width }
    : { width: panel.width, height: panel.depth }
  const keysX = blockX - x0 + PAD
  const closeLeft = close.left - x0
  return {
    rect: {
      x: center.x + middle.x - outer.width / 2,
      y: center.y + middle.y - outer.height / 2,
      ...outer,
    },
    width: panel.width,
    depth: panel.depth,
    keys: { x: keysX, y: blockY - y0 + PAD, width: keysWidth },
    keyWidth: (keysWidth - 9 * KEY_GAP) / 10,
    close: { left: closeLeft, top: close.top - y0 },
    clearance:
      closeLeft + close.size > keysX && closeLeft < keysX + keysWidth
        ? { start: closeLeft - keysX, end: closeLeft - keysX + close.size }
        : undefined,
  }
}

/** why: one layout for every table size. Name and recent names share the top row, four 44pt key rows run the full width below, and Close tucks into the bottom row on its own side. */
export function CounterNamePanel({
  request,
  seat,
  board,
  safe,
  closing = false,
  onClosed,
}: {
  request: CounterNameRequest
  seat: Rect
  board: Rect
  safe: Rect
  closing?: boolean
  onClosed?: () => void
}) {
  const { themed } = useAppTheme()
  const motion = useReducedMotion() === false
  const { seatNumber, rotation, close, onAdd, onClose } = request
  const layout = namePanelLayout({ seat, board, safe, rotation, close })
  const to = layout.rect
  const radius = seatCardRadius(request.compact)
  const corners = { from: cornerRadii(seat, board, radius), to: cornerRadii(to, board, radius) }
  // why: the panel unfolds out of the seat, so it starts on the seat's own rect and corners.
  const progress = useSharedValue(motion ? 0 : 1)
  useEffect(() => {
    if (!closing) {
      progress.value = motion ? withSpring(1, OPEN_SPRING) : 1
      return
    }
    if (!motion) return onClosed?.()
    progress.value = withTiming(0, CLOSE_TIMING, (finished) => {
      if (finished && onClosed) runOnJS(onClosed)()
    })
  }, [closing, motion, onClosed, progress])
  const clipStyle = useAnimatedStyle(() => {
    const t = Math.min(progress.value, 1)
    const at = (from: number, end: number) => from + (end - from) * t
    const x = at(seat.x, to.x)
    const y = at(seat.y, to.y)
    return {
      left: x,
      top: y,
      width: at(seat.x + seat.width, to.x + to.width) - x,
      height: at(seat.y + seat.height, to.y + to.height) - y,
      // why: it opens over the add sheet in the same colour, so only the way back out fades, letting the card show through as the panel lands on its seat.
      opacity: closing ? interpolate(progress.value, [0, 0.4], [0, 1], Extrapolation.CLAMP) : 1,
      borderTopLeftRadius: at(corners.from.topLeft, corners.to.topLeft),
      borderTopRightRadius: at(corners.from.topRight, corners.to.topRight),
      borderBottomLeftRadius: at(corners.from.bottomLeft, corners.to.bottomLeft),
      borderBottomRightRadius: at(corners.from.bottomRight, corners.to.bottomRight),
    }
  })
  // why: the content stays put on the board while the clip around it grows, so the keys are revealed rather than dragged.
  const holdStyle = useAnimatedStyle(() => {
    const t = Math.min(progress.value, 1)
    return {
      left: (to.x - seat.x) * (1 - t),
      top: (to.y - seat.y) * (1 - t),
    }
  })
  const keysStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 0.9], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.96, 1]) }],
  }))
  const sheetColor = mixColorsInLinearLight(request.color, "#000000", 0.34)
  const ink = accessibleForeground(sheetColor)
  const [draft, setDraft] = useState("")
  const [recent] = useState(() =>
    suggestedCounterNames().filter(
      (name) =>
        !request.taken.some((held) => held.toLocaleLowerCase() === name.toLocaleLowerCase()),
    ),
  )
  const field = useRef<ComponentRef<typeof TextField>>(null)
  useEffect(() => {
    if (field.current) AccessibilityInfo.sendAccessibilityEvent(field.current, "focus")
  }, [])
  const name = customCounterName(draft)
  // why: keypad taps can land before the next render, so each edit builds on the latest draft.
  const editDraft = (change: (value: string) => string) =>
    setDraft((value) => change(value).slice(0, MAX_CUSTOM_COUNTER_NAME_LENGTH))

  return (
    <Animated.View
      pointerEvents={closing ? "none" : "box-none"}
      style={[$clip, { backgroundColor: sheetColor }, clipStyle]}
    >
      <Animated.View
        pointerEvents="box-none"
        style={[$panel, { width: to.width, height: to.height }, holdStyle]}
      >
        <View
          testID={`counter-name-sheet-${seatNumber}`}
          accessibilityViewIsModal
          style={[
            $turned,
            {
              width: layout.width,
              height: layout.depth,
              left: (layout.rect.width - layout.width) / 2,
              top: (layout.rect.height - layout.depth) / 2,
              transform: [{ rotate: `${rotation}deg` }],
            },
          ]}
        >
          <Animated.View
            style={[
              $keys,
              { left: layout.keys.x, top: layout.keys.y, width: layout.keys.width },
              keysStyle,
            ]}
          >
            <View style={themed($nameRow)}>
              <TextField
                ref={field}
                testID={`counter-name-${seatNumber}`}
                accessibilityLabel={translate("board:counters.customName")}
                placeholder={translate("board:counters.customName")}
                placeholderTextColor={overlayTint(ink, 0.6)}
                autoFocus
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={MAX_CUSTOM_COUNTER_NAME_LENGTH}
                showSoftInputOnFocus={false}
                selection={{ start: draft.length, end: draft.length }}
                value={draft}
                onChangeText={setDraft}
                containerStyle={$fill}
                inputWrapperStyle={[themed($nameInput), { borderColor: overlayTint(ink, 0.5) }]}
                style={{ color: ink }}
              />
              {recent.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  style={$fill}
                  contentContainerStyle={themed($recentNames)}
                >
                  {recent.map((recentName) => (
                    <BoardPressable
                      key={recentName}
                      testID={`counter-recent-${seatNumber}-${recentName}`}
                      accessibilityRole="button"
                      accessibilityLabel={translate("board:counters.customRecent", {
                        label: recentName,
                      })}
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
                </ScrollView>
              ) : null}
            </View>
            <View style={$keyRows}>
              <PokemonKeypad
                seatNumber={seatNumber}
                ink={ink}
                digitsOnly={false}
                capitalize={draft === "" || draft.endsWith(" ")}
                full={{ width: layout.keys.width, clearance: layout.clearance }}
                onType={(text) => editDraft((value) => value + text)}
                onDelete={() => editDraft((value) => value.slice(0, -1))}
                onDone={() => (name ? onAdd(name) : onClose())}
              />
            </View>
          </Animated.View>
          <BoardPressable
            testID={`counter-close-${seatNumber}`}
            accessibilityRole="button"
            accessibilityLabel={translate("common:close")}
            hitSlop={close.slop}
            onPress={onClose}
            style={({ pressed }) => [
              themed($close),
              {
                left: layout.close.left,
                top: layout.close.top,
                width: close.size,
                height: close.size,
              },
              pressed && { backgroundColor: overlayTint(ink, 0.14) },
            ]}
          >
            <Svg
              width={close.glyph}
              height={close.glyph}
              viewBox="0 0 24 24"
              fill="none"
              stroke={ink}
              strokeWidth={2.2}
              strokeLinecap="round"
            >
              <Path d="M6 6l12 12M18 6 6 18" />
            </Svg>
          </BoardPressable>
        </View>
      </Animated.View>
    </Animated.View>
  )
}

/** why: like a seat card, the panel is rounded except where it tucks into a corner of the board. */
function cornerRadii(rect: Rect, board: Rect, radius: number) {
  const left = rect.x <= board.x + 0.5
  const top = rect.y <= board.y + 0.5
  const right = rect.x + rect.width >= board.x + board.width - 0.5
  const bottom = rect.y + rect.height >= board.y + board.height - 0.5
  return {
    topLeft: top && left ? 0 : radius,
    topRight: top && right ? 0 : radius,
    bottomLeft: bottom && left ? 0 : radius,
    bottomRight: bottom && right ? 0 : radius,
  }
}

const $panel: ViewStyle = { position: "absolute" }
const $clip: ViewStyle = { position: "absolute", overflow: "hidden" }
const $turned: ViewStyle = { position: "absolute" }
const $keys: ViewStyle = { position: "absolute", gap: ROW_GAP }
const $fill: ViewStyle = { flex: 1 }
const $keyRows: ViewStyle = { height: KEYS_DEPTH, justifyContent: "flex-end" }

const $nameRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  height: FULL_KEY_SIZE,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $nameInput: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "transparent",
  borderBottomWidth: 1.5,
  borderLeftWidth: 0,
  borderRadius: 0,
  borderRightWidth: 0,
  borderTopWidth: 0,
  minHeight: 0,
  height: FULL_KEY_SIZE,
})

const $recentNames: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.xxs,
})

const $recentName: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  borderRadius: radius.sm,
  borderWidth: 1,
  minHeight: 32,
  justifyContent: "center",
  paddingHorizontal: spacing.xs,
})

const $close: ThemedStyle<ViewStyle> = ({ radius }) => ({
  position: "absolute",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: radius.md,
})

/** why: hands the panel to the board's host so it can cover neighbouring seats, or draws it inside the card when no board hosts it. */
export function CounterNameSlot({
  request,
  cardSize,
}: {
  request: CounterNameRequest
  cardSize: { width: number; height: number }
}) {
  const host = useContext(CounterNameHostContext)
  const latest = useRef(request)
  useLayoutEffect(() => {
    latest.current = request
  })
  // why: before paint, so the panel mounts in the same frame the add sheet hands over.
  useLayoutEffect(() => {
    if (!host) return
    const opened = latest.current
    host.open({
      ...opened,
      onAdd: (name) => latest.current.onAdd(name),
      onClose: () => latest.current.onClose(),
    })
    return () => host.close(opened.seatNumber)
  }, [host])
  if (host) return null
  const card = { x: 0, y: 0, ...cardSize }
  return <CounterNamePanel request={request} seat={card} board={card} safe={card} />
}

type OpenPanel = { request: CounterNameRequest; cell: string; closing: boolean }

/** why: the board's side of the name panel. It measures each cell, hands each cell a stable host, and draws every open panel above the rows in board space. */
export function useCounterNameBoard({ area, safe }: { area: Rect; safe: Rect }) {
  // why: keyed per opening, so a seat that reopens while its last panel is still shrinking gets a fresh one.
  const [panels, setPanels] = useState<ReadonlyMap<number, OpenPanel>>(() => new Map())
  const openings = useRef(0)
  const [cells, setCells] = useState<ReadonlyMap<string, Rect>>(() => new Map())
  const rowTops = useRef<number[]>([])
  const cellBoxes = useRef(
    new Map<string, { row: number; x: number; width: number; height: number }>(),
  )
  const hosts = useRef(new Map<string, CounterNameHost>())
  const reportOpen = useContext(CounterNameOpenContext)
  const anyOpen = panels.size > 0
  useEffect(() => {
    if (!anyOpen) return
    reportOpen?.(true)
    return () => reportOpen?.(false)
  }, [anyOpen, reportOpen])

  // why: cells only move when the board does, so their spots are read into state only while a panel needs them.
  const placeAll = () =>
    setCells((current) => {
      const next = new Map<string, Rect>()
      for (const [cell, box] of cellBoxes.current) {
        const y = rowTops.current[box.row]
        if (y !== undefined) next.set(cell, { x: box.x, y, width: box.width, height: box.height })
      }
      const same =
        next.size === current.size &&
        [...next].every(([cell, rect]) => {
          const was = current.get(cell)
          return (
            was &&
            was.x === rect.x &&
            was.y === rect.y &&
            was.width === rect.width &&
            was.height === rect.height
          )
        })
      return same ? current : next
    })
  const placeIfOpen = () => {
    if (panels.size > 0) placeAll()
  }

  const closers = useRef(new Map<number, () => void>())
  // why: stable per opening, so the panel's close effect doesn't restart on every board render.
  function closedFor(opening: number) {
    let closed = closers.current.get(opening)
    if (!closed) {
      closed = () => {
        closers.current.delete(opening)
        setPanels((current) => {
          const next = new Map(current)
          next.delete(opening)
          return next
        })
      }
      closers.current.set(opening, closed)
    }
    return closed
  }

  function hostFor(cell: string) {
    let host = hosts.current.get(cell)
    if (!host) {
      host = {
        open: (request) => {
          placeAll()
          const opening = ++openings.current
          setPanels((current) => new Map(current).set(opening, { request, cell, closing: false }))
        },
        close: (seatNumber) =>
          setPanels((current) => {
            const next = new Map(current)
            for (const [opening, panel] of current)
              if (panel.request.seatNumber === seatNumber && !panel.closing)
                next.set(opening, { ...panel, closing: true })
            return next
          }),
      }
      hosts.current.set(cell, host)
    }
    return host
  }

  return {
    hostFor,
    onRowLayout: (row: number) => (event: LayoutChangeEvent) => {
      rowTops.current[row] = event.nativeEvent.layout.y
      placeIfOpen()
    },
    onCellLayout: (cell: string, row: number) => (event: LayoutChangeEvent) => {
      const { x, width, height } = event.nativeEvent.layout
      cellBoxes.current.set(cell, { row, x, width, height })
      placeIfOpen()
    },
    panels: [...panels].map(([opening, { request, cell, closing }]) => {
      const seat = cells.get(cell)
      return seat ? (
        <CounterNamePanel
          key={opening}
          request={request}
          seat={seat}
          board={area}
          safe={safe}
          closing={closing}
          onClosed={closedFor(opening)}
        />
      ) : null
    }),
  }
}
