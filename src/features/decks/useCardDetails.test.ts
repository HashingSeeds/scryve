import { act, renderHook, waitFor } from "@testing-library/react-native"

import { saveCardDetails } from "./cardDetailsCache"
import { useCardDetails } from "./useCardDetails"

const mockLookup = jest.fn()
const mockConnectionState = { isWebSocketConnected: true }
jest.mock("convex/react", () => ({
  useAction: () => mockLookup,
  useConvexConnectionState: () => mockConnectionState,
}))

test("ignores a previous card's late response and reuses successful lookups", async () => {
  let finishFirst!: (details: { oracleText: string }) => void
  mockLookup.mockReturnValueOnce(
    new Promise((resolve) => {
      finishFirst = resolve
    }),
  )
  mockLookup.mockResolvedValue({ oracleText: "Second card text" })
  const first = { detailKey: "first", name: "First", scryfallId: "first" }
  const second = { detailKey: "second", name: "Second", scryfallId: "second" }
  const { result, rerender } = renderHook(
    ({ card }: { card: typeof first | undefined }) => useCardDetails(card),
    { initialProps: { card: first } },
  )
  rerender({ card: second })
  await waitFor(() => expect(result.current.details?.oracleText).toBe("Second card text"))
  await act(async () => finishFirst({ oracleText: "First card text" }))
  expect(result.current.details?.oracleText).toBe("Second card text")
  expect(result.current.detailsByKey.first).toBeUndefined()
  rerender({ card: undefined })
  rerender({ card: second })
  expect(result.current.details?.oracleText).toBe("Second card text")
  expect(mockLookup).toHaveBeenCalledTimes(2)
})

test("skips the live lookup while offline with an honest message", async () => {
  mockConnectionState.isWebSocketConnected = false
  try {
    mockLookup.mockClear()
    const { result } = renderHook(() =>
      useCardDetails({ detailKey: "offline", name: "Sol Ring", scryfallId: "sol-ring" }),
    )
    await waitFor(() =>
      expect(result.current.detailsError).toBe("You're offline. Showing saved card info."),
    )
    expect(result.current.details).toBeUndefined()
    expect(mockLookup).not.toHaveBeenCalled()
  } finally {
    mockConnectionState.isWebSocketConnected = true
  }
})

test("serves warmed details from storage without fetching", async () => {
  saveCardDetails({ "warmed-key": { oracleText: "Warmed text" } })
  mockLookup.mockClear()
  const { result } = renderHook(() =>
    useCardDetails({ detailKey: "warmed-key", name: "Warmed", scryfallId: "warmed-id" }),
  )
  await waitFor(() => expect(result.current.details?.oracleText).toBe("Warmed text"))
  expect(result.current.detailsError).toBeUndefined()
  expect(mockLookup).not.toHaveBeenCalled()
})

test("serves warmed details from storage without fetching", async () => {
  saveCardDetails({ "warmed-key": { oracleText: "Warmed text" } })
  mockLookup.mockClear()
  const { result } = renderHook(() =>
    useCardDetails({ detailKey: "warmed-key", name: "Warmed", scryfallId: "warmed-id" }),
  )
  await waitFor(() => expect(result.current.details?.oracleText).toBe("Warmed text"))
  expect(result.current.detailsError).toBeUndefined()
  expect(mockLookup).not.toHaveBeenCalled()
})
