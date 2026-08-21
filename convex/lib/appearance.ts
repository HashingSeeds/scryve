export const PLAYER_MARK_SHAPES = [
  "circle",
  "triangle",
  "square",
  "diamond",
  "star",
  "hexagon",
] as const

export type PlayerMarkShape = (typeof PLAYER_MARK_SHAPES)[number]

export const PLAYER_COLOR_CHOICES = [
  "#B85636",
  "#41476E",
  "#39755C",
  "#94632D",
  "#77558A",
  "#A33A52",
] as const

export type PlayerAppearance = { color: string; shape: PlayerMarkShape }

export function isPlayerMarkShape(value: unknown): value is PlayerMarkShape {
  return typeof value === "string" && PLAYER_MARK_SHAPES.includes(value as PlayerMarkShape)
}

export function shapeForSeat(seat: number): PlayerMarkShape {
  return PLAYER_MARK_SHAPES[Math.abs(seat - 1) % PLAYER_MARK_SHAPES.length]
}

export function appearanceKey(appearance: PlayerAppearance) {
  return `${appearance.color.toUpperCase()}:${appearance.shape}`
}

export function appearanceIsTaken(taken: PlayerAppearance[], candidate: PlayerAppearance) {
  const key = appearanceKey(candidate)
  return taken.some((entry) => appearanceKey(entry) === key)
}

export function resolveAppearance({
  preferred,
  taken,
  seat,
}: {
  preferred?: Partial<PlayerAppearance>
  taken: PlayerAppearance[]
  seat: number
}): PlayerAppearance {
  const preferredColor = preferred?.color?.toUpperCase()
  const fallbackColor =
    PLAYER_COLOR_CHOICES[Math.abs(seat - 1) % PLAYER_COLOR_CHOICES.length].toUpperCase()
  const color = preferredColor ?? fallbackColor
  const shape = isPlayerMarkShape(preferred?.shape) ? preferred.shape : shapeForSeat(seat)
  const first = { color, shape }
  if (!appearanceIsTaken(taken, first)) return first

  for (const candidateShape of PLAYER_MARK_SHAPES) {
    const candidate = { color, shape: candidateShape }
    if (!appearanceIsTaken(taken, candidate)) return candidate
  }
  for (const candidateColor of PLAYER_COLOR_CHOICES) {
    for (const candidateShape of PLAYER_MARK_SHAPES) {
      const candidate = { color: candidateColor.toUpperCase(), shape: candidateShape }
      if (!appearanceIsTaken(taken, candidate)) return candidate
    }
  }
  return first
}
