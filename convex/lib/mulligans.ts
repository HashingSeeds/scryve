import { v, type Infer } from "convex/values"

import { isCommanderFormat } from "./gameRules"
import { systemDefinition } from "./systems"

export const freeMulligansValidator = v.union(
  v.literal("none"),
  v.literal("first"),
  v.literal("all"),
)
export type FreeMulligans = Infer<typeof freeMulligansValidator>
export const FREE_MULLIGANS = ["none", "first", "all"] as const satisfies readonly FreeMulligans[]

export const mulliganHandSize = (system: unknown) => systemDefinition(system)?.mulligan?.handSize

export const isMulliganCount = (count: number, handSize: number) =>
  Number.isInteger(count) && count >= 0 && count <= handSize

export function keptHandSize(mulligans: number, free: FreeMulligans, handSize: number) {
  const paid = free === "all" ? 0 : Math.max(0, mulligans - (free === "first" ? 1 : 0))
  return Math.max(0, handSize - paid)
}

export function defaultFreeMulligans(
  system: unknown,
  format: string | undefined,
  playerCount: number,
): FreeMulligans {
  return playerCount > 2 || format === "brawl" || isCommanderFormat(system, format)
    ? "first"
    : "none"
}
