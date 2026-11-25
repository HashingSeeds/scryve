import { renderHook } from "@testing-library/react-native"

import { catalogDb } from "@/storage/catalogDb"

import { syncLocalCards, useLocalCardSearch } from "./localCards"
import { encodeLocalCards } from "../../../convex/lib/localCards"

const DAY = 86_400_000
const file = encodeLocalCards("v1", [
  { cardId: "bolt", name: "Lightning Bolt", rank: 5, oracleText: "Deal 3 damage." },
  { cardId: "arrows", name: "100,000 Arrows", oracleText: "Deal damage." },
  { cardId: "vault", name: "Lim-Dûl's Vault", oracleText: "Look at the top five cards." },
])

beforeEach(() => catalogDb.clearAll())

it("stores the card file, then checks it weekly with its etag", async () => {
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(new Response(file, { headers: { etag: '"one"' } }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }))

  await expect(syncLocalCards("mtg", { fetcher, now: 0 })).resolves.toBe(true)
  expect(catalogDb.searchLocalCards("mtg", "lightning", 3)).toEqual([
    expect.objectContaining({ cardId: "bolt", oracleText: "Deal 3 damage." }),
  ])
  expect(catalogDb.searchLocalCards("mtg", "lim duls", 3)).toEqual([
    expect.objectContaining({ name: "Lim-Dûl's Vault" }),
  ])

  await expect(syncLocalCards("mtg", { fetcher, now: DAY })).resolves.toBe(false)
  expect(fetcher).toHaveBeenCalledTimes(1)

  await expect(syncLocalCards("mtg", { fetcher, now: 8 * DAY })).resolves.toBe(false)
  expect(fetcher).toHaveBeenLastCalledWith(expect.any(String), {
    headers: { "If-None-Match": '"one"' },
  })
  expect(catalogDb.searchLocalCards("mtg", "bolt", 3)).toHaveLength(1)
})

it("searches cards for names that start with a number, but not for rule numbers", async () => {
  const fetcher = jest.fn().mockResolvedValue(new Response(file))
  await syncLocalCards("mtg", { fetcher, now: Date.now() })
  const names = (query: string) =>
    renderHook(() => useLocalCardSearch("mtg", query)).result.current.map((card) => card.name)

  expect(names("100,000")).toEqual(["100,000 Arrows"])
  expect(names("701.3")).toEqual([])
  expect(names("rule 100")).toEqual([])
})

it("accepts a card file with only its header", async () => {
  const fetcher = jest.fn().mockResolvedValue(new Response(encodeLocalCards("v2", [])))
  await expect(syncLocalCards("mtg", { fetcher, now: 0 })).resolves.toBe(true)
  expect(catalogDb.getMeta("localCards:mtg:version")).toBe("v2")
})
