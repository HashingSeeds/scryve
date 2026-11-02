/**
 * why: store screenshots of decks and history need an account with real decks and a record.
 * This fills one on this branch's Convex preview, acting as that account through the preview's
 * admin key the same way scripts/bots.cjs does, so it can never reach production.
 *
 *   node goldie/seed.cjs
 */
const { ConvexClient } = require("convex/browser")
const { anyApi: api } = require("convex/server")
const { spawnSync } = require("node:child_process")
const { createHash } = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { setTimeout } = require("node:timers")

const { botIdentity, previewCredentials } = require("../scripts/bots.cjs")
const { previewKey, previewName } = require("../scripts/preview.cjs")

const DAY = 24 * 60 * 60 * 1000

/** why: a Clerk development-instance test account (OTP 424242); its password lives only in ~/.argent/secrets.env as GOLDIE_STORE_PASSWORD. */
const STORE_ACCOUNT = { clerkUserId: "user_3L17ULydvfKviJTRB25It4HXsDZ", username: "riley" }
const OPPONENTS = ["mara", "devon", "kenji", "sofia", "alex", "jordan"]

const POKEMON_LIST = `4 Charmander PAF 7
1 Charmeleon PAF 8
3 Charizard ex OBF 125
2 Pidgey OBF 162
2 Pidgeot ex OBF 164
2 Rotom V CRZ 45
1 Lumineon V BRS 40
1 Manaphy BRS 41
4 Rare Candy SVI 191
4 Ultra Ball SVI 196
4 Nest Ball SVI 181
4 Buddy-Buddy Poffin TEF 144
2 Super Rod PAL 188
2 Counter Catcher PAR 160
3 Professor's Research SVI 189
2 Lost Vacuum CRZ 135
2 Defiance Band SVI 169
3 Arven SVI 166
2 Iono PAL 185
2 Boss's Orders PAL 172
10 Fire Energy SVE 2`

const YUGIOH_LIST = `#main
3 Snake-Eye Ash
3 Snake-Eyes Poplar
2 Snake-Eye Oak
3 Ash Blossom & Joyous Spring
3 Maxx "C"
2 Effect Veiler
3 Original Sinful Spoils - Snake-Eye
2 Called by the Grave
1 Crossout Designator
3 Triple Tactics Talent
3 Diabellstar the Black Witch
3 Infinite Impermanence
2 Droll & Lock Bird
3 Pot of Prosperity
3 Fiendsmith Engraver
1 Snake-Eye Birch
#extra
1 Promethean Princess, Bestower of Flames
1 S:P Little Knight
1 I:P Masquerena`

// why: win rates on the deck list read as believable records, not round numbers.
const DECKS = [
  {
    name: "Ur-Dragon",
    game: "mtg",
    format: "commander",
    precon: "DraconicDomination_C17",
    wins: 9,
    losses: 5,
  },
  {
    name: "Lathril Elves",
    game: "mtg",
    format: "commander",
    precon: "ElvenEmpire_KHC",
    wins: 5,
    losses: 6,
  },
  {
    name: "Lorehold Spirits",
    game: "mtg",
    format: "commander",
    precon: "LoreholdSpirit_SOC",
    wins: 3,
    losses: 5,
  },
  {
    name: "Charizard ex",
    game: "pokemon",
    format: "standard",
    list: POKEMON_LIST,
    wins: 7,
    losses: 3,
  },
  { name: "Snake-Eye", game: "ygo", format: "advanced", list: YUGIOH_LIST, wins: 4, losses: 5 },
]

// why: the store shows a friend's deck opened from a share link, so a bot owns and shares it.
const SHARED_DECK = {
  name: "Calling All Angels",
  game: "mtg",
  format: "commander",
  precon: "CallingAllAngels_FDC",
}
const LINK_FLOW = path.join(__dirname, "..", ".argent", "flows", "store-shared-deck-link.yaml")

// why: argent fills {{secret:...}} in typed text but not in tool args, so the link lands in a gitignored fragment.
function saveLinkFlow(url) {
  fs.writeFileSync(
    LINK_FLOW,
    `# Written by goldie/seed.cjs for this branch's preview; not committed.\nsteps:\n  - tool: open-url\n    args: { url: "${url}" }\n`,
  )
}

async function seedSharedDeck(credentials) {
  const owner = botIdentity(0)
  const client = new ConvexClient(credentials.url, { logger: false })
  client.setAdminAuth(credentials.adminKey, owner.identity)
  try {
    const { decks } = await client.query(api.decks.listMine, {})
    const deckId =
      decks.find((deck) => deck.name === SHARED_DECK.name)?._id ??
      (await client.mutation(api.decks.importResolved, {
        name: SHARED_DECK.name,
        format: SHARED_DECK.format,
        game: SHARED_DECK.game,
        cards: (await deckCards(client, SHARED_DECK)).cards,
      }))
    const { token } = await client.mutation(api.decks.share, { deckId })
    saveLinkFlow(`scryve-preview:///deck/${token}`)
    console.log(`shared ${SHARED_DECK.name} from ${OPPONENTS[0]}`)
  } finally {
    await client.close()
  }
}

function stableId(...parts) {
  return `goldie_${createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 24)}`
}

// why: deck imports share a per-account rate limit, and seeding imports back to back.
async function withRetry(run) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      const limited = error.data?.code === "rate_limited"
      // why: card providers time out now and then, and one slow lookup should not end the seed.
      if (!limited && attempt >= 4) throw error
      const waitMs = limited ? error.data.retryAfterMs + 250 : attempt * 3000
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
}

async function deckCards(client, deck) {
  if (deck.precon) {
    const resolved = await withRetry(() =>
      client.action(api.deckImports.resolvePreconstructed, { fileName: deck.precon }),
    )
    return { cards: resolved.cards, unresolved: resolved.unresolved }
  }
  return await withRetry(() =>
    client.action(api.deckImports.resolvePasted, { list: deck.list, game: deck.game }),
  )
}

async function seedDecks(client) {
  const { decks: existing } = await client.query(api.decks.listMine, {})
  const byName = new Map(existing.map((deck) => [deck.name, deck]))
  for (const deck of DECKS) {
    if (byName.has(deck.name)) continue
    const { cards, unresolved } = await deckCards(client, deck)
    if (unresolved.length) console.log(`${deck.name}: unresolved ${unresolved.join(", ")}`)
    await client.mutation(api.decks.importResolved, {
      name: deck.name,
      format: deck.format,
      game: deck.game,
      cards,
    })
    console.log(`deck ${deck.name} (${cards.length} entries)`)
  }
  const { decks } = await client.query(api.decks.listMine, {})
  return new Map(decks.map((deck) => [deck.name, deck.latestVersionId]))
}

const COLORS = ["#B85636", "#41476E", "#39755C", "#94632D", "#77558A", "#A33A52"]
const SHAPES = ["heart", "triangle", "square", "diamond", "star", "hexagon"]
const PLAY = {
  mtg: { format: "commander", life: 40, seats: 4, winner: 14, loser: 0 },
  pokemon: { format: "standard", life: 6, seats: 2, winner: 0, loser: 2 },
  ygo: { format: "advanced", life: 8000, seats: 2, winner: 2600, loser: 0 },
}

// why: a deterministic shuffle, so re-running finds the same games instead of adding more.
function shuffled(items, salt) {
  return items
    .map((item, position) => ({ item, key: stableId(salt, String(position)) }))
    .sort((left, right) => (left.key < right.key ? -1 : 1))
    .map(({ item }) => item)
}

async function seedGames(client, versions) {
  const now = Date.now()
  const games = shuffled(
    DECKS.flatMap((deck) =>
      [...Array(deck.wins).fill(true), ...Array(deck.losses).fill(false)].map((won, index) => ({
        deck,
        won,
        index,
      })),
    ),
    "order",
  )
  for (const [order, { deck, won, index }] of games.entries()) {
    const play = PLAY[deck.game]
    const evening = new Date(now - (1 + Math.floor(order * 0.7)) * DAY)
    evening.setHours(18, 30, 0, 0)
    const finishedAt = evening.getTime() + ((order * 37 + index * 11) % 180) * 60 * 1000
    const winnerSeat = won ? 0 : 1 + (index % (play.seats - 1))
    const players = Array.from({ length: play.seats }, (_, seat) => ({
      localId: `p${seat + 1}`,
      seat: seat + 1,
      displayName:
        seat === 0 ? STORE_ACCOUNT.username : OPPONENTS[(index + seat) % OPPONENTS.length],
      color: COLORS[seat],
      shape: SHAPES[seat],
      currentLife: seat === winnerSeat ? play.winner : play.loser,
      ...(seat === 0 ? { me: true, deckVersionId: versions.get(deck.name) } : {}),
    }))
    await client.mutation(api.games.publishFinishedLocalGame, {
      publicId: stableId(deck.name, deck.precon ?? deck.list, String(index)),
      system: deck.game,
      format: play.format,
      ruleset: play.format,
      startingLife: play.life,
      startedAt: finishedAt - 45 * 60 * 1000,
      finishedAt,
      eventCount: 40 + index,
      players,
      result: { kind: "win", winnerLocalIds: [`p${winnerSeat + 1}`] },
    })
  }
  console.log(`${games.length} games`)
}

function runInternal(preview, deployKey, name, args) {
  const convex = path.join(
    path.dirname(require.resolve("./seed.cjs")),
    "..",
    "node_modules",
    ".bin",
    "convex",
  )
  const result = spawnSync(convex, ["run", "--preview-name", preview, name, JSON.stringify(args)], {
    env: { ...process.env, CONVEX_DEPLOY_KEY: deployKey },
    stdio: ["ignore", "ignore", "inherit"],
  })
  if (result.status !== 0) throw new Error(`${name} failed`)
}

// why: bots have no Clerk username, so seats would read "Player 2"; store art needs real names.
async function nameBots(credentials, preview, deployKey) {
  for (const [slot, username] of OPPONENTS.entries()) {
    const bot = botIdentity(slot)
    const client = new ConvexClient(credentials.url, { logger: false })
    client.setAdminAuth(credentials.adminKey, bot.identity)
    await client.mutation(api.users.syncCurrent, { displayName: username })
    await client.close()
    runInternal(preview, deployKey, "users:applyClerkUsername", {
      clerkUserId: bot.identity.subject,
      username,
    })
  }
  console.log(`named bots ${OPPONENTS.join(", ")}`)
}

async function main() {
  const { clerkUserId } = STORE_ACCOUNT
  const branch = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" }).stdout.trim()
  const preview = previewName(branch)
  const deployKey = previewKey()
  const credentials = await previewCredentials(deployKey, preview)
  await nameBots(credentials, preview, deployKey)
  await seedSharedDeck(credentials)
  const client = new ConvexClient(credentials.url, { logger: false })
  client.setAdminAuth(credentials.adminKey, {
    subject: clerkUserId,
    issuer: "https://scryve-goldie.invalid",
  })
  try {
    // why: a fresh preview has never seen the store account sign in, so its user record is missing.
    await client.mutation(api.users.syncCurrent, { displayName: STORE_ACCOUNT.username })
    runInternal(preview, deployKey, "users:applyClerkUsername", {
      clerkUserId,
      username: STORE_ACCOUNT.username,
    })
    runInternal(preview, deployKey, "entitlements:setUserFeature", {
      clerkUserId,
      feature: "pro_decks_limit",
      enabled: true,
      source: "goldie",
    })
    const versions = await seedDecks(client)
    await seedGames(client, versions)
  } finally {
    await client.close()
  }
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })

module.exports = { STORE_ACCOUNT }
