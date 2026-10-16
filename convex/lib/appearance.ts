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

export const PLAYER_MARK_SHAPES = [
  "heart",
  "triangle",
  "square",
  "diamond",
  "star",
  "hexagon",
  "plus",
  "shield",
] as const

/** why: Pro marks render only in builds that know them, so they never join the seat-default or connected lists that every installed client must draw. */
export const PRO_MARK_SHAPES = ["crown", "flame", "bolt", "eye"] as const

export type ProMarkShape = (typeof PRO_MARK_SHAPES)[number]

export type PlayerMarkShape =
  | (typeof PLAYER_MARK_SHAPES)[number]
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
] as const

export type PlayerAppearance = { color: string; shape: PlayerMarkShape }

export function isPlayerMarkShape(value: unknown): value is PlayerMarkShape {
  return (
    typeof value === "string" &&
    (value === "circle" ||
      PLAYER_MARK_SHAPES.some((shape) => shape === value) ||
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

export function appearanceIsTaken(taken: PlayerAppearance[], candidate: PlayerAppearance) {
  return taken.some(
    (entry) =>
      entry.color.toUpperCase() === candidate.color.toUpperCase() ||
      entry.shape === candidate.shape,
  )
}

export function resolveAppearance({
  preferred,
  taken,
  seat,
  shapes = PLAYER_MARK_SHAPES,
}: {
  preferred?: Partial<PlayerAppearance>
  taken: PlayerAppearance[]
  seat: number
  shapes?: readonly PlayerMarkShape[]
}): PlayerAppearance {
  const preferredColor = preferred?.color?.toUpperCase()
  const fallbackColor =
    PLAYER_COLOR_CHOICES[Math.abs(seat - 1) % PLAYER_COLOR_CHOICES.length].toUpperCase()
  const usedColors = new Set(taken.map((entry) => entry.color.toUpperCase()))
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
  shapes: readonly PlayerMarkShape[] = PLAYER_MARK_SHAPES,
) {
  const taken: PlayerAppearance[] = []
  return [...players]
    .sort((left, right) => left.seat - right.seat)
    .map((player) => {
      const appearance = resolveAppearance({
        preferred: {
          color: player.color,
          ...(isPlayerMarkShape(player.shape) ? { shape: player.shape } : {}),
        },
        taken,
        seat: player.seat,
        shapes,
      })
      taken.push(appearance)
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
