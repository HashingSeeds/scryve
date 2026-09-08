import { act, renderHook, waitFor } from "@testing-library/react-native"

import { useCardDetails } from "./useCardDetails"

const mockLookup = jest.fn()
jest.mock("convex/react", () => ({ useAction: () => mockLookup }))

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
