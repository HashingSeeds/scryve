import { integration } from "./integrations"

type FingerprintCard = {
  game?: string
  identityNamespace?: string
  cardId?: string
  oracleId?: string
  originalReference?: string
  name: string
  section?: string
  board?: string
  commanderColor?: string
  quantity: number
}

export function canonicalDecklist(cards: readonly FingerprintCard[]) {
  const quantities = new Map<string, number>()
  for (const card of cards) {
    const game = card.game ?? "mtg"
    const identity = card.cardId ?? card.oracleId
    const key = JSON.stringify([
      game,
      card.identityNamespace ?? integration(game)?.identityNamespace ?? game,
      identity ?? [
        "unresolved",
        (card.originalReference ?? card.name)
          .normalize("NFKC")
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase(),
      ],
      card.section ?? card.board ?? "main",
      card.commanderColor ?? "",
    ])
    quantities.set(key, (quantities.get(key) ?? 0) + card.quantity)
  }
  return `v1:[${[...quantities.keys()]
    .sort()
    .map((key) => `${key.slice(0, -1)},${quantities.get(key)}]`)
    .join(",")}]`
}

export async function deckFingerprint(cards: readonly FingerprintCard[]) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalDecklist(cards)),
  )
  return `v1:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}
