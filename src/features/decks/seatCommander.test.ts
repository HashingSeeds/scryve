import { renderHook, waitFor } from "@testing-library/react-native"

import { readCardDetail } from "./cardDetailsCache"
import { printedPower, seatCommander, useSeatCommander } from "./seatCommander"

const mockAction = jest.fn()
jest.mock("convex/react", () => ({ useConvex: () => ({ action: mockAction }) }))
jest.mock("./useSeatDeckCards", () => ({
  useSeatDeckCards: () => [
    { name: "Krenko, Mob Boss", board: "commander", scryfallId: "krenko-id", quantity: 1 },
  ],
}))

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

it("defaults to the commander's printed power and keeps its full details cached", async () => {
  mockAction.mockResolvedValue({
    scryfallId: "krenko-id",
    oracleId: "krenko-oracle",
    name: "Krenko, Mob Boss",
    imageUrl: "https://cards.example/krenko.jpg",
    power: "3",
  })
  const { result } = renderHook(() => useSeatCommander({ ownerId: "owner", versionId: "v1" }))

  await waitFor(() => expect(result.current).toEqual({ name: "Krenko", power: 3 }))
  expect(mockAction).toHaveBeenCalledTimes(1)
  expect(readCardDetail("krenko-id")).toMatchObject({
    imageUrl: "https://cards.example/krenko.jpg",
    power: "3",
  })
})
