import { makeConvexTest, signedIn, type ConvexTestHarness } from "../test/convexTest"
import { api, internal } from "./_generated/api"

let serial = 0
function card(name: string, colorIdentity: string, section = "main") {
  serial += 1
  const id = serial.toString(16).padStart(12, "0")
  return {
    reference: { scryfallId: `22222222-2222-2222-2222-${id}`, colorIdentity, name },
    input: {
      oracleId: `11111111-1111-1111-1111-${id}`,
      scryfallId: `22222222-2222-2222-2222-${id}`,
      name,
      quantity: 1,
      section,
    },
  }
}

async function cache(t: ConvexTestHarness, ...cards: ReturnType<typeof card>[]) {
  await t.run(async (ctx) => {
    for (const { reference } of cards)
      await ctx.db.insert("cardReferences", {
        ...reference,
        oracleId: `11111111-1111-1111-1111-${reference.scryfallId.slice(-12)}`,
        updatedAt: 0,
      })
  })
}

async function listed(owner: Awaited<ReturnType<typeof signedIn>>, deckId: string) {
  const { decks } = await owner.query(api.decks.listMine)
  const deck = decks.find(({ _id }) => _id === deckId)
  return { identityColors: deck?.identityColors, commanderNames: deck?.commanderNames }
}

describe("deck identity", () => {
  it("takes a Commander deck's colors from its commanders and lists their names", async () => {
    const t = makeConvexTest()
    const owner = await signedIn(t, "identity-commander", "Commander Owner")
    const yuriko = card("Yuriko, the Tiger's Shadow", "UB", "commander")
    const kraum = card("Kraum, Ludevic's Opus", "UR", "commander")
    const bolt = card("Lightning Bolt", "R")
    const forest = card("Forest", "G")
    await cache(t, yuriko, kraum, bolt, forest)
    const deckId = await owner.mutation(api.decks.importResolved, {
      name: "Ninjas",
      format: "commander",
      cards: [kraum.input, yuriko.input, bolt.input, forest.input],
    })

    expect(await listed(owner, deckId)).toEqual({
      identityColors: ["U", "B", "R"],
      commanderNames: ["Kraum, Ludevic's Opus", "Yuriko, the Tiger's Shadow"],
    })
  })

  it("leaves a commander's colors unset until the catalog knows them", async () => {
    const t = makeConvexTest()
    const owner = await signedIn(t, "identity-unknown", "Unknown Owner")
    const uncached = card("Uncached Commander", "W", "commander")
    const deckId = await owner.mutation(api.decks.importResolved, {
      name: "Unknown",
      format: "commander",
      cards: [uncached.input],
    })

    expect(await listed(owner, deckId)).toEqual({
      identityColors: undefined,
      commanderNames: ["Uncached Commander"],
    })
  })

  it("unions the main deck's colors outside Commander, leaving the sideboard out", async () => {
    const t = makeConvexTest()
    const owner = await signedIn(t, "identity-union", "Union Owner")
    const swords = card("Swords to Plowshares", "W")
    const growth = card("Giant Growth", "G")
    const relic = card("Relic of Progenitus", "")
    const duress = card("Duress", "B", "sideboard")
    await cache(t, swords, growth, relic, duress)
    const deckId = await owner.mutation(api.decks.importResolved, {
      name: "Selesnya",
      format: "modern",
      cards: [growth.input, swords.input, relic.input, duress.input],
    })

    expect(await listed(owner, deckId)).toEqual({
      identityColors: ["W", "G"],
      commanderNames: undefined,
    })
  })

  it("follows card edits and the version the player brings", async () => {
    const t = makeConvexTest()
    const owner = await signedIn(t, "identity-versions", "Version Owner")
    const atraxa = card("Atraxa, Praetors' Voice", "WUBG", "commander")
    const krenko = card("Krenko, Mob Boss", "R", "commander")
    const omnath = card("Omnath, Locus of Mana", "G", "commander")
    await cache(t, atraxa, krenko, omnath)
    const deckId = await owner.mutation(api.decks.importResolved, {
      name: "Shifting",
      format: "commander",
      cards: [atraxa.input],
    })
    const first = (await owner.query(api.decks.detail, { deckId })).versions[0]._id
    const second = await owner.mutation(api.decks.createVersion, {
      deckId,
      fromVersionId: first,
      name: "Goblins",
    })
    await owner.mutation(api.decks.saveVersion, {
      deckId,
      versionId: second,
      cards: [krenko.input],
    })
    expect(await listed(owner, deckId)).toEqual({
      identityColors: ["R"],
      commanderNames: ["Krenko, Mob Boss"],
    })

    await owner.mutation(api.decks.setBringingVersion, { deckId, versionId: first })
    expect((await listed(owner, deckId)).identityColors).toEqual(["W", "U", "B", "G"])

    await owner.mutation(api.decks.syncVersionWrite, {
      deckId,
      versionId: first,
      operationId: "33333333-3333-4333-8333-333333333333",
      expectedRevision: 1,
      cards: [omnath.input],
    })
    expect(await listed(owner, deckId)).toEqual({
      identityColors: ["G"],
      commanderNames: ["Omnath, Locus of Mana"],
    })

    await owner.mutation(api.decks.deleteVersion, { versionId: first })
    expect((await listed(owner, deckId)).identityColors).toEqual(["R"])
  })

  it("backfills existing decks in resumable batches and patches nothing on a rerun", async () => {
    const t = makeConvexTest()
    const owner = await signedIn(t, "identity-backfill", "Backfill Owner")
    const ghave = card("Ghave, Guru of Spores", "WBG", "commander")
    const bolt = card("Lightning Bolt", "R")
    await cache(t, ghave, bolt)
    const commanderDeck = await owner.mutation(api.decks.importResolved, {
      name: "Spores",
      format: "commander",
      cards: [ghave.input],
    })
    const burnDeck = await owner.mutation(api.decks.importResolved, {
      name: "Burn",
      format: "modern",
      cards: [bolt.input],
    })
    await t.run(async (ctx) => {
      for (const deckId of [commanderDeck, burnDeck])
        await ctx.db.patch(deckId, { identityColors: undefined, commanderNames: undefined })
    })

    const firstBatch = await t.mutation(internal.deckIdentityBackfill.backfillDeckIdentity, {
      cursor: null,
      batchSize: 1,
    })
    expect(firstBatch).toMatchObject({ patched: 1, isDone: false })
    const secondBatch = await t.mutation(internal.deckIdentityBackfill.backfillDeckIdentity, {
      cursor: firstBatch.continueCursor,
      batchSize: 1,
    })
    expect(secondBatch.patched).toBe(1)
    expect(await listed(owner, commanderDeck)).toEqual({
      identityColors: ["W", "B", "G"],
      commanderNames: ["Ghave, Guru of Spores"],
    })
    expect((await listed(owner, burnDeck)).identityColors).toEqual(["R"])

    const rerun = await t.mutation(internal.deckIdentityBackfill.backfillDeckIdentity, {
      cursor: null,
      batchSize: 10,
    })
    expect(rerun).toMatchObject({ patched: 0, isDone: true })
  })
})
