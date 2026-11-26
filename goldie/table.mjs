/**
 * why: connected store scenes need other people at the table, and a Maestro flow can make HTTP
 * calls but not run node. goldie/maestro.ts serves these actions on 127.0.0.1 while flows run;
 * they act as the store account and as bots on this worktree's local Convex backend, never
 * production. A flow calls one with `runScript: { file: table.js, env: { ACTION: join } }`.
 */
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { setTimeout } from "node:timers/promises"
import { URL, fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const require = createRequire(import.meta.url)
const { ConvexClient } = require("convex/browser")
const { anyApi: api } = require("convex/server")

const { STORE_ACCOUNT, recordTodayGames } = require("./seed.cjs")
const { backendCredentials, botIdentity } = require("../scripts/bots.cjs")

export const TABLE_PORT = 4790

async function as(identity, run) {
  const credentials = await backendCredentials()
  const client = new ConvexClient(credentials.url, { logger: false })
  client.setAdminAuth(credentials.adminKey, identity)
  try {
    return await run(client)
  } finally {
    await client.close()
  }
}

const store = (run) =>
  as({ subject: STORE_ACCOUNT.clerkUserId, issuer: "https://scryve-goldie.invalid" }, run)

async function hostedGames(client) {
  const { page } = await client.query(api.games.activeConnectedGames, {
    paginationOpts: { numItems: 10, cursor: null },
  })
  return page.filter((game) => game.isHost)
}

/** why: a game in play ends as a win for the store account, so History shows it finished rather than abandoned. */
async function reset() {
  await store(async (client) => {
    for (const game of await hostedGames(client)) {
      if (game.status === "lobby") {
        await client.mutation(api.games.abandonGame, { publicId: game.publicId })
        continue
      }
      const { players } = await client.query(api.games.lobbyProjection, { publicId: game.publicId })
      const me = players.find((player) => player.controlledByMe)
      await client.mutation(api.games.finishGameWithOperation, {
        publicId: game.publicId,
        operationId: `goldie_${randomUUID().replaceAll("-", "")}`,
        result: { kind: "win", winnerPlayerIds: [me.playerId] },
      })
    }
  })
}

async function join() {
  const code = await store(async (client) => {
    const [game] = (await hostedGames(client)).sort((a, b) => b.updatedAt - a.updatedAt)
    if (!game) throw new Error("The store account hosts no game")
    const projection = await client.query(api.games.lobbyProjection, { publicId: game.publicId })
    // why: the host also controls unclaimed seats of a connected local game, so those count as open.
    const unclaimed = projection.players.filter((player) => player.controlledByMe).length - 1
    const missing = projection.playerCount - projection.players.length + unclaimed
    return { manualCode: projection.invitation?.manualCode, missing }
  })
  if (!code.manualCode) throw new Error("The lobby has no usable invite code")
  // why: bots joining at once race for the same open seat, so each one waits for the last to sit.
  // why: a short gap lets each arrival show in the lobby, which the preview films.
  for (let slot = 1; slot <= code.missing; slot++) {
    await seatBot(code.manualCode, slot)
    await setTimeout(700)
  }
}

async function seatBot(manualCode, slot) {
  const log = path.join(os.tmpdir(), `goldie-bot-${slot}.log`)
  const out = fs.openSync(log, "w")
  const args = ["scripts/bots.cjs", "join", manualCode, "--first", String(slot)]
  spawn(process.execPath, [...args, "--life-every", "off", "--duration", "6m"], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", out, out],
  }).unref()
  fs.closeSync(out)
  for (let waited = 0; waited < 20000; waited += 250) {
    if (fs.readFileSync(log, "utf8").includes("joined")) return
    await setTimeout(250)
  }
  throw new Error(`Bot ${slot} did not join: ${fs.readFileSync(log, "utf8").trim()}`)
}

async function playFromBotPhones(steps, gapMs) {
  for (const [slot, delta] of steps) {
    const bot = botIdentity(slot)
    await as(bot.identity, async (client) => {
      const { page } = await client.query(api.games.activeConnectedGames, {
        paginationOpts: { numItems: 10, cursor: null },
      })
      const game = page.find((candidate) => candidate.status === "active")
      if (!game) throw new Error(`${bot.name} is not in an active game`)
      const lobby = await client.query(api.games.lobbyProjection, {
        publicId: game.publicId,
        deviceId: bot.deviceId,
      })
      const me = lobby.players.find((player) => player.controlledByMe)
      await client.mutation(api.games.changeLife, {
        publicId: game.publicId,
        playerId: me.playerId,
        operationId: `bot_${randomUUID().replaceAll("-", "")}`,
        delta,
        deviceId: bot.deviceId,
        clientCreatedAt: Date.now(),
      })
    })
    await setTimeout(gapMs)
  }
}

const ACTIONS = {
  reset,
  join,
  // why: History should open on local and connected games mixed, so local games land just before it.
  "local-games": () => store(recordTodayGames),
  "damage": () =>
    playFromBotPhones(
      [
        [1, -11],
        [2, -6],
        [3, -18],
      ],
      0,
    ),
  "play-live": () =>
    playFromBotPhones(
      [
        [1, -3],
        [3, -2],
        [2, -5],
        [1, -4],
      ],
      600,
    ),
}

export function serveTable() {
  const server = http.createServer((request, response) => {
    const action = ACTIONS[new URL(request.url ?? "/", "http://x").pathname.slice(1)]
    if (!action) return void response.writeHead(404).end("unknown action")
    action().then(
      () => response.writeHead(200).end("ok"),
      (error) => response.writeHead(500).end(String(error?.message ?? error)),
    )
  })
  return new Promise((resolve) => server.listen(TABLE_PORT, "127.0.0.1", () => resolve(server)))
}
