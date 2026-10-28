import riftHunt from "./fixtures/riftHunt.json"
import { normalizeRiftHuntCards } from "./riftbound"
import { makeConvexTest } from "../../../test/convexTest"
import { api, internal } from "../../_generated/api"

const cards = normalizeRiftHuntCards(riftHunt)

function card(name: string) {
  const found = cards.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`Missing ${name}`)
  return found
}

describe("RiftHunt normalizer", () => {
  it("groups variant printings under one card and skips tokens", () => {
    expect(cards.map(({ name }) => name).sort()).toEqual([
      "Altar to Unity",
      "Fury Rune",
      "Jinx, Loose Cannon",
      "Pouty Poro",
      "Svellsongur",
    ])
    expect(card("Pouty Poro")).toMatchObject({
      identityNamespace: "riftbound-card",
      cardId: "pouty-poro",
      category: "Unit",
      printings: [{ setCode: "OGN" }, { setCode: "OPP" }, { setCode: "UNL" }],
    })
  })

  it("leads with a printing that has a card image, and never shows TCGplayer photos", () => {
    const [first, promo] = card("Svellsongur").printings
    expect(first).toMatchObject({
      setCode: "SFD",
      rarity: "Epic",
      typeLabel: "Gear",
      costLabel: "3",
    })
    expect(first.faces[0].imageUrl).toMatch(/^https:\/\/cmsassets\.rgpub\.io\//)
    expect(promo).toMatchObject({ setCode: "JDG", faces: [{ imageUrl: undefined }] })
  })

  it("keeps line breaks and turns shortcodes into tokens", () => {
    expect(card("Svellsongur").printings[0].faces[0].text).toBe(
      "[Equip] {1}{calm} ({1}{calm}: Attach this to a unit you control.)\nAs this is attached to a unit, copy that unit's text to this Equipment's effect text for as long as this is attached to it.",
    )
    expect(card("Fury Rune").printings[0].faces[0].text).toBeUndefined()
  })
})

describe("RiftHunt sync", () => {
  beforeEach(() =>
    jest
      .spyOn(global, "fetch")
      .mockImplementation(async (_url, init) =>
        init?.method === "HEAD"
          ? new Response(null, { headers: { "Last-Modified": "Mon, 26 Oct 2026 00:00:00 GMT" } })
          : new Response(JSON.stringify(riftHunt)),
      ),
  )
  afterEach(() => {
    jest.restoreAllMocks()
    delete process.env.RIFTBOUND_CARDS
  })

  async function synced(t = makeConvexTest()) {
    jest.useFakeTimers()
    await t.action(internal.cardDatasetSync.sync, { game: "riftbound" })
    await t.finishAllScheduledFunctions(() => jest.runAllTimers())
    jest.useRealTimers()
    return t
  }

  it("files a pasted list by its headings, or by card type without them", async () => {
    const t = await synced()
    const actor = t.withIdentity({ subject: "riftbound-player" })
    const imported = async (list: string) =>
      (await actor.action(api.deckImports.resolvePasted, { game: "riftbound", list })).cards

    expect(await imported("Battlefields:\n1 Jinx, Loose Cannon\n3 Pouty Poro")).toMatchObject([
      { name: "Jinx, Loose Cannon", section: "battlefields" },
      { name: "Pouty Poro", section: "battlefields" },
    ])
    expect(
      await imported("1 Jinx, Loose Cannon\n1 Altar to Unity\n12 Fury Rune\n3 Pouty Poro"),
    ).toMatchObject([
      { name: "Jinx, Loose Cannon", section: "legend" },
      { name: "Altar to Unity", section: "battlefields" },
      { name: "Fury Rune", section: "runes" },
      { name: "Pouty Poro", section: "main" },
    ])
  })

  it("keeps only RIFTBOUND_CARDS when set, and drops cards already synced", async () => {
    const t = await synced()
    const names = async () =>
      (await t.run(async (ctx) => await ctx.db.query("gameCards").take(20)))
        .map(({ name }) => name)
        .sort()
    expect(await names()).toHaveLength(5)

    process.env.RIFTBOUND_CARDS = "Jinx, Loose Cannon; fury rune"
    await synced(t)
    expect(await names()).toEqual(["Fury Rune", "Jinx, Loose Cannon"])
  })
})
