import { defaultFreeMulligans } from "./mulligans"

it.each([
  ["mtg", "commander", 2, "first"],
  ["mtg", "brawl", 2, "first"],
  ["mtg", "modern", 3, "first"],
  ["mtg", "modern", 2, "none"],
] as const)("starts %s %s with %i players at %s free", (system, format, players, free) => {
  expect(defaultFreeMulligans(system, format, players)).toBe(free)
})
