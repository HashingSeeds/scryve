import { renderHook, waitFor } from "@testing-library/react-native"

import { clear as clearStorage } from "@/utils/storage"

import { useCardNameIndex } from "./useCardNameIndex"

const mockAction = jest.fn()
jest.mock("convex/react", () => ({ useConvex: () => ({ action: mockAction }) }))

beforeEach(() => {
  clearStorage()
  mockAction.mockReset()
})

test("an uncached catalog that fails to load leaves an empty index instead of loading forever", async () => {
  mockAction.mockRejectedValue(new Error("Scryfall unavailable"))
  const { result } = renderHook(() => useCardNameIndex("mtg", "device", true))
  await waitFor(() => expect(result.current?.names).toEqual([]))
})
