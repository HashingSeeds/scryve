import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto"

import { canonicalDecklist } from "../../../convex/lib/deckFingerprint"

export async function deckFingerprint(cards: Parameters<typeof canonicalDecklist>[0]) {
  return `v1:${await digestStringAsync(CryptoDigestAlgorithm.SHA256, canonicalDecklist(cards))}`
}
