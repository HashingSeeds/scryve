import { preconstructedFormat } from "./deckGames"

it.each([
  ["Challenger Deck", "standard"],
  ["Pioneer Challenger Deck", "pioneer"],
  ["Modern Event Deck", "modern"],
  ["Commander Deck", "commander"],
])("keeps %s lists in %s", (type, format) => {
  expect(preconstructedFormat(type)).toBe(format)
})
