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

test("upgrades cached multi-face details once and reuses them offline", async () => {
  const card = { detailKey: "legacy-faces", name: "Front // Back", scryfallId: "faces" }
  saveCardDetails({ [card.detailKey]: { oracleText: "Combined saved rules" } })
  const faceDetails = JSON.stringify([{ name: "Front" }, { name: "Back" }])
  mockLookup.mockReset().mockResolvedValue({ oracleText: "Combined rules", faceDetails })
  const view = renderHook(() => useCardDetails(card))
  await waitFor(() => expect(view.result.current.details?.faceDetails).toBe(faceDetails))
  expect(mockLookup).toHaveBeenCalledTimes(1)
  view.unmount()
  mockConnectionState.isWebSocketConnected = false
  mockLookup.mockClear()
  try {
    const offline = renderHook(() => useCardDetails(card))
    expect(offline.result.current.details?.faceDetails).toBe(faceDetails)
    expect(mockLookup).not.toHaveBeenCalled()
  } finally {
    mockConnectionState.isWebSocketConnected = true
  }
})

test("keeps legacy multi-face info usable without repeatedly fetching an older backend", async () => {
  const card = { detailKey: "old-backend-faces", name: "Front // Back", scryfallId: "old-faces" }
  saveCardDetails({ [card.detailKey]: { oracleText: "Saved rules" } })
  mockLookup.mockReset().mockResolvedValue({ oracleText: "Saved rules" })
  const { result } = renderHook(() => useCardDetails(card))
  await waitFor(() =>
    expect(result.current.detailsError).toBe("Could not load both faces. Showing saved card info."),
  )
  expect(result.current.details?.oracleText).toBe("Saved rules")
  expect(mockLookup).toHaveBeenCalledTimes(1)
})

test("refetches Lorcana text cached with printed line wraps once online, and keeps it offline", async () => {
  const wrapped = "Shift 3 ⬡ (You may pay 3 ⬡ to play this on top of\none of your characters.)"
  const unwrapped = "Shift 3 ⬡ (You may pay 3 ⬡ to play this on top of one of your characters.)"
  const card = {
    detailKey: "lorcana:negaduck:",
    name: "Negaduck",
    game: "lorcana",
    catalogCardId: "negaduck",
  }
  saveCardDetails({ [card.detailKey]: { oracleText: wrapped } })
  mockLookup.mockReset()
  mockConnectionState.isWebSocketConnected = false
  try {
    const { result } = renderHook(() => useCardDetails(card))
    await waitFor(() => expect(result.current.details?.oracleText).toBe(wrapped))
    expect(mockLookup).not.toHaveBeenCalled()
  } finally {
    mockConnectionState.isWebSocketConnected = true
  }
  mockLookup.mockResolvedValue({ text: wrapped })
  const stillStale = renderHook(() => useCardDetails(card))
  await waitFor(() => expect(mockLookup).toHaveBeenCalledTimes(1))
  expect(stillStale.result.current.details?.oracleText).toBe(wrapped)
  stillStale.unmount()
  mockLookup.mockResolvedValue({ text: unwrapped })
  const { result } = renderHook(() => useCardDetails(card))
  await waitFor(() => expect(result.current.details?.oracleText).toBe(unwrapped))
  expect(mockLookup).toHaveBeenCalledTimes(2)
})

test.each([
  ["mtg", { scryfallId: "0000579f-7b35-4ed3-b44c-db2a538066fe" }],
  ["pokemon", { name: "Pikachu", originalReference: "Pikachu BS 58" }],
  ["ygo", undefined],
])("routes a %s card without a catalog id to its provider's lookup", async (game, expected) => {
  mockLookup.mockReset().mockResolvedValue({ oracleText: "Looked up", text: "Looked up" })
  const card = {
    detailKey: `${game}:routing`,
    name: "Pikachu",
    game,
    printingId: "0000579f-7b35-4ed3-b44c-db2a538066fe",
    originalReference: "Pikachu BS 58",
  }
  const { result } = renderHook(() => useCardDetails(card))
  if (expected) {
    await waitFor(() => expect(result.current.details?.oracleText).toBe("Looked up"))
    expect(mockLookup).toHaveBeenCalledWith(expect.objectContaining(expected))
  } else {
    await waitFor(() => expect(result.current.detailsError).toBeTruthy())
    expect(mockLookup).not.toHaveBeenCalled()
  }
})
