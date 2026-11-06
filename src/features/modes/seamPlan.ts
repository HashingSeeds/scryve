import type { SeamNeighbor, SeamSide } from "@/components/playerGridGeometry"

export type SeamItem = "plane" | "scheme" | "schemeDue" | "die"
type Side = "left" | "right"

/** why: a sideways card centers its + and − across its width, at both ends, so a plate straddling the seam stops short of them. */
const GLYPH_HALF = 25
const GAP = 2
export const PLATE_HEIGHT = 34
export const ICON_WIDTH = 30
export const FULL_PLATE_WIDTH = 96
const SEAM_GUTTER = 4

export interface SeamRoom {
  width: number
  shift: number
  rotation: 0 | 180
  start: number
  direction: 1 | -1
  inActiveCard: boolean
}

export interface SeamGeometry {
  sides: { left: SeamSide; right: SeamSide }
  facings: readonly number[]
  anchorX: number
  width: number
  menuSize: number
  edge: number
}

const across = (facing: number | undefined) => facing === 0 || facing === 180

/** why: an active across card's turn chip slides beside the pentagon on its holder's right, which is the board's left for a seat across the table. */
const chipSideOf = (facing: number): Side => (facing === 180 ? "left" : "right")

const inCard = PLATE_HEIGHT / 2 + SEAM_GUTTER / 2 + GAP

/**
 * why: plates may only sit where #953's turn chip, the + and − glyphs, the life total, and the
 * name row (with #955's counter chips) never are: a card facing across the seam leaves its top
 * band free except where its active chip slides, and a sideways card leaves the run between its
 * glyphs and the pentagon free.
 */
export function seamRoom(
  geometry: SeamGeometry,
  side: Side,
  busySlots: ReadonlySet<number>,
): SeamRoom | undefined {
  const { sides, facings, anchorX, width, menuSize, edge } = geometry
  const { upper, lower } = sides[side]
  const direction = side === "left" ? -1 : 1
  const start = anchorX * width + direction * (menuSize / 2 + GAP)
  const facingOf = (neighbor: SeamNeighbor | undefined) =>
    neighbor === undefined ? undefined : facings[neighbor.slot]
  const usable = (neighbor: SeamNeighbor | undefined) => {
    const facing = facingOf(neighbor)
    return (
      neighbor !== undefined &&
      facing !== undefined &&
      across(facing) &&
      !(busySlots.has(neighbor.slot) && chipSideOf(facing) === side)
    )
  }
  const room = (
    limit: number,
    shift: number,
    rotation: 0 | 180,
    host?: SeamNeighbor,
  ): SeamRoom | undefined => {
    const run = (limit - start) * direction
    const inActiveCard = host !== undefined && busySlots.has(host.slot)
    return run > 0 ? { width: run, shift, rotation, start, direction, inActiveCard } : undefined
  }
  const outer = (neighbor: SeamNeighbor) =>
    (side === "left" ? neighbor.leftFraction : neighbor.rightFraction) * width - direction * edge
  const hosts = [upper, lower]
    .filter(usable)
    .sort((a, b) => Number(busySlots.has(b!.slot)) - Number(busySlots.has(a!.slot)))
  const host = hosts[0]
  if (host)
    return room(
      outer(host),
      host === upper ? -inCard : inCard,
      facingOf(host) === 180 ? 180 : 0,
      host,
    )

  const sideways = [upper, lower].filter(
    (neighbor): neighbor is SeamNeighbor => neighbor !== undefined && !across(facingOf(neighbor)),
  )
  if (sideways.length === 0) return undefined
  const glyphs = sideways.map(
    (neighbor) =>
      ((neighbor.leftFraction + neighbor.rightFraction) / 2) * width -
      direction * (GLYPH_HALF + GAP),
  )
  const limit = side === "left" ? Math.max(...glyphs) : Math.min(...glyphs)
  // why: an across neighbor the plate can't use holds its chip at the seam, so the plate moves wholly into the sideways card.
  const shift = sideways.length === 2 ? 0 : sideways[0] === upper ? -inCard : inCard
  return room(limit, shift, 0)
}

// why: "Scheme due" has to be read, so it never shrinks to art the way a revealed scheme does.
export const minWidth = (item: SeamItem) => (item === "schemeDue" ? FULL_PLATE_WIDTH : ICON_WIDTH)

export interface SeamSlot {
  room: SeamRoom
  items: SeamItem[]
}

/** why: the die sits in the active seat's card so it reads their way, the plane takes the other side, and the schemes the right; a side with no room hands its plates to the other. */
export function planSeam(
  rooms: { left?: SeamRoom; right?: SeamRoom },
  items: readonly SeamItem[],
): { left?: SeamSlot; right?: SeamSlot } {
  const fits = (room: SeamRoom | undefined, placed: readonly SeamItem[]) =>
    room !== undefined &&
    placed.reduce((total, item) => total + minWidth(item) + GAP, -GAP) <= room.width
  const dieSide: Side = rooms.left?.inActiveCard && !rooms.right?.inActiveCard ? "left" : "right"
  const sideOf = (item: SeamItem): Side =>
    item === "die" || item === "schemeDue"
      ? dieSide
      : item === "plane" && items.includes("die") && dieSide === "left"
        ? "right"
        : item === "plane"
          ? "left"
          : "right"
  const left = items.filter((item) => sideOf(item) === "left")
  const right = items.filter((item) => sideOf(item) === "right")
  if (!fits(rooms.left, left) || !fits(rooms.right, right)) {
    const roomier = (rooms.left?.width ?? 0) >= (rooms.right?.width ?? 0) ? "left" : "right"
    const room = rooms[roomier]
    const kept = items.filter((_, index) => fits(room, items.slice(0, index + 1)))
    return room && kept.length > 0 ? { [roomier]: { room, items: kept } } : {}
  }
  return {
    ...(rooms.left && left.length ? { left: { room: rooms.left, items: left } } : {}),
    ...(rooms.right && right.length ? { right: { room: rooms.right, items: right } } : {}),
  }
}

/** why: an active card facing across the seam has the pentagon centered on its edge, so its turn chip has no room for what rides beside it (TurnChipLayer drops it) and the seam carries it. */
export function chipCrowdedBySeam(
  geometry: Pick<SeamGeometry, "sides" | "facings">,
  busySlots: ReadonlySet<number>,
) {
  const neighbors = [geometry.sides.left, geometry.sides.right].flatMap(({ upper, lower }) => [
    upper,
    lower,
  ])
  return neighbors.some(
    (neighbor) =>
      neighbor !== undefined &&
      busySlots.has(neighbor.slot) &&
      across(geometry.facings[neighbor.slot]),
  )
}
