import { cronJobs } from "convex/server"

import { internal } from "./_generated/api"

const crons = cronJobs()

crons.hourly("abandon stale connected games", { minuteUTC: 17 }, internal.games.cleanupStaleGames)
crons.interval(
  "prune resolved preconstructed deck cache",
  { hours: 24 },
  internal.deckImports.pruneResolvedPreconstructedCache,
  {},
)

export default crons
