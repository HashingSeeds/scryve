import { renderHook, waitFor } from "@testing-library/react-native"

import { saveListSnapshot } from "@/features/stats/listSnapshots"
import { storage } from "@/utils/storage"

import { DeckVersionCacheRepository } from "./deckVersionsCache"
import { keepSharedDeck } from "./sharedDecks"
import { useSeatDeckCards, type SeatDeck } from "./useSeatDeckCards"

const URL = "https://deployment.example"
const mockQuery = jest.fn()
jest.mock("convex/react", () => ({
  useConvex: () => ({ url: "https://deployment.example", query: mockQuery }),
}))

const sol = { name: "Sol Ring", quantity: 1 }
const krenko = { name: "Krenko, Mob Boss", board: "commander" as const, quantity: 1 }

beforeEach(() => {
  storage.clearAll()
  mockQuery.mockReset()
})

it("reads a deck from the network once per session and from the cache after that", async () => {
  mockQuery.mockResolvedValue({ revision: 1, cards: [sol] })
  const deck = { ownerId: "owner", versionId: "v1" }
  const { result, rerender } = renderHook(
    ({ seat }: { seat?: SeatDeck }) => useSeatDeckCards(seat),
    { initialProps: { seat: deck } },
  )
  await waitFor(() => expect(result.current).toEqual([sol]))

  new DeckVersionCacheRepository("owner", undefined, URL).saveCards("v1", 2, [sol, krenko])
  rerender({ seat: undefined })
  rerender({ seat: deck })

  expect(result.current).toEqual([sol, krenko])
  expect(mockQuery).toHaveBeenCalledTimes(1)
})

it("tries the network again after a failed read", async () => {
  mockQuery.mockRejectedValueOnce(new Error("offline"))
  mockQuery.mockResolvedValue({ revision: 1, cards: [sol] })
  const deck = { ownerId: "owner", versionId: "v2" }
  const { result, rerender } = renderHook(
    ({ seat }: { seat?: SeatDeck }) => useSeatDeckCards(seat),
    { initialProps: { seat: deck } },
  )
  await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1))
  rerender({ seat: undefined })
  rerender({ seat: deck })

  await waitFor(() => expect(result.current).toEqual([sol]))
  expect(mockQuery).toHaveBeenCalledTimes(2)
})

it("reads a device deck from the list pinned when the game started", () => {
  saveListSnapshot("local-deck", "fp-1", [krenko, sol])
  const { result } = renderHook(() =>
    useSeatDeckCards({ deckKey: "local-deck", fingerprint: "fp-1" }),
  )

  expect(result.current).toEqual([krenko, sol])
  expect(mockQuery).not.toHaveBeenCalled()
})

it("reads a shared deck from the copy kept on this device, without asking the server", () => {
  keepSharedDeck(
    {
      deckKey: "shared-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fingerprint: `v1:${"c".repeat(64)}`,
      name: "Borrowed",
      game: "mtg",
      format: "commander",
      cards: [sol],
    },
    "t".repeat(43),
  )
  const { result } = renderHook(() =>
    useSeatDeckCards({ sharedDeckKey: "shared-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
  )
  expect(result.current).toEqual([sol])
  expect(mockQuery).not.toHaveBeenCalled()
})
