const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..")
const games = path.join(root, "convex/lib/games")
const PITCH = { 1: "red", 2: "yellow", 3: "blue" }

async function main() {
  const tag = /FAB_CUBE_TAG = "([^"]+)"/.exec(
    fs.readFileSync(path.join(games, "fleshAndBlood.ts"), "utf8"),
  )[1]
  const response = await fetch(
    `https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/${tag}/json/english/card.json`,
  )
  if (!response.ok) throw new Error(`fab-cube ${tag} returned ${response.status}`)
  const heroes = new Set()
  const cards = new Set()
  for (const card of await response.json()) {
    const pitch = PITCH[card.pitch]
    const name = pitch ? `${card.name} (${pitch})` : card.name
    ;(card.types.includes("Hero") ? heroes : cards).add(name)
  }

  const used = { heroes: new Set(), cards: new Set() }
  const missing = []
  for (const deck of JSON.parse(fs.readFileSync(path.join(games, "fabPrecons.json"), "utf8"))) {
    if (heroes.has(deck.hero)) used.heroes.add(deck.hero)
    else missing.push(`${deck.name}: hero ${deck.hero}`)
    for (const card of deck.cards) {
      const name = card.pitch ? `${card.name} (${card.pitch})` : card.name
      if (cards.has(name)) used.cards.add(name)
      else missing.push(`${deck.name}: ${name}`)
    }
  }
  const fixture = {
    tag,
    heroes: [...used.heroes].sort(),
    cards: [...used.cards].sort(),
  }
  fs.writeFileSync(
    path.join(games, "fixtures/fabPreconCards.json"),
    `${JSON.stringify(fixture, null, 2)}\n`,
  )
  for (const line of missing) console.log(`Not in fab-cube ${tag}: ${line}`)
  if (missing.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
