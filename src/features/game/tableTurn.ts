import type { LayoutRectangle } from "react-native"
import type { SharedValue } from "react-native-reanimated"

export interface TableTurn {
  /** why: the board turns opposite the device by the same amount, clockwise positive, so it holds still on the table. */
  angle: SharedValue<number>
  landed?: "upright" | "reversed"
}

export const TABLE_TURN_GATHER_DEG = 45

export function tableTurnGather(angle: number) {
  "worklet"
  const progress = Math.min(Math.abs(angle) / TABLE_TURN_GATHER_DEG, 1)
  return progress * progress * (3 - 2 * progress)
}

/** why: the players can turn either way; one way lands on the panel's own Table board, the other on that board upside down. */
export function tableTurnLanding(angle: number, holderAngle: number): "upright" | "reversed" {
  "worklet"
  return Math.sign(angle) === -Math.sign(holderAngle) ? "upright" : "reversed"
}

export function rotateRectAround(
  rect: LayoutRectangle,
  center: { x: number; y: number },
  quarterTurns: number,
): LayoutRectangle {
  const radians = (quarterTurns * Math.PI) / 2
  const cos = Math.round(Math.cos(radians))
  const sin = Math.round(Math.sin(radians))
  const dx = rect.x + rect.width / 2 - center.x
  const dy = rect.y + rect.height / 2 - center.y
  const sideways = quarterTurns % 2 !== 0
  const width = sideways ? rect.height : rect.width
  const height = sideways ? rect.width : rect.height
  return {
    x: center.x + cos * dx - sin * dy - width / 2,
    y: center.y + sin * dx + cos * dy - height / 2,
    width,
    height,
  }
}

/** why: past the gather a seat only grows by `scale`, so its layout stays fixed for the rest of the turn; relaying out six cards every frame held the turn near 30 fps. */
export function tableTurnPlacement(input: {
  cell: LayoutRectangle
  table: LayoutRectangle
  board: { width: number; height: number }
  angle: number
}) {
  "worklet"
  const { cell, table, board, angle } = input
  const fit = Math.min(board.width, board.height) / Math.max(board.width, board.height)
  const centerX = board.width / 2
  const centerY = board.height / 2
  const grown = fit + (1 - fit) * Math.min(Math.abs(angle) / 90, 1)
  const gathered = tableTurnGather(angle)
  const mix = (from: number, to: number) => from + (to - from) * gathered
  const dx = mix(cell.x + cell.width / 2 - centerX, grown * (table.x + table.width / 2 - centerX))
  const dy = mix(cell.y + cell.height / 2 - centerY, grown * (table.y + table.height / 2 - centerY))
  const radians = (angle * Math.PI) / 180
  // why: seats cross paths while gathering, so they shrink a little on the way and pass without covering each other.
  const passing = 1 - 0.28 * Math.sin(Math.PI * gathered)
  const scale = (1 + (grown - 1) * gathered) * passing
  return {
    centerX: centerX + Math.cos(radians) * dx - Math.sin(radians) * dy,
    centerY: centerY + Math.sin(radians) * dx + Math.cos(radians) * dy,
    width: (mix(cell.width, grown * table.width) * passing) / scale,
    height: (mix(cell.height, grown * table.height) * passing) / scale,
    angle,
    scale,
  }
}
