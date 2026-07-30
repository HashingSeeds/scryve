import { cronJobs } from "convex/server"

import { internal } from "./_generated/api"

const crons = cronJobs()

crons.hourly("abandon stale connected games", { minuteUTC: 17 }, internal.games.cleanupStaleGames)

export default crons
