import { printedPower, seatCommander } from "./seatCommander"

it.each([
  ["3", 3],
  ["0", undefined],
  ["*", undefined],
  ["1+*", undefined],
  [undefined, undefined],
])("reads printed power %s as %s", (power, expected) => {
  expect(printedPower(power)).toBe(expected)
})

it("names and powers a deck's only commander", () => {
  const krenko = {
    name: "Krenko, Mob Boss",
    board: "commander" as const,
    scryfallId: "krenko",
    quantity: 1,
  }
  expect(
    seatCommander([krenko, { name: "Sol Ring", quantity: 1 }], () => ({ power: "3" })),
  ).toMatchObject({ name: "Krenko", power: 3 })
  expect(
    seatCommander([krenko, { ...krenko, name: "Tymna the Weaver", scryfallId: "tymna" }], () => ({
      power: "2",
    })),
  ).toEqual({})
})
