import { downloadRules, loadStoredRules, RULES_URL } from "./rulesSource"

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
    const rules = await downloadRules(store, fetcher)
    expect(fetcher).toHaveBeenCalledWith(RULES_URL)
    expect(rules.effectiveDate).toBe("September 25, 2026")
    expect(loadStoredRules(store)).toEqual({ url: RULES_URL, rules })
  })

  it("still returns the rules when the device can't cache them", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {})
    const store = {
      getString: () => undefined,
      set: () => {
        throw new Error("full")
      },
    }
    const rules = await downloadRules(store, async () => ({
      ok: true,
      status: 200,
      text: async () => SOURCE,
    }))
    expect(rules.effectiveDate).toBe("September 25, 2026")
  })

  it("keeps the previous copy when the download is not the rules", async () => {
    const store = memoryStore()
    await expect(
      downloadRules(store, async () => ({ ok: true, status: 200, text: async () => "<html />" })),
    ).rejects.toThrow()
    await expect(
      downloadRules(store, async () => ({ ok: false, status: 404, text: async () => SOURCE })),
    ).rejects.toThrow()
    expect(loadStoredRules(store)).toBeUndefined()
  })
})
