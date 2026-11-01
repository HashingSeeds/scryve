import { makeConvexTest, signedIn } from "../test/convexTest"
import { api } from "./_generated/api"

const card = {
  oracleId: "11111111-1111-1111-1111-111111111111",
  scryfallId: "22222222-2222-2222-2222-222222222222",
  name: "Sol Ring",
  quantity: 1,
  section: "main",
  board: "main" as const,
}

describe("deck share links", () => {
  it("lets anyone read the deck its owner brings, without its ids", async () => {
    const t = makeConvexTest()
    const owner = await signedIn(t, "share-owner", "Share Owner")
    const deckId = await owner.mutation(api.decks.importResolved, {
      name: "Shared",
      format: "commander",
      cards: [card],
    })
    const first = (await owner.query(api.decks.detail, { deckId })).versions[0]._id
    const second = await owner.mutation(api.decks.createVersion, { deckId, name: "Spicy" })
    await owner.mutation(api.decks.saveVersion, {
      deckId,
      versionId: second,
      cards: [
        {
          ...card,
          oracleId: "33333333-3333-3333-3333-333333333333",
          scryfallId: "44444444-4444-4444-4444-444444444444",
          name: "Arcane Signet",
        },
      ],
    })
    await owner.mutation(api.decks.setBringingVersion, { deckId, versionId: first })

    const { token } = await owner.mutation(api.decks.share, { deckId })
    await expect(owner.mutation(api.decks.share, { deckId })).resolves.toEqual({ token })

    const shared = await t.query(api.decks.shared, { token })
    expect(shared).toMatchObject({ name: "Shared", game: "mtg", format: "commander" })
    expect(shared?.cards).toEqual([expect.objectContaining({ name: "Sol Ring", quantity: 1 })])
    expect(shared?.cards[0]).not.toHaveProperty("_id")
    expect(shared?.cards[0]).not.toHaveProperty("deckVersionId")
  })

  it("only lets the owner share a deck", async () => {
    const t = makeConvexTest()
    const owner = await signedIn(t, "share-owner-2", "Share Owner")
    const other = await signedIn(t, "share-other", "Someone Else")
    const deckId = await owner.mutation(api.decks.importResolved, {
      name: "Mine",
      format: "commander",
      cards: [card],
    })
    await expect(other.mutation(api.decks.share, { deckId })).rejects.toMatchObject({
      data: { code: "deck_not_found" },
    })
  })

  it("stops sharing, and sharing again makes a new link", async () => {
    const t = makeConvexTest()
    const owner = await signedIn(t, "share-owner-4", "Share Owner")
    const deckId = await owner.mutation(api.decks.importResolved, {
      name: "Revoked",
      format: "commander",
      cards: [card],
    })
    const { token } = await owner.mutation(api.decks.share, { deckId })
    expect((await owner.query(api.decks.detail, { deckId })).shared).toBe(true)
    await owner.mutation(api.decks.unshare, { deckId })
    await expect(t.query(api.decks.shared, { token })).resolves.toBeNull()
    expect((await owner.query(api.decks.detail, { deckId })).shared).toBe(false)
    const again = await owner.mutation(api.decks.share, { deckId })
    expect(again.token).not.toBe(token)
  })

  it("stops working once the deck is deleted", async () => {
    const t = makeConvexTest()
    const owner = await signedIn(t, "share-owner-3", "Share Owner")
    const deckId = await owner.mutation(api.decks.importResolved, {
      name: "Gone",
      format: "commander",
      cards: [card],
    })
    const { token } = await owner.mutation(api.decks.share, { deckId })
    await owner.mutation(api.decks.archive, { deckId })
    await expect(t.query(api.decks.shared, { token })).resolves.toBeNull()
    await expect(t.query(api.decks.shared, { token: "x".repeat(43) })).resolves.toBeNull()
  })
})
