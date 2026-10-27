import type { PlayerId } from "@/features/game/types"

import { LIFE_DIGIT_ASPECT } from "./playerCardTypes"

export interface CommanderBoardSeat {
  playerId: PlayerId
  row: number
  column: number
}

export interface CommanderBoardGrid {
  rows: number
  columns: number
  cells: (PlayerId | null)[][]
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

export function commanderBoardGrid(input: {
  seats: readonly CommanderBoardSeat[]
  rows: number
  columns: number
}): CommanderBoardGrid {
  const cells: (PlayerId | null)[][] = Array.from({ length: input.rows }, () =>
    Array.from({ length: input.columns }, () => null),
  )
  for (const seat of input.seats) cells[seat.row][seat.column] = seat.playerId
  return { rows: input.rows, columns: input.columns, cells }
}

export const COMMANDER_CELL_SIZE = 30
export const COMMANDER_COMPACT_CELL_SIZE = 24
// Below this the tabular digits stop being readable, so a cramped card scrolls
// its board out of the reserved space rather than shrinking past legibility.
export const COMMANDER_MIN_CELL_SIZE = 14

export function commanderCellSize(input: {
  rows: number
  columns: number
  gap: number
  preferred: number
  maxSize?: { width: number; height: number }
}): number {
  const { rows, columns, gap, preferred, maxSize } = input
  if (!maxSize) return preferred
  const fitsWidth = (maxSize.width - gap * Math.max(columns - 1, 0)) / Math.max(columns, 1)
  const fitsHeight = (maxSize.height - gap * Math.max(rows - 1, 0)) / Math.max(rows, 1)
  const fitted = Math.floor(Math.min(preferred, fitsWidth, fitsHeight))
  return Math.max(COMMANDER_MIN_CELL_SIZE, fitted)
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

export interface CommanderReach {
  x: number
  y: number
  radius: number
}

function seatCenter(
  gridRows: readonly (number | null)[][],
  rowFlexes: readonly number[],
  playerIndex: number,
) {
  const total = rowFlexes.reduce((sum, flex) => sum + flex, 0)
  let top = 0
  for (const [row, slots] of gridRows.entries()) {
    const height = rowFlexes[row] / total
    const column = slots.indexOf(playerIndex)
    if (column >= 0) return { x: (column + 0.5) / slots.length, y: top + height / 2 }
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
  const attacker = seatCenter(gridRows, rowFlexes, input.attackerIndex)
  const defender = seatCenter(gridRows, rowFlexes, input.defenderIndex)
  if (!attacker || !defender || !(board.width > 0) || !(board.height > 0)) return undefined
  const ax = attacker.x * board.width
  const ay = attacker.y * board.height
  return {
    x: ax - defender.x * board.width,
    y: ay - defender.y * board.height,
    radius: Math.max(
      ...[
        [0, 0],
        [board.width, 0],
        [0, board.height],
        [board.width, board.height],
      ].map(([x, y]) => Math.hypot(x - ax, y - ay)),
    ),
  }
}

export interface CommanderTakeover {
  content: { width: number; height: number }
  disc: number
  badges: { x: number; y: number; angle: number; size: number; distance: number }[]
  knock: { x: number; y: number }
  flood?: { x: number; y: number; radius: number }
}

// why: undo and the menu button sit in a card's corners and would cover a badge parked there.
const CORNER_CLEARANCE = 52
const BADGE_GAP = 6
const ANGLE_STEP = Math.PI / 90

function rotate(x: number, y: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  }
}

export function commanderTakeover(input: {
  card: { width: number; height: number }
  rotation: number
  lifeFontSize: number
  lifeDigits: number
  badgeSize: number
  badgeCount?: number
  reach?: CommanderReach
}): CommanderTakeover {
  const { card, rotation, lifeFontSize, badgeSize, badgeCount = 1, reach } = input
  const sideways = Math.abs(rotation) === 90
  const content = sideways
    ? { width: card.height, height: card.width }
    : { width: card.width, height: card.height }
  const textWidth = Math.max(input.lifeDigits, 2) * LIFE_DIGIT_ASPECT * lifeFontSize * 0.9
  const textHeight = lifeFontSize * 0.74
  const disc = Math.max(
    0,
    Math.min(
      Math.hypot(textWidth, textHeight) / 2 + lifeFontSize * 0.06,
      Math.min(content.width, content.height) / 2 - BADGE_GAP,
    ),
  )
  const distance = disc + badgeSize / 2 + BADGE_GAP
  const toward = reach ? rotate(reach.x, reach.y, -rotation) : { x: 0, y: -1 }
  const wanted = Math.atan2(toward.y, toward.x)
  const half = badgeSize / 2 + 4
  const spread = 2 * Math.asin(Math.min(1, (badgeSize + BADGE_GAP) / (2 * distance)))
  const anglesAround = (center: number) =>
    Array.from(
      { length: badgeCount },
      (_, index) => center + (index - (badgeCount - 1) / 2) * spread,
    )
  const fitsOne = (angle: number) => {
    const x = Math.cos(angle) * distance
    const y = Math.sin(angle) * distance
    const inside =
      Math.abs(x) + half <= content.width / 2 && Math.abs(y) + half <= content.height / 2
    const inCorner =
      Math.abs(x) + half > content.width / 2 - CORNER_CLEARANCE &&
      Math.abs(y) + half > content.height / 2 - CORNER_CLEARANCE
    return inside && !inCorner
  }
  const fits = (center: number) => anglesAround(center).every(fitsOne)
  let angle = wanted
  search: for (let offset = 0; offset <= Math.PI; offset += ANGLE_STEP)
    for (const candidate of [wanted + offset, wanted - offset])
      if (fits(candidate)) {
        angle = candidate
        break search
      }
  const outward = rotate(Math.cos(angle), Math.sin(angle), rotation)
  return {
    content,
    disc,
    badges: anglesAround(angle).map((badgeAngle) => ({
      x: Math.cos(badgeAngle) * distance,
      y: Math.sin(badgeAngle) * distance,
      angle: badgeAngle,
      size: badgeSize,
      distance,
    })),
    knock: { x: -outward.x, y: -outward.y },
    flood: reach && {
      x: card.width / 2 + reach.x,
      y: card.height / 2 + reach.y,
      radius: reach.radius,
    },
  }
}
