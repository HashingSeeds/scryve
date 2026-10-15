import Svg, { Circle, Polygon, Rect } from "react-native-svg"

import type { DiceTool } from "@/features/game/dice"

export function DiceGlyph({ tool, size, color }: { tool: DiceTool; size: number; color: string }) {
  if (tool === "coin")
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}>
        <Circle cx={12} cy={12} r={10} strokeWidth={2.2} />
        <Circle cx={12} cy={12} r={6} strokeWidth={1.6} opacity={0.6} />
      </Svg>
    )
  if (tool === "d6")
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}>
        <Rect x={3} y={3} width={18} height={18} rx={3.5} strokeWidth={2.2} />
        {[7.5, 12, 16.5].map((at) => (
          <Circle key={at} cx={at} cy={at} r={1.6} fill={color} stroke="none" />
        ))}
      </Svg>
    )
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeLinejoin="round"
    >
      <Polygon points="12,2 21,7 21,17 12,22 3,17 3,7" strokeWidth={2.2} />
      <Polygon points="12,6.5 17.5,15.5 6.5,15.5" strokeWidth={1.6} opacity={0.6} />
    </Svg>
  )
}
