import { Edge, useSafeAreaInsets } from "react-native-safe-area-context"

import { endEdge, startEdge } from "@/theme/direction"

import { useTopEdgeBand } from "./useTopEdgeBand"

export type ExtendedEdge = Edge | "start" | "end"

// why: native swaps left and right styles in RTL, so a physical inset is written on the logical side it lands on.
const propertySuffixMap = {
  top: "Top",
  bottom: "Bottom",
  left: startEdge === "left" ? "Start" : "End",
  right: startEdge === "right" ? "Start" : "End",
  start: "Start",
  end: "End",
}

const edgeInsetMap: Record<string, Edge> = {
  start: startEdge,
  end: endEdge,
}

export type SafeAreaInsetsStyle<
  Property extends "padding" | "margin" = "padding",
  Edges extends Array<ExtendedEdge> = Array<ExtendedEdge>,
> = {
  [K in Edges[number] as `${Property}${Capitalize<K>}`]: number
}

/**
 * A hook that can be used to create a safe-area-aware style object that can be passed directly to a View.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/app/utils/useSafeAreaInsetsStyle.ts/}
 * @param {ExtendedEdge[]} safeAreaEdges - The edges to apply the safe area insets to.
 * @param {"padding" | "margin"} property - The property to apply the safe area insets to.
 * @returns {SafeAreaInsetsStyle<Property, Edges>} - The style object with the safe area insets applied.
 */
export function useSafeAreaInsetsStyle<
  Property extends "padding" | "margin" = "padding",
  Edges extends Array<ExtendedEdge> = [],
>(
  safeAreaEdges: Edges = [] as unknown as Edges,
  property: Property = "padding" as Property,
): SafeAreaInsetsStyle<Property, Edges> {
  const insets = useSafeAreaInsets()
  const topEdgeBand = useTopEdgeBand()

  return safeAreaEdges.reduce((acc, e) => {
    const value = edgeInsetMap[e] ?? e
    const inset = insets[value] + (value === "top" ? topEdgeBand : 0)
    return { ...acc, [`${property}${propertySuffixMap[e]}`]: inset }
  }, {}) as SafeAreaInsetsStyle<Property, Edges>
}
