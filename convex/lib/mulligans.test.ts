import { defaultFreeMulligans, isMulliganCount, keptHandSize } from "./mulligans"

it.each([
  ["mtg", "commander", 2, "first"],
  ["mtg", "brawl", 2, "first"],
  ["mtg", "modern", 3, "first"],
  ["mtg", "modern", 2, "none"],
] as const)("starts %s %s with %i players at %s free", (system, format, players, free) => {
  expect(defaultFreeMulligans(system, format, players)).toBe(free)
})

it.each([
  ["none", 7, true, 0],
  ["none", 8, false, 0],
  ["first", 8, true, 0],
  ["first", 9, false, 0],
  ["all", 12, true, 7],
] as const)("under %s free, %i mulligans counts: %s, keeping %i", (free, count, valid, kept) => {
  expect(isMulliganCount(count, free, 7)).toBe(valid)
  if (valid) expect(keptHandSize(count, free, 7)).toBe(kept)
})
