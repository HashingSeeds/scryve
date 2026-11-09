import { Platform } from "react-native"

import type { PlayerId } from "@/features/game/types"

import { getLifeLineHeight } from "./playerCardTypes"

export interface CommanderBoardSeat {
  playerId: PlayerId
  row: number
  column: number
}

export function commanderBoardSeats(
  gridRows: readonly (number | null)[][],
  playerIds: readonly PlayerId[],
): { seats: CommanderBoardSeat[]; rows: number; columns: number } {
  const seats: CommanderBoardSeat[] = []
  let columns = 0
  gridRows.forEach((gridRow, row) => {
    columns = Math.max(columns, gridRow.length)
    gridRow.forEach((playerIndex, column) => {
      if (playerIndex === null) return
      const playerId = playerIds[playerIndex]
      if (playerId === undefined) return
      seats.push({ playerId, row, column })
    })
  })
  return { seats, rows: Math.max(gridRows.length, 1), columns: Math.max(columns, 1) }
}

export interface CommanderFacing {
  x?: "left" | "right"
  y?: "top" | "bottom"
}

function seatSpan(gridRows: readonly (number | null)[][], playerIndex: number) {
  for (const [row, slots] of gridRows.entries()) {
    const column = slots.indexOf(playerIndex)
    if (column >= 0) return { row, left: column / slots.length, right: (column + 1) / slots.length }
  }
  return undefined
}

export function commanderFacing(
  gridRows: readonly (number | null)[][],
  attackerIndex: number,
  defenderIndex: number,
): CommanderFacing {
  const attacker = seatSpan(gridRows, attackerIndex)
  const defender = seatSpan(gridRows, defenderIndex)
  if (!attacker || !defender || attackerIndex === defenderIndex) return {}
  const x = attacker.left + attacker.right < defender.left + defender.right ? "left" : "right"
  const y = attacker.row < defender.row ? "top" : "bottom"
  if (attacker.row === defender.row) return { x }
  const sharesColumn = attacker.left < defender.right && defender.left < attacker.right
  return sharesColumn ? { y } : { x, y }
}

// why: the shadow is the attacker's own card growing outward, so it reaches each seat with the card's straight edges, nearest seats first. `x` and `y` place the attacker's center from this seat's center, and `distance` is how far the card must grow to cover every other seat.
export interface CommanderReach {
  x: number
  y: number
  card: { width: number; height: number }
  distance: number
}

function seatBox(
  gridRows: readonly (number | null)[][],
  rowFlexes: readonly number[],
  playerIndex: number,
) {
  const total = rowFlexes.reduce((sum, flex) => sum + flex, 0)
  let top = 0
  for (const [row, slots] of gridRows.entries()) {
    const height = rowFlexes[row] / total
    const column = slots.indexOf(playerIndex)
    if (column >= 0)
      return {
        x: (column + 0.5) / slots.length,
        y: top + height / 2,
        width: 1 / slots.length,
        height,
      }
    top += height
  }
  return undefined
}

export function commanderReach(input: {
  gridRows: readonly (number | null)[][]
  rowFlexes: readonly number[]
  board: { width: number; height: number }
  attackerIndex: number
  defenderIndex: number
}): CommanderReach | undefined {
  const { gridRows, rowFlexes, board } = input
  const attacker = seatBox(gridRows, rowFlexes, input.attackerIndex)
  const defender = seatBox(gridRows, rowFlexes, input.defenderIndex)
  if (!attacker || !defender || !(board.width > 0) || !(board.height > 0)) return undefined
  const ax = attacker.x * board.width
  const ay = attacker.y * board.height
  const card = { width: attacker.width * board.width, height: attacker.height * board.height }
  // why: a card grown by d on every side covers a point once d reaches the point's larger gap from the card along either axis.
  const farthest = gridRows.flat().flatMap((index) => {
    if (index === null || index === input.attackerIndex) return []
    const box = seatBox(gridRows, rowFlexes, index)
    if (!box) return []
    const gapX = Math.abs(box.x * board.width - ax) + (box.width * board.width - card.width) / 2
    const gapY = Math.abs(box.y * board.height - ay) + (box.height * board.height - card.height) / 2
    return [Math.max(gapX, gapY)]
  })
  return {
    x: ax - defender.x * board.width,
    y: ay - defender.y * board.height,
    card,
    distance: Math.max(0, ...farthest),
  }
}

export interface CommanderTakeover {
  content: { width: number; height: number }
  disc: number
  // why: a readout too big for the disc its card has room for shrinks into it while the attack holds the card.
  fit: number
  discOffset: { x: number; y: number }
  cardDiscOffset: { x: number; y: number }
  // why: a hit knocks the card away from the attacker, in the card's own space.
  knock: { x: number; y: number }
  // why: the attacker's card in this card's own space, from its top-left corner. `discGap` is how far that card must grow to cover the disc's center.
  flood?: { x: number; y: number; discGap: number } & Pick<CommanderReach, "card" | "distance">
}

/** why: the box a seat's readout inks, in its own upright space. `y` places the box's center below the card's center. */
export interface ReadoutInk {
  width: number
  height: number
  y: number
}

// why: the disc keeps this gap from the card's edges.
const DISC_GAP = 6
// why: the disc's ring matches the board's gutter between cards, and the damage arc runs along it.
export const DISC_RING = 4
// why: a readout never shrinks past legibility, even if it then runs past a tiny card's disc.
const MIN_FIT = 0.6
// why: Rubik Bold digits ink about 0.64em wide and 0.72em tall, and the disc keeps clear of the ink box's corners by DISC_CLEARANCE.
const DIGIT_INK_WIDTH = 0.64
export const DIGIT_INK_HEIGHT = 0.72
const DISC_CLEARANCE = 0.08
// why: a total's line box is centred on the card, but its digits sit high in it (measured on iOS; Android and web from Rubik's metrics and each line-height model), so the disc rises to meet them.
const DIGIT_RISE = Platform.select({ ios: 0.043, android: 0.037, default: 0.0125 })

// why: an out seat's second line under its life total: OUT, or the lethal amount after the mark or glyph of what knocked it out. LifeCard styles it from these, so the disc that rings it stays in step.
export const OUT_LABEL = { fontSize: 14, lineHeight: 24, marginTop: -8 } as const
export const OUT_CAUSE = { fontSize: 26, lineHeight: 30, marginTop: -6 } as const
export const OUT_CAUSE_GAP = 6
// why: a mark's art fills about 55% of its box, so the box outgrows the amount for the art to match its digits.
export const OUT_CAUSE_GLYPH = Math.round(OUT_CAUSE.fontSize * 1.4)

export function lifeInk(fontSize: number, digits: number): ReadoutInk {
  return {
    width: Math.max(digits, 2) * DIGIT_INK_WIDTH * fontSize,
    height: DIGIT_INK_HEIGHT * fontSize,
    y: -DIGIT_RISE * fontSize,
  }
}

// why: the gap between a defender's life and its "34 − 4" line grows with the life, so a tablet's big total doesn't crowd the line.
const STACK_GAP = 0.1

/** why: once an attack lands, a defender's life shrinks and rises to make room for its "34 − 4" line, inside the disc already drawn around the life alone, so the disc never jumps. `scale` is the life's new size; `lifeShift` and `lineShift` place the life's ink and the line's ink from where the life's ink sat. */
export function stackedReadout(fontSize: number, digits: number, lineChars: number) {
  const life = lifeInk(fontSize, digits)
  const lineHeight = DIGIT_INK_HEIGHT * OUT_CAUSE.fontSize
  const lineWidth = lineChars * DIGIT_INK_WIDTH * OUT_CAUSE.fontSize
  const gap = Math.max(OUT_CAUSE_GAP, STACK_GAP * fontSize)
  const room = Math.hypot(life.width, life.height)
  const height = (scale: number) => life.height * scale + gap + lineHeight
  let scale = 1
  while (
    scale > MIN_FIT &&
    Math.hypot(Math.max(life.width * scale, lineWidth), height(scale)) > room
  )
    scale -= 0.02
  return {
    scale,
    lifeShift: -(gap + lineHeight) / 2,
    lineShift: (life.height * scale + gap) / 2,
  }
}

/** why: an out seat stacks a smaller line under its life total, and a cause glyph `lead`s wide may sit before that line's text. */
export function outInk(input: {
  fontSize: number
  digits: number
  below: { fontSize: number; lineHeight: number; marginTop?: number; chars: number; lead?: number }
}): ReadoutInk {
  const { fontSize, below } = input
  const top = getLifeLineHeight(fontSize)
  const column = top + (below.marginTop ?? 0) + below.lineHeight
  const number = lifeInk(fontSize, input.digits)
  const inkTop = -column / 2 + top / 2 + number.y - number.height / 2
  const inkBottom =
    column / 2 - below.lineHeight / 2 + (DIGIT_INK_HEIGHT / 2 - DIGIT_RISE) * below.fontSize
  return {
    width: Math.max(
      number.width,
      (below.lead ?? 0) + below.chars * DIGIT_INK_WIDTH * below.fontSize,
    ),
    height: inkBottom - inkTop,
    y: (inkTop + inkBottom) / 2,
  }
}

function rotate(x: number, y: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  }
}

/** why: how far the attacker's card, centered at `x`, `y` in a seat's own space, must grow to cover `point` there. */
export function floodGap(
  flood: { x: number; y: number; card: { width: number; height: number } },
  point: { x: number; y: number },
) {
  return Math.max(
    Math.abs(point.x - flood.x) - flood.card.width / 2,
    Math.abs(point.y - flood.y) - flood.card.height / 2,
  )
}

export function commanderTakeover(input: {
  card: { width: number; height: number }
  rotation: number
  lifeFontSize: number
  ink: ReadoutInk
  reach?: CommanderReach
}): CommanderTakeover {
  const { card, rotation, lifeFontSize, ink, reach } = input
  const sideways = Math.abs(rotation) === 90
  const content = sideways
    ? { width: card.height, height: card.width }
    : { width: card.width, height: card.height }
  const needed = Math.hypot(ink.width, ink.height) / 2 + lifeFontSize * DISC_CLEARANCE
  const disc = Math.max(
    0,
    Math.min(needed, Math.min(content.width, content.height) / 2 - DISC_GAP - Math.abs(ink.y)),
  )
  const fit = needed > 0 ? Math.max(MIN_FIT, disc / needed) : 1
  // why: the readout shrinks about the card's center, so its ink center moves in with it.
  const discOffset = { x: 0, y: ink.y * fit }
  const toward = reach ? rotate(reach.x, reach.y, -rotation) : { x: 0, y: -1 }
  const angle = Math.atan2(toward.y, toward.x)
  const outward = rotate(Math.cos(angle), Math.sin(angle), rotation)
  const cardDiscOffset = rotate(discOffset.x, discOffset.y, rotation)
  const floodAt = reach && { x: card.width / 2 + reach.x, y: card.height / 2 + reach.y }
  return {
    content,
    disc,
    fit,
    discOffset,
    cardDiscOffset,
    knock: { x: -outward.x, y: -outward.y },
    flood: reach &&
      floodAt && {
        ...floodAt,
        card: reach.card,
        distance: reach.distance,
        discGap: floodGap(
          { ...floodAt, card: reach.card },
          { x: card.width / 2 + cardDiscOffset.x, y: card.height / 2 + cardDiscOffset.y },
        ),
      },
  }
}
