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

it("rechecks Flesh and Blood rules once per launch, keeping the stored copy on 304", async () => {
  const FAB = GAME_RULES.fab
  const fabSource = (rule: string) =>
    [
      "1 Game Concepts",
      "1.0 General",
      `1.0.1 ${rule}`,
      "1 Glossary",
      "1.-1.3 Ability",
      "Text.",
    ].join("\n")
  const headers = new Headers({ "ETag": '"v1"', "Last-Modified": "Tue, 29 Sep 2026 08:42:59 GMT" })
  const firstLaunch = memoryStore()
  await downloadRules(FAB, firstLaunch, async () => ({
    ok: true,
    status: 200,
    headers,
    text: async () => fabSource("First."),
  }))

  const relaunch = memoryStore()
  for (const key of ["url", "text", "etag", "modified"]) {
    const value = firstLaunch.getString(`scryve.rules.fab.${key}.v1`)
    if (value) relaunch.set(`scryve.rules.fab.${key}.v1`, value)
  }
  const notModified = jest.fn(async () => ({ ok: false, status: 304, text: async () => "" }))
  prefetchRules(FAB, relaunch, notModified)
  const rules = await downloadRules(FAB, relaunch, notModified)
  prefetchRules(FAB, relaunch, notModified)
  expect(notModified).toHaveBeenCalledTimes(1)
  expect(notModified).toHaveBeenCalledWith(FAB.url, {
    headers: { "If-None-Match": '"v1"', "If-Modified-Since": "Tue, 29 Sep 2026 08:42:59 GMT" },
  })
  expect(rules.chapters[0].sections[0].rules[0].text).toBe("First.")

  const updated = memoryStore()
  for (const key of ["url", "text", "etag"]) {
    const value = firstLaunch.getString(`scryve.rules.fab.${key}.v1`)
    if (value) updated.set(`scryve.rules.fab.${key}.v1`, value)
  }
  await downloadRules(FAB, updated, async () => ({
    ok: true,
    status: 200,
    text: async () => fabSource("Second."),
  }))
  expect(loadStoredRules(FAB, updated)?.rules.chapters[0].sections[0].rules[0].text).toBe("Second.")
  expect(loadStoredRules(MAGIC, updated)).toBeUndefined()
})
