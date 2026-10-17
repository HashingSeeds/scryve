import { GAME_RULES } from "./gameRules"
import { downloadRules, loadStoredRules, prefetchRules } from "./rulesSource"

const MAGIC = GAME_RULES.mtg

const SOURCE = [
  "These rules are effective as of September 25, 2026.",
  "Credits",
  "1. Game Concepts",
  "100. General",
  "100.1. These Magic rules apply to any Magic game.",
  "Glossary",
  "Credits",
  "Published by Wizards of the Coast LLC.",
].join("\n")

function memoryStore() {
  const values = new Map<string, string>()
  return {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => void values.set(key, value),
  }
}

describe("downloadRules", () => {
  it("stores the official text with its URL so later opens skip the download", async () => {
    const store = memoryStore()
    const fetcher = jest.fn(async () => ({ ok: true, status: 200, text: async () => SOURCE }))
    const rules = await downloadRules(MAGIC, store, fetcher)
    expect(fetcher).toHaveBeenCalledWith(MAGIC.url)
    expect(rules.effectiveDate).toBe("September 25, 2026")
    expect(loadStoredRules(MAGIC, store)).toEqual({ url: MAGIC.url, rules })
  })

  it("still returns the rules when the device can't cache them", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {})
    const store = {
      getString: () => undefined,
      set: () => {
        throw new Error("full")
      },
    }
    const rules = await downloadRules(MAGIC, store, async () => ({
      ok: true,
      status: 200,
      text: async () => SOURCE,
    }))
    expect(rules.effectiveDate).toBe("September 25, 2026")
  })

  it("keeps the previous copy when the download is not the rules", async () => {
    const store = memoryStore()
    await expect(
      downloadRules(MAGIC, store, async () => ({
        ok: true,
        status: 200,
        text: async () => "<html />",
      })),
    ).rejects.toThrow()
    await expect(
      downloadRules(MAGIC, store, async () => ({
        ok: false,
        status: 404,
        text: async () => SOURCE,
      })),
    ).rejects.toThrow()
    expect(loadStoredRules(MAGIC, store)).toBeUndefined()
  })
})

it("prefetchRules downloads once, shares the download with Rules, and skips a current copy", async () => {
  const store = memoryStore()
  const fetcher = jest.fn(async () => ({ ok: true, status: 200, text: async () => SOURCE }))
  prefetchRules(MAGIC, store, fetcher)
  prefetchRules(MAGIC, store, fetcher)
  const rules = await downloadRules(MAGIC, store, fetcher)
  prefetchRules(MAGIC, store, fetcher)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(loadStoredRules(MAGIC, store)?.rules).toBe(rules)
})

it("loads Magic rules cached under the keys earlier builds wrote", () => {
  const store = memoryStore()
  store.set("scryve.rules.url.v1", MAGIC.url)
  store.set("scryve.rules.text.v1", SOURCE)
  expect(loadStoredRules(MAGIC, store)?.rules.effectiveDate).toBe("September 25, 2026")
})
