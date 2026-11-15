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

export const firstPlayerModeValidator = v.union(v.literal("roll"), v.literal("pick"))
export const firstChoiceReasonValidator = v.union(
  v.literal("flip"),
  v.literal("roll"),
  v.literal("loss"),
)

export const mulliganHandSize = (system: unknown) => systemDefinition(system)?.mulligan?.handSize

const FREE_FOREVER_LIMIT = 99

export const maxMulligans = (free: FreeMulligans, handSize: number) =>
  free === "all" ? FREE_FOREVER_LIMIT : handSize + (free === "first" ? 1 : 0)

export const isMulliganCount = (count: number, free: FreeMulligans, handSize: number) =>
  Number.isInteger(count) && count >= 0 && count <= maxMulligans(free, handSize)

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
