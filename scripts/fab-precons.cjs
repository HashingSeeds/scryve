const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..")
const games = path.join(root, "convex/lib/games")
const precons = path.join(games, "fabPrecons.json")
const PITCH = { 1: "red", 2: "yellow", 3: "blue" }

function displayName(name, pitch) {
  return pitch ? `${name} (${pitch})` : name
}

async function main() {
  const tag = /FAB_CUBE_TAG = "([^"]+)"/.exec(
    fs.readFileSync(path.join(games, "fleshAndBlood.ts"), "utf8"),
  )[1]
  const response = await fetch(
    `https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/${tag}/json/english/card.json`,
  )
  if (!response.ok) throw new Error(`fab-cube ${tag} returned ${response.status}`)
  const ids = { heroes: new Map(), cards: new Map() }
  for (const card of await response.json()) {
    const kind = card.types.includes("Hero") ? ids.heroes : ids.cards
    const name = displayName(card.name, PITCH[card.pitch])
    kind.set(name, [...(kind.get(name) ?? []), card.unique_id])
  }

  const missing = []
  const used = { heroes: {}, cards: {} }
  const resolve = (deck, kind, name) => {
    const found = ids[kind].get(name) ?? []
    if (found.length !== 1) {
      missing.push(`${deck.name}: ${name} (${found.length} matches)`)
      return undefined
    }
    used[kind][found[0]] = name
    return found[0]
  }
  const decks = JSON.parse(fs.readFileSync(precons, "utf8")).map((deck) => ({
    name: deck.name,
    format: deck.format,
    hero: deck.hero,
    heroId: resolve(deck, "heroes", deck.hero),
    sourceUrl: deck.sourceUrl,
    releasedAt: deck.releasedAt,
    cards: deck.cards.map(({ name, pitch, count }) => ({
      name,
      ...(pitch ? { pitch } : {}),
      count,
      id: resolve(deck, "cards", displayName(name, pitch)),
    })),
  }))
  if (missing.length) {
    for (const line of missing) console.log(`Not exactly one card in fab-cube ${tag}: ${line}`)
    process.exitCode = 1
    return
  }
  const byName = (record) =>
    Object.fromEntries(Object.entries(record).sort(([, a], [, b]) => a.localeCompare(b)))
  fs.writeFileSync(precons, JSON.stringify(decks))
  fs.writeFileSync(
    path.join(games, "fixtures/fabPreconCards.json"),
    JSON.stringify({ tag, heroes: byName(used.heroes), cards: byName(used.cards) }),
  )
  spawnSync(
    path.join(root, "node_modules/.bin/prettier"),
    ["--write", precons, path.join(games, "fixtures/fabPreconCards.json")],
    { stdio: "ignore" },
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
