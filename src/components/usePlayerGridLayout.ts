import { useMemo } from "react"

import { useWindowSpansHinge } from "@/utils/useWindowSpansHinge"

import { getPlayerGridLayout } from "./playerGridGeometry"

type LayoutInput = Omit<Parameters<typeof getPlayerGridLayout>[0], "spansHinge">

export function usePlayerGridLayout({
  playerCount,
  width,
  height,
  fontScale,
  layoutVariant,
}: LayoutInput) {
  const spansHinge = useWindowSpansHinge()
  return useMemo(
    () => getPlayerGridLayout({ playerCount, width, height, fontScale, layoutVariant, spansHinge }),
    [playerCount, width, height, fontScale, layoutVariant, spansHinge],
  )
}
