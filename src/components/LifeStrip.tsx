import { Circle, G, Line, Path } from "react-native-svg"

export interface LifeScale {
  low: number
  high: number
}

export function lifeScale(lives: readonly (readonly number[])[]): LifeScale {
  const values = lives.flat()
  return { low: Math.min(0, ...values), high: Math.max(1, ...values) }
}

export function lastChangeRow(lives: readonly (readonly number[])[], column: number) {
  for (let row = lives.length - 1; row > 0; row--)
    if (lives[row][column] !== lives[row - 1][column]) return row
  return 0
}

export function lifePlot(
  rows: number,
  scale: LifeScale,
  width: number,
  height: number,
  inset: number,
) {
  return {
    x: (row: number) => inset + (row / (rows - 1)) * (width - inset * 2),
    y: (life: number) =>
      inset + (1 - (life - scale.low) / (scale.high - scale.low)) * (height - inset * 2),
  }
}

export function LifeStrip({
  lives,
  column,
  scale,
  width,
  height,
  color,
  baseline,
  out,
  strokeWidth = 2,
  inset = strokeWidth * 2,
}: {
  lives: readonly (readonly number[])[]
  column: number
  scale: LifeScale
  width: number
  height: number
  color: string
  baseline: string
  out: boolean
  strokeWidth?: number
  inset?: number
}) {
  const end = out ? lastChangeRow(lives, column) : lives.length - 1
  const { x, y } = lifePlot(lives.length, scale, width, height, inset)
  const endX = x(end)
  const endY = y(lives[end][column])
  const reach = strokeWidth * 1.6
  return (
    <G>
      <Line x1={x(0)} x2={x(lives.length - 1)} y1={y(0)} y2={y(0)} stroke={baseline} />
      <Path
        d={lives
          .slice(0, end + 1)
          .map((row, index) =>
            index === 0 ? `M${x(0)} ${y(row[column])}` : `H${x(index)} V${y(row[column])}`,
          )
          .join(" ")}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      {out ? (
        <Path
          d={`M${endX - reach} ${endY - reach}L${endX + reach} ${endY + reach}M${endX + reach} ${endY - reach}L${endX - reach} ${endY + reach}`}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ) : (
        <Circle cx={endX} cy={endY} r={reach} fill={color} />
      )}
    </G>
  )
}
