export interface BoardPoint {
  x: number
  y: number
}

/** why: the pinned board is centered on the window and sits at -holderAngle there, because content turned by holderAngle reads upright. Points are normalized to the board and to the window. */
export function boardPointToWindowPoint(
  point: BoardPoint,
  board: { width: number; height: number },
  holderAngle: number,
): BoardPoint {
  const sideways = Math.abs(holderAngle) % 180 === 90
  const window = sideways
    ? { width: board.height, height: board.width }
    : { width: board.width, height: board.height }
  const radians = (-holderAngle * Math.PI) / 180
  const cos = Math.round(Math.cos(radians))
  const sin = Math.round(Math.sin(radians))
  const dx = (point.x - 0.5) * board.width
  const dy = (point.y - 0.5) * board.height
  return {
    x: 0.5 + (dx * cos - dy * sin) / window.width,
    y: 0.5 + (dx * sin + dy * cos) / window.height,
  }
}

export function nearestEquivalentAngle(current: number, target: number) {
  const delta = ((((target - current) % 360) + 540) % 360) - 180
  return current + delta
}
