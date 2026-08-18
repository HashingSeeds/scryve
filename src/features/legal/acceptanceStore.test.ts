import type { StringStorage } from "@/features/game/localPersistence"

import {
  AccountAcceptanceCache,
  DeviceAcceptanceStore,
  LEGAL_ACCEPTANCE_KEY,
  LEGAL_ACCOUNT_ACCEPTANCE_KEY,
  missingConsent,
} from "./acceptanceStore"

function memoryStorage(seed: Record<string, string> = {}): StringStorage {
  const values = new Map(Object.entries(seed))
  return {
    getString: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
    delete: (key) => void values.delete(key),
  }
}

const current = { terms: "2026-08-18", privacy: "2026-08-18" }

describe("DeviceAcceptanceStore", () => {
  it("reads nothing on a fresh device", () => {
    expect(new DeviceAcceptanceStore(memoryStorage()).read()).toEqual({})
  })

  it("round-trips accepted versions", () => {
    const storage = memoryStorage()
    const store = new DeviceAcceptanceStore(storage)
    store.write(current)
    expect(new DeviceAcceptanceStore(storage).read()).toEqual(current)
  })

  it("ignores malformed stored data", () => {
    expect(
      new DeviceAcceptanceStore(memoryStorage({ [LEGAL_ACCEPTANCE_KEY]: "not json" })).read(),
    ).toEqual({})
    expect(
      new DeviceAcceptanceStore(memoryStorage({ [LEGAL_ACCEPTANCE_KEY]: "null" })).read(),
    ).toEqual({})
  })

  it("ignores unknown documents and non-string versions", () => {
    const stored = JSON.stringify({ terms: "2026-08-18", privacy: 7, cookiePolicy: "x" })
    expect(
      new DeviceAcceptanceStore(memoryStorage({ [LEGAL_ACCEPTANCE_KEY]: stored })).read(),
    ).toEqual({ terms: "2026-08-18" })
  })
})

describe("missingConsent", () => {
  it("reports every document when nothing is accepted", () => {
    expect(missingConsent(current, {})).toEqual(["terms", "privacy"])
  })

  it("reports nothing when the current versions are accepted", () => {
    expect(missingConsent(current, current)).toEqual([])
  })

  it("reports a document whose accepted version is stale", () => {
    expect(missingConsent(current, { terms: "2026-01-01", privacy: "2026-08-18" })).toEqual([
      "terms",
    ])
  })
})

describe("AccountAcceptanceCache", () => {
  it("reads nothing for an unknown account", () => {
    expect(new AccountAcceptanceCache(memoryStorage()).read("nobody")).toEqual({})
  })

  it("keeps accounts separate", () => {
    const cache = new AccountAcceptanceCache(memoryStorage())
    cache.write("user-a", current)
    cache.write("user-b", { terms: "2026-01-01" })
    expect(cache.read("user-a")).toEqual(current)
    expect(cache.read("user-b")).toEqual({ terms: "2026-01-01" })
  })

  it("does not lose other accounts when one is written", () => {
    const storage = memoryStorage()
    new AccountAcceptanceCache(storage).write("user-a", current)
    new AccountAcceptanceCache(storage).write("user-b", current)
    expect(new AccountAcceptanceCache(storage).read("user-a")).toEqual(current)
  })

  it("ignores malformed stored data", () => {
    expect(
      new AccountAcceptanceCache(
        memoryStorage({ [LEGAL_ACCOUNT_ACCEPTANCE_KEY]: "not json" }),
      ).read("user-a"),
    ).toEqual({})
  })
})
