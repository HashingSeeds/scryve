import type { EventPlayerState } from "../convex/lib/events/model"

export function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const roster = (count: number): EventPlayerState[] =>
  Array.from({ length: count }, (_, index) => ({ id: `p${index}`, dropped: false }))
