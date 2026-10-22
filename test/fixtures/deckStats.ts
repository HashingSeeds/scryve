import type { DeckSummary } from "@/features/stats/deckStatsMath"

import type { Id } from "../../convex/_generated/dataModel"

const totals = {
  _id: "totals" as Id<"deckKeyStats">,
  _creationTime: 1,
  userId: "owner" as Id<"users">,
  deckKey: "key",
  fingerprint: "all",
  games: 20,
  wins: 12,
  losses: 8,
  draws: 0,
  unknown: 0,
  updatedAt: 30,
  manualGames: { total: 12, wins: 7, losses: 5, draws: 0, unknown: 0 },
  manualMatches: { total: 5, wins: 3, losses: 2, draws: 0, unknown: 0 },
}
export const deckStatsSummary: DeckSummary = {
  all: totals,
  lists: [
    { ...totals, fingerprint: "current", games: 8, wins: 4, losses: 4 },
    { ...totals, fingerprint: "previous", games: 12, wins: 8, losses: 4 },
  ],
  slices: [
    {
      source: "scryve",
      fingerprint: "current",
      podSize: 4,
      games: 8,
      wins: 4,
      losses: 4,
      draws: 0,
      firstAt: 20,
      lastAt: 30,
    },
    {
      source: "scryve",
      fingerprint: "previous",
      podSize: 2,
      games: 12,
      wins: 8,
      losses: 4,
      draws: 0,
      firstAt: 1,
      lastAt: 10,
    },
    {
      source: "manual",
      fingerprint: null,
      podSize: null,
      games: 5,
      wins: 3,
      losses: 2,
      draws: 0,
      firstAt: 5,
      lastAt: 6,
    },
  ],
  scannedAll: false,
}
export const deckStatsAccess = {
  ready: true,
  loading: false,
  signedIn: true,
  ownerId: "owner",
  request: jest.fn(),
}
export const deckStatsParams = { deckKey: "key", deckName: "Burn", game: "mtg", format: "modern" }
