import { storage } from "@/utils/storage"

import {
  affiliateLinksEnabled,
  cardKingdomCardUrl,
  setAffiliateLinksEnabled,
  tcgplayerCardUrl,
  tcgplayerMassEntryUrl,
} from "./storeLinks"

describe("store links", () => {
  const originalTcg = process.env.EXPO_PUBLIC_TCGPLAYER_AFFILIATE_URL
  const originalCk = process.env.EXPO_PUBLIC_CARDKINGDOM_PARTNER

  beforeEach(() => {
    storage.clearAll()
    delete process.env.EXPO_PUBLIC_TCGPLAYER_AFFILIATE_URL
    delete process.env.EXPO_PUBLIC_CARDKINGDOM_PARTNER
  })

  afterAll(() => {
    if (originalTcg === undefined) delete process.env.EXPO_PUBLIC_TCGPLAYER_AFFILIATE_URL
    else process.env.EXPO_PUBLIC_TCGPLAYER_AFFILIATE_URL = originalTcg
    if (originalCk === undefined) delete process.env.EXPO_PUBLIC_CARDKINGDOM_PARTNER
    else process.env.EXPO_PUBLIC_CARDKINGDOM_PARTNER = originalCk
  })

  it("builds plain links when no affiliate env vars are configured", () => {
    expect(tcgplayerCardUrl({ name: "Sol Ring", tcgplayerId: 12345 })).toBe(
      "https://www.tcgplayer.com/product/12345",
    )
    expect(tcgplayerCardUrl({ name: "Sol Ring", setCode: "cmm" })).toContain(
      "https://www.tcgplayer.com/search/magic/product?",
    )
    expect(cardKingdomCardUrl({ name: "Sol Ring" })).toContain(
      "https://www.cardkingdom.com/catalog/search",
    )
    expect(cardKingdomCardUrl({ name: "Sol Ring" }, { buylist: true })).toContain(
      "https://www.cardkingdom.com/purchasing/mtg_singles",
    )
  })

  it("applies affiliate tags when configured and strips them when opted out", () => {
    process.env.EXPO_PUBLIC_TCGPLAYER_AFFILIATE_URL =
      "https://partner.tcgplayer.com/c/1234/5678?u={url}"
    process.env.EXPO_PUBLIC_CARDKINGDOM_PARTNER = "scryve"

    expect(affiliateLinksEnabled()).toBe(true)
    expect(tcgplayerCardUrl({ name: "Sol Ring", tcgplayerId: 42 })).toBe(
      `https://partner.tcgplayer.com/c/1234/5678?u=${encodeURIComponent("https://www.tcgplayer.com/product/42")}`,
    )
    expect(cardKingdomCardUrl({ name: "Sol Ring" })).toContain("&partner=scryve")

    setAffiliateLinksEnabled(false)
    expect(affiliateLinksEnabled()).toBe(false)
    expect(tcgplayerCardUrl({ name: "Sol Ring", tcgplayerId: 42 })).toBe(
      "https://www.tcgplayer.com/product/42",
    )
    expect(cardKingdomCardUrl({ name: "Sol Ring" })).not.toContain("partner=")
  })

  it("builds TCGplayer mass entry links for missing cards", () => {
    const url = tcgplayerMassEntryUrl([
      { name: "Sol Ring", setCode: "cmm", quantity: 1 },
      { name: "Lightning Bolt", quantity: 4 },
    ])
    expect(url).toBe(
      `https://www.tcgplayer.com/massentry?productline=Magic&c=${encodeURIComponent(
        "1 Sol Ring [CMM]||4 Lightning Bolt",
      )}`,
    )
  })
})
