import Svg, { Path } from "react-native-svg"

import type { DiceTool } from "@/features/game/dice"

import { DIE_FACES, POUCH_PATH } from "./tableGlyphs"

/** why: the pouch's ink spans 13.9 of its 16-unit box, so the box grows until the ink is `inkHeight` tall. */
export function DiceBagGlyph({ inkHeight, color }: { inkHeight: number; color: string }) {
  const size = (inkHeight * 16) / 13.9
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path d={POUCH_PATH} fill={color} />
    </Svg>
  )
}

export function DieFace({ tool, size, color }: { tool: DiceTool; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={DIE_FACES[tool]} fill={color} fillRule="evenodd" />
    </Svg>
  )
}
