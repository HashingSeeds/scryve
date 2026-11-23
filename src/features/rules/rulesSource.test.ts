import { renderHook, waitFor } from "@testing-library/react-native"

import { storage } from "@/utils/storage"

import * as comprehensiveRules from "./comprehensiveRules"
import { GAME_RULES } from "./gameRules"
import { downloadRules, loadStoredRules, prefetchRules, useComprehensiveRules } from "./rulesSource"

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

describe("prefetchRules", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("waits for the board to settle, then downloads once and shares it with Rules", async () => {
    const store = memoryStore()
    const fetcher = jest.fn(async () => ({ ok: true, status: 200, text: async () => SOURCE }))
    prefetchRules(MAGIC, store, fetcher)
    prefetchRules(MAGIC, store, fetcher)
    expect(fetcher).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1000)
    const download = downloadRules(MAGIC, store, fetcher)
    await jest.runAllTimersAsync()
    const rules = await download
    prefetchRules(MAGIC, store, fetcher)
    await jest.runAllTimersAsync()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(loadStoredRules(MAGIC, store)?.rules).toBe(rules)
  })

  it("parses a stored copy after the board settles, so Rules reads it without parsing", async () => {
    const store = memoryStore()
    store.set("scryve.rules.url.v1", MAGIC.url)
    store.set("scryve.rules.text.v1", SOURCE)
    const source = { ...MAGIC, parse: jest.fn(MAGIC.parse) }
    const fetcher = jest.fn(async () => ({ ok: true, status: 200, text: async () => SOURCE }))
    prefetchRules(source, store, fetcher)
    expect(source.parse).not.toHaveBeenCalled()
    await jest.runAllTimersAsync()
    expect(loadStoredRules(source, store)?.rules.effectiveDate).toBe("September 25, 2026")
    expect(source.parse).toHaveBeenCalledTimes(1)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("indexes a stored Flesh and Blood copy when the recheck fails offline", async () => {
    const store = memoryStore()
    store.set("scryve.rules.fab.url.v1", GAME_RULES.fab.url)
    store.set(
      "scryve.rules.fab.text.v1",
      [
        "1 Game Concepts",
        "1.0 General",
        "1.0.1 First.",
        "1 Glossary",
        "1.-1.3 Ability",
        "Text.",
      ].join("\n"),
    )
    const prepare = jest.spyOn(comprehensiveRules, "prepareSearchIndex")
    prefetchRules(GAME_RULES.fab, store, async () => {
      throw new Error("offline")
    })
    await jest.runAllTimersAsync()
    expect(prepare).toHaveBeenCalledWith(loadStoredRules(GAME_RULES.fab, store)?.rules)
    prepare.mockRestore()
  })
})

it("shows rules a prefetch stored after the screen first read the cache", () => {
  const stored = new Map([
    ["scryve.rules.url.v1", MAGIC.url],
    ["scryve.rules.text.v1", SOURCE],
  ])
  let reads = 0
  jest
    .spyOn(storage, "getString")
    .mockImplementation((key) => (reads++ === 0 ? undefined : stored.get(key)))
  const fetcher = jest.spyOn(global, "fetch")
  const { result } = renderHook(() => useComprehensiveRules(MAGIC))
  expect(result.current.rules?.effectiveDate).toBe("September 25, 2026")
  expect(fetcher).not.toHaveBeenCalled()
  jest.restoreAllMocks()
})

it("Rules downloads again when the stored copy has a URL but no usable text", async () => {
  const source = { ...MAGIC, cacheKey: "scryve.rules.unusable" }
  const stored = new Map([
    ["scryve.rules.unusable.url.v1", MAGIC.url],
    ["scryve.rules.unusable.text.v1", "<html />"],
  ])
  jest.spyOn(storage, "getString").mockImplementation((key) => stored.get(key))
  jest.spyOn(storage, "set").mockImplementation((key, value) => {
    if (typeof value === "string") stored.set(key, value)
  })
  const fetcher = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response(SOURCE, { status: 200 }))
  const { result } = renderHook(() => useComprehensiveRules(source))
  await waitFor(() => expect(result.current.rules?.effectiveDate).toBe("September 25, 2026"))
  expect(fetcher).toHaveBeenCalledTimes(1)
  jest.restoreAllMocks()
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
  jest.useFakeTimers()
  prefetchRules(FAB, relaunch, notModified)
  await jest.advanceTimersByTimeAsync(1000)
  const download = downloadRules(FAB, relaunch, notModified)
  prefetchRules(FAB, relaunch, notModified)
  await jest.runAllTimersAsync()
  const rules = await download
  jest.useRealTimers()
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
