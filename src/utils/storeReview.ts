import { storage } from "@/utils/storage"

const GAMES_KEY = "scryve.review.completedGames.v1"
const REQUESTED_KEY = "scryve.review.requested.v1"
const HELP_SHOWN_KEY = "scryve.help.secondGameShown.v1"
const MIN_GAMES = 5

export function recordReviewCompletion(gameId: string) {
  try {
    if (storage.getBoolean(REQUESTED_KEY)) return
    const games = completedGames()
    if (games.length >= MIN_GAMES || games.includes(gameId)) return
    storage.set(GAMES_KEY, JSON.stringify([...games, gameId]))
  } catch {}
}

function completedGames(): string[] {
  const value: unknown = JSON.parse(storage.getString(GAMES_KEY) ?? "[]")
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []
}

export function claimSecondGameHelp(gameId: string) {
  try {
    if (storage.getBoolean(HELP_SHOWN_KEY)) return false
    const games = completedGames()
    if (games.length !== 2 || games[1] !== gameId) return false
    storage.set(HELP_SHOWN_KEY, true)
    return true
  } catch {
    return false
  }
}

export async function requestStoreReview(isStillOnSummary: () => boolean) {
  try {
    if (storage.getBoolean(REQUESTED_KEY) || completedGames().length < MIN_GAMES) return
    const StoreReview: typeof import("expo-store-review") = require("expo-store-review")
    if (!(await StoreReview.isAvailableAsync()) || !isStillOnSummary()) return
    if (storage.getBoolean(REQUESTED_KEY)) return
    storage.set(REQUESTED_KEY, true)
    await StoreReview.requestReview()
  } catch {}
}
