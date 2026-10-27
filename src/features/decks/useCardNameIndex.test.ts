import { renderHook, waitFor } from "@testing-library/react-native"

import { clear as clearStorage, loadString } from "@/utils/storage"

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

test("caches a catalog with the server's fetch time so a stale copy is refreshed next time", async () => {
  const fetchedAt = Date.now() - 30 * 86_400_000
  mockAction.mockResolvedValue({ names: "Sol Ring", alternateNames: "", fetchedAt })
  const { result } = renderHook(() => useCardNameIndex("mtg", "device", true))
  await waitFor(() => expect(result.current?.names).toEqual(["Sol Ring"]))
  expect(JSON.parse(loadString("scryve.cards.names.v2") ?? "{}").fetchedAt).toBe(fetchedAt)
})
