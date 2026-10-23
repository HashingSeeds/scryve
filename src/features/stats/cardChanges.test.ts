import { cardChanges, formatCardChange } from "./cardChanges"

it("diffs quantities and sections without treating printing changes as card changes", () => {
  expect(
    cardChanges(
      [
        { name: "Bolt", oracleId: "bolt", scryfallId: "new", quantity: 4 },
        { name: "Ring", quantity: 1 },
      ],
      [
        { name: "Bolt", oracleId: "bolt", scryfallId: "old", quantity: 2 },
        { name: "Land", quantity: 1 },
      ],
    ),
  ).toEqual([
    { name: "Bolt", quantity: 2 },
    { name: "Ring", quantity: 1 },
    { name: "Land", quantity: -1 },
  ])
  expect(
    cardChanges(
      [{ name: "Bolt", quantity: 2 }],
      [
        { name: "Bolt", quantity: 1 },
        { name: "Bolt", quantity: 1 },
      ],
    ),
  ).toEqual([])
})

it("formats additions and removals with a sign", () => {
  expect(formatCardChange({ name: "Forest", quantity: 1 })).toBe("+1 Forest")
  expect(formatCardChange({ name: "Plains", quantity: -2 })).toBe("−2 Plains")
})
