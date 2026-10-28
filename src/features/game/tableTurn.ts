import type { LayoutRectangle } from "react-native"
import type { Hinge } from "expo-hinge"
import type { SharedValue } from "react-native-reanimated"

export interface TableTurn {
  /** why: the board turns opposite the device by the same amount, clockwise positive, so it holds still on the table. */
  angle: SharedValue<number>
  /** why: the seats spread from where the closed outer board drew them as the hinge opens, 0 at the switch to the inner display and 1 when flat. */
  unfolded: SharedValue<number>
  /** why: the way the players turned the board to land it, 1 clockwise and -1 counterclockwise; each way puts every seat in the upright layout's cell nearest where it sits. */
  landed?: TurnWay
}

export type TurnWay = 1 | -1

const UNFOLD_FROM_DEG = 25
const UNFOLD_TO_DEG = 165
// why: closing, the Duo moves its window to the outer display at about 84 degrees (measured in the simulator), long before it shuts, so the fold must be done by then.
const REFOLD_BY_DEG = 84

export function initialUnfoldProgress(hinge: Hinge | null) {
  "worklet"
  if (!hinge || hinge.status === "fullyOpen") return 1
  return Math.min(
    Math.max((hinge.angle - UNFOLD_FROM_DEG) / (UNFOLD_TO_DEG - UNFOLD_FROM_DEG), 0),
    1,
  )
}

/** why: opening spreads the seats over the hinge's whole travel, but closing must fold them before the window switches; covering the remaining distance in whichever direction the hinge moves keeps the board continuous when it changes direction. */
export function nextUnfoldProgress(progress: number, fromAngle: number, hinge: Hinge | null) {
  "worklet"
  if (!hinge || hinge.status === "fullyOpen") return 1
  const angle = hinge.angle
  if (angle > fromAngle) {
    const start = Math.max(fromAngle, UNFOLD_FROM_DEG)
    if (angle <= start || start >= UNFOLD_TO_DEG) return progress
    return (
      progress +
      ((1 - progress) * (Math.min(angle, UNFOLD_TO_DEG) - start)) / (UNFOLD_TO_DEG - start)
    )
  }
  const start = Math.min(fromAngle, UNFOLD_TO_DEG)
  if (angle >= start || start <= REFOLD_BY_DEG) return angle < REFOLD_BY_DEG ? 0 : progress
  return Math.max(
    progress - (progress * (start - Math.max(angle, REFOLD_BY_DEG))) / (start - REFOLD_BY_DEG),
    0,
  )
}

export function easeUnfold(progress: number) {
  "worklet"
  return progress * progress * (3 - 2 * progress)
}

/** why: the board is drawn on the panel, which the window turns by the holder's angle, so a rect the holder sees upright turns the other way onto the panel. */
export function windowRectToPanel(
  rect: LayoutRectangle,
  panel: { width: number; height: number },
  holderAngle: number,
): LayoutRectangle {
  const sideways = holderAngle % 180 !== 0
  const window = sideways ? { width: panel.height, height: panel.width } : panel
  const shifted = {
    ...rect,
    x: rect.x + (panel.width - window.width) / 2,
    y: rect.y + (panel.height - window.height) / 2,
  }
  return rotateRectAround(shifted, { x: panel.width / 2, y: panel.height / 2 }, holderAngle / 90)
}

export const TABLE_TURN_GATHER_DEG = 45

export function tableTurnGather(angle: number) {
  "worklet"
  const progress = Math.min(Math.abs(angle) / TABLE_TURN_GATHER_DEG, 1)
  return progress * progress * (3 - 2 * progress)
}

/** why: the board holds still on the table while the device turns under it, so each seat lands in the upright layout's cell nearest the spot it already sits at once the board has turned `way` a quarter. Returns the upright slot each kept slot lands in. */
export function landingSlots(
  kept: Map<number, LayoutRectangle>,
  upright: Map<number, LayoutRectangle>,
  board: { width: number; height: number },
  way: TurnWay,
): Map<number, number> {
  const center = { x: board.width / 2, y: board.height / 2 }
  const middle = (rect: LayoutRectangle) => ({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  })
  const pairs = [...kept].flatMap(([slot, rect]) => {
    const { x, y } = middle(rect)
    const turned = { x: center.x - way * (y - center.y), y: center.y + way * (x - center.x) }
    return [...upright].map(([target, cell]) => {
      const to = middle(cell)
      return { slot, target, distance: Math.hypot(to.x - turned.x, to.y - turned.y) }
    })
  })
  const landing = new Map<number, number>()
  const taken = new Set<number>()
  for (const { slot, target } of pairs.sort((a, b) => a.distance - b.distance)) {
    if (landing.has(slot) || taken.has(target)) continue
    landing.set(slot, target)
    taken.add(target)
  }
  return landing
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

export type SquaredCorners = readonly [
  topLeft: number,
  topRight: number,
  bottomRight: number,
  bottomLeft: number,
]

/** why: a card turned a quarter clockwise shows its own top left corner at the panel's top right, so a corner it lands in maps back by the turn. */
export function cornersSeenTurned(panel: SquaredCorners, quarterTurns: number): SquaredCorners {
  const at = (corner: number) => panel[(((corner + quarterTurns) % 4) + 4) % 4]
  return [at(0), at(1), at(2), at(3)]
}

/** why: a card squares a corner only once it sits in a device corner, so it stays rounded while it unfolds or turns and squares off as it arrives. */
export function turningCornerRadii(input: {
  radius: number
  unfolded: number
  angle: number
  resting: SquaredCorners
  landingClockwise: SquaredCorners
  landingCounterclockwise: SquaredCorners
}) {
  "worklet"
  const clamp = (value: number) => Math.min(Math.max(value, 0), 1)
  const turned = Math.abs(input.angle) / 90
  const rest = clamp((input.unfolded - 0.85) / 0.15) * (1 - clamp(turned / 0.1))
  const arrive = clamp((turned - 0.9) / 0.1)
  const landing = input.angle >= 0 ? input.landingClockwise : input.landingCounterclockwise
  const radiusAt = (corner: number) =>
    input.radius * (1 - Math.max(input.resting[corner] * rest, landing[corner] * arrive))
  return {
    borderTopLeftRadius: radiusAt(0),
    borderTopRightRadius: radiusAt(1),
    borderBottomRightRadius: radiusAt(2),
    borderBottomLeftRadius: radiusAt(3),
  }
}
