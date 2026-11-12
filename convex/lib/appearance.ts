/** why: ids are stored and sent to installed clients, so a redrawn mark keeps its id. "heart" draws a leaf and "triangle" a rosette; older builds still draw a heart and a triangle. */
export const CONNECTED_PLAYER_MARK_SHAPES = [
  "heart",
  "triangle",
  "square",
  "diamond",
  "star",
  "hexagon",
] as const

/** why: installed clients from before heart replaced circle still offer circle in hosted lobbies, and saved games still hold it, so the server keeps accepting it. */
export const ACCEPTED_CONNECTED_PLAYER_MARK_SHAPES = [
  ...CONNECTED_PLAYER_MARK_SHAPES,
  "circle",
] as const

/** why: only builds that draw more than six seats can sit at a bigger table, and those draw every mark here. Marks added after them stay out of hosted games. */
export const MANY_SEAT_MARK_SHAPES = [
  "heart",
  "triangle",
  "square",
  "diamond",
  "star",
  "hexagon",
  "plus",
  "shield",
  "moon",
  "ring",
  "circle",
] as const

/** why: hosted lobbies over six seats offer the marks every build that seats them draws; circle stays accepted but is not offered. */
export const MANY_SEAT_PICKER_SHAPES = MANY_SEAT_MARK_SHAPES.filter((shape) => shape !== "circle")

/** why: seat defaults for games on one device. Installed builds cannot draw banner, quatrefoil, meeple or hourglass, so hosted games never offer them and a published local game trades them for hosted marks. */
export const PLAYER_MARK_SHAPES = [
  "heart",
  "triangle",
  "banner",
  "quatrefoil",
  "star",
  "hexagon",
  "meeple",
  "shield",
  "hourglass",
  "ring",
] as const

/** why: square, diamond, plus and moon were seat defaults until clearer marks replaced them; saved games and recent setups still hold them, so local pickers offer them after the defaults. */
export const LOCAL_MARK_SHAPES = [
  ...PLAYER_MARK_SHAPES,
  "square",
  "diamond",
  "plus",
  "moon",
] as const

/** why: Pro marks render only in builds that know them, so they never join the seat-default or connected lists that every installed client must draw. */
export const PRO_MARK_SHAPES = [
  "crown",
  "flame",
  "bolt",
  "eye",
  "skull",
  "spade",
  "gem",
  "tower",
] as const

export type ProMarkShape = (typeof PRO_MARK_SHAPES)[number]

export type PlayerMarkShape =
  | (typeof LOCAL_MARK_SHAPES)[number]
  | (typeof ACCEPTED_CONNECTED_PLAYER_MARK_SHAPES)[number]
  | ProMarkShape

export const PLAYER_COLOR_CHOICES = [
  "#B85636",
  "#41476E",
  "#39755C",
  "#94632D",
  "#77558A",
  "#A33A52",
  "#117B9C",
  "#857200",
  "#507C24",
  "#A8458F",
] as const

export type PlayerAppearance = { color: string; shape: PlayerMarkShape }

export function isPlayerMarkShape(value: unknown): value is PlayerMarkShape {
  return (
    typeof value === "string" &&
    (value === "circle" ||
      LOCAL_MARK_SHAPES.some((shape) => shape === value) ||
      isProMarkShape(value))
  )
}

export function isProMarkShape(value: unknown): value is ProMarkShape {
  return PRO_MARK_SHAPES.some((shape) => shape === value)
}

/** why: a connected seat keeps the free `shape` installed clients draw, and builds that know Pro marks draw its `proShape` instead. */
export function shownMarkShape(seat: {
  shape?: string
  proShape?: string
}): PlayerMarkShape | undefined {
  if (isProMarkShape(seat.proShape)) return seat.proShape
  return isPlayerMarkShape(seat.shape) ? seat.shape : undefined
}

export function shapeForSeat(
  seat: number,
  shapes: readonly PlayerMarkShape[] = CONNECTED_PLAYER_MARK_SHAPES,
): PlayerMarkShape {
  return shapes[Math.abs(seat - 1) % shapes.length]
}

export type TakenAppearance = { color?: string; shape: PlayerMarkShape }

export function appearanceIsTaken(taken: TakenAppearance[], candidate: PlayerAppearance) {
  return taken.some(
    (entry) =>
      entry.color?.toUpperCase() === candidate.color.toUpperCase() ||
      entry.shape === candidate.shape,
  )
}

export function resolveAppearance({
  preferred,
  taken,
  seat,
  shapes = LOCAL_MARK_SHAPES,
}: {
  preferred?: Partial<PlayerAppearance>
  taken: TakenAppearance[]
  seat: number
  shapes?: readonly PlayerMarkShape[]
}): PlayerAppearance {
  const preferredColor = preferred?.color?.toUpperCase()
  const fallbackColor =
    PLAYER_COLOR_CHOICES[Math.abs(seat - 1) % PLAYER_COLOR_CHOICES.length].toUpperCase()
  const usedColors = new Set(taken.flatMap((entry) => entry.color?.toUpperCase() ?? []))
  const usedShapes = new Set(taken.map((entry) => entry.shape))
  const color = [preferredColor ?? fallbackColor, ...PLAYER_COLOR_CHOICES].find(
    (candidate) => !usedColors.has(candidate),
  )
  const preferredShape = isPlayerMarkShape(preferred?.shape)
    ? preferred.shape
    : shapeForSeat(seat, shapes)
  const shape = [preferredShape, ...shapes].find(
    (candidate) => shapes.includes(candidate) && !usedShapes.has(candidate),
  )
  if (!color || !shape) throw new Error("No unused player colors or shapes remain")
  return { color, shape }
}

export function resolvePlayerAppearances<T extends { seat: number; color: string; shape?: string }>(
  players: T[],
  shapes: readonly PlayerMarkShape[] = LOCAL_MARK_SHAPES,
  teams: readonly (readonly number[])[] = [],
) {
  const taken: (PlayerAppearance & { seat: number })[] = []
  return [...players]
    .sort((left, right) => left.seat - right.seat)
    .map((player) => {
      const team = teams.find((seats) => seats.includes(player.seat)) ?? [player.seat]
      const mate = taken.find(({ seat }) => team.includes(seat))
      const appearance = resolveAppearance({
        preferred: {
          color: mate?.color ?? player.color,
          ...(isPlayerMarkShape(player.shape) ? { shape: player.shape } : {}),
        },
        taken: taken.map(({ seat, color, shape }) =>
          team.includes(seat) ? { shape } : { color, shape },
        ),
        seat: player.seat,
        shapes,
      })
      taken.push({ ...appearance, seat: player.seat })
      return { ...player, ...appearance }
    })
}

/** why: a device that loses Pro keeps its saved seats, but its games start with free marks; each Pro mark gives way to the first free mark no other seat holds. */
export function withoutProMarks(appearances: readonly PlayerAppearance[]): PlayerAppearance[] {
  return appearances.reduce<PlayerAppearance[]>(
    (resolved, appearance, index) => [
      ...resolved,
      isProMarkShape(appearance.shape)
        ? resolveAppearance({
            preferred: { color: appearance.color },
            taken: [...resolved, ...appearances.slice(index + 1)],
            seat: index + 1,
          })
        : appearance,
    ],
    [],
  )
}
