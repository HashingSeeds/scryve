import { clear as clearStorage, loadString, saveString } from "@/utils/storage"

import { MAGIC_DATASET_URL } from "../../../convex/lib/magicDataset"

const { fetchMagicCards } = jest.requireActual<typeof import("./useMagicCards")>("./useMagicCards")

let mockSaved: string | undefined
jest.mock("./magicCardsFile", () => ({
  savedMagicCards: () => (mockSaved === undefined ? undefined : async () => mockSaved),
  saveMagicCards: async (text: string) => {
    mockSaved = text
  },
}))

const META_KEY = "scryve.cards.mtg-dataset.v1"
const file = (name: string) =>
  JSON.stringify({ version: name, cards: [{ scryfallId: name, oracleId: name, name }] })
const names = async (fetcher: jest.Mock) =>
  (await fetchMagicCards(fetcher)).cards.map((card) => card.name)

beforeEach(() => {
  clearStorage()
  mockSaved = undefined
})

test("a saved file under a week old is read without asking the server", async () => {
  mockSaved = file("Sol Ring")
  saveString(META_KEY, JSON.stringify({ checkedAt: Date.now() - 6 * 86_400_000, etag: "a" }))
  const fetcher = jest.fn()
  expect(await names(fetcher)).toEqual(["Sol Ring"])
  expect(fetcher).not.toHaveBeenCalled()
})

test("an older saved file is revalidated with its ETag and kept on a 304", async () => {
  mockSaved = file("Sol Ring")
  saveString(META_KEY, JSON.stringify({ checkedAt: Date.now() - 8 * 86_400_000, etag: "a" }))
  const fetcher = jest.fn(async () => new Response(null, { status: 304 }))
  expect(await names(fetcher)).toEqual(["Sol Ring"])
  expect(fetcher).toHaveBeenCalledWith(MAGIC_DATASET_URL, { headers: { "If-None-Match": "a" } })
  expect(JSON.parse(loadString(META_KEY) ?? "{}").checkedAt).toBeGreaterThan(Date.now() - 1000)
})

test("a new file replaces the saved one with its ETag, and a failed download keeps the old one", async () => {
  mockSaved = file("Sol Ring")
  saveString(META_KEY, JSON.stringify({ checkedAt: 0, etag: "a" }))
  const fresh = jest.fn(async () => new Response(file("Arcane Signet"), { headers: { etag: "b" } }))
  expect(await names(fresh)).toEqual(["Arcane Signet"])
  expect(JSON.parse(loadString(META_KEY) ?? "{}").etag).toBe("b")

  saveString(META_KEY, JSON.stringify({ checkedAt: 0, etag: "b" }))
  const offline = jest.fn(async () => Promise.reject(new Error("offline")))
  expect(await names(offline)).toEqual(["Arcane Signet"])
})

test("without a saved file it downloads without an ETag and fails when it can't", async () => {
  saveString(META_KEY, JSON.stringify({ checkedAt: Date.now(), etag: "a" }))
  const missing = jest.fn(async () => new Response("Not found", { status: 404 }))
  await expect(fetchMagicCards(missing)).rejects.toThrow("404")
  expect(missing).toHaveBeenCalledWith(MAGIC_DATASET_URL, undefined)
})
