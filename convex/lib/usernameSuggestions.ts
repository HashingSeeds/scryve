const SUGGESTION_ADJECTIVES = [
  "brisk",
  "bright",
  "clever",
  "curious",
  "eager",
  "lucky",
  "quiet",
  "steady",
  "swift",
  "wily",
]

const SUGGESTION_NOUNS = [
  "badger",
  "comet",
  "falcon",
  "griffin",
  "hydra",
  "lantern",
  "otter",
  "phoenix",
  "sapling",
  "wyvern",
]

export function suggestUsername(random: () => number = Math.random): string {
  const pick = <T>(pool: readonly T[]) => pool[Math.floor(random() * pool.length) % pool.length]
  const digits = String(Math.floor(random() * 100) % 100).padStart(2, "0")
  return `${pick(SUGGESTION_ADJECTIVES)}-${pick(SUGGESTION_NOUNS)}-${digits}`
}
