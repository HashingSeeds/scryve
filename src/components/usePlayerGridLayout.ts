import { useMemo } from "react"

import { useWindowSpansHinge } from "@/utils/useWindowSpansHinge"

import { getPlayerGridLayout } from "./playerGridGeometry"
import { teamGridLayout } from "./teamGridGeometry"

type LayoutInput = Omit<Parameters<typeof getPlayerGridLayout>[0], "spansHinge">

export function usePlayerGridLayout({
  playerCount,
  width,
  height,
  fontScale,
  layoutVariant,
  teamBoard = false,
}: LayoutInput & { teamBoard?: boolean }) {
  const spansHinge = useWindowSpansHinge()
  return useMemo(
    () =>
      (teamBoard ? teamGridLayout : getPlayerGridLayout)({
        playerCount,
        width,
        height,
        fontScale,
        layoutVariant,
        spansHinge,
      }),
    [playerCount, width, height, fontScale, layoutVariant, spansHinge, teamBoard],
  )
}
