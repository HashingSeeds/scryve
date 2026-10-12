import Svg, { Circle, Polygon } from "react-native-svg"

import type { DiceTool } from "@/features/game/dice"

export function DiceGlyph({ tool, size, color }: { tool: DiceTool; size: number; color: string }) {
  if (tool === "coin")
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}>
        <Circle cx={12} cy={12} r={10} strokeWidth={2.2} />
        <Circle cx={12} cy={12} r={6} strokeWidth={1.6} opacity={0.6} />
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
