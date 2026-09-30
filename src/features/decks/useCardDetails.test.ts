import { act, renderHook, waitFor } from "@testing-library/react-native"
import { ConvexError } from "convex/values"

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

test("surfaces a rate-limit delay and reloads on retry", async () => {
  mockLookup.mockReset()
  mockLookup.mockRejectedValueOnce(
    new ConvexError({
      code: "scryfall_rate_limited",
      message: "Scryfall requests are paused. Try again shortly.",
      retryAfterMs: 3000,
    }),
  )
  mockLookup.mockResolvedValueOnce({ oracleText: "Recovered text" })
  const card = { detailKey: "retry", name: "Retry", scryfallId: "retry" }
  const { result } = renderHook(() => useCardDetails(card))
  await waitFor(() => expect(result.current.detailsError).toBeTruthy())
  expect(result.current.detailsRetryAfterMs).toBe(3000)
  await act(async () => result.current.retryDetails())
  await waitFor(() => expect(result.current.details?.oracleText).toBe("Recovered text"))
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

test("enriches old cached details once when commander rules are needed", async () => {
  saveCardDetails({ "legacy-commander": { oracleText: "Saved text" } })
  mockLookup.mockReset().mockResolvedValue({
    oracleText: "Current text",
    commanderEligibility: "eligible",
    commanderLegality: "legal",
    colorIdentity: "U",
    commanderRulesUpdatedAt: new Date().toISOString(),
  })
  const { result } = renderHook(() =>
    useCardDetails(
      {
        detailKey: "legacy-commander",
        name: "Sai",
        scryfallId: "sai",
      },
      true,
    ),
  )
  await waitFor(() => expect(result.current.details?.commanderEligibility).toBe("eligible"))
  expect(mockLookup).toHaveBeenCalledTimes(1)
})

test("keeps unknown commander rules unverified without a lookup loop", async () => {
  mockLookup.mockReset().mockResolvedValue({ oracleText: "Older backend response" })
  const { result } = renderHook(() =>
    useCardDetails(
      {
        detailKey: "unknown-commander",
        name: "Sai",
        scryfallId: "sai",
      },
      true,
    ),
  )
  await waitFor(() => expect(result.current.details?.oracleText).toBe("Older backend response"))
  expect(result.current.details?.commanderEligibility).toBeUndefined()
  expect(mockLookup).toHaveBeenCalledTimes(1)
})

test("retries enrichment when the focused card changed before its response arrived", async () => {
  saveCardDetails({ "cancelled-commander": { oracleText: "Saved text" } })
  let finishFirst!: (details: { oracleText: string }) => void
  mockLookup.mockReset().mockReturnValueOnce(
    new Promise((resolve) => {
      finishFirst = resolve
    }),
  )
  mockLookup.mockResolvedValue({
    commanderEligibility: "eligible",
    commanderLegality: "legal",
    colorIdentity: "U",
    commanderRulesUpdatedAt: new Date().toISOString(),
  })
  const card = { detailKey: "cancelled-commander", name: "Sai", scryfallId: "sai" }
  const { result, rerender } = renderHook(
    ({ focused }: { focused: typeof card | undefined }) => useCardDetails(focused, true),
    { initialProps: { focused: card } },
  )
  rerender({ focused: undefined })
  await act(async () => finishFirst({ oracleText: "Cancelled response" }))
  rerender({ focused: card })
  await waitFor(() => expect(result.current.details?.commanderEligibility).toBe("eligible"))
  expect(mockLookup).toHaveBeenCalledTimes(2)
})

test("shows legacy guest cached details offline without inventing commander eligibility", async () => {
  saveCardDetails({ "mtg:main:legacy-sai": { oracleText: "Saved Sai text" } })
  mockConnectionState.isWebSocketConnected = false
  mockLookup.mockClear()
  try {
    const { result } = renderHook(() =>
      useCardDetails(
        {
          detailKey: "legacy-sai",
          legacyDetailKey: "mtg:main:legacy-sai",
          name: "Sai",
          scryfallId: "legacy-sai",
        },
        true,
      ),
    )
    await waitFor(() => expect(result.current.details?.oracleText).toBe("Saved Sai text"))
    expect(result.current.details?.commanderEligibility).toBeUndefined()
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
