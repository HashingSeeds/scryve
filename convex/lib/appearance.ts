export const CONNECTED_PLAYER_MARK_SHAPES = [
  "circle",
  "triangle",
  "square",
  "diamond",
  "star",
  "hexagon",
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

export type PlayerMarkShape =
  (typeof PLAYER_MARK_SHAPES)[number] | (typeof CONNECTED_PLAYER_MARK_SHAPES)[number]

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
    (value === "circle" || PLAYER_MARK_SHAPES.some((shape) => shape === value))
  )
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
