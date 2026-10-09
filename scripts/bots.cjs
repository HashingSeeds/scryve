/**
 * why: stand-in players for connected games, so one person or agent can test lobbies, sync and
 * load without more devices. Bots act as made-up users through Convex admin auth, which only a
 * deploy key grants, so the key must be a preview key and the deployment it resolves to must be a
 * preview, never production.
 */
const { ConvexClient } = require("convex/browser")
const { anyApi: api, getFunctionName } = require("convex/server")
const { spawnSync } = require("node:child_process")
const { randomBytes, randomUUID } = require("node:crypto")
const { clearInterval, clearTimeout, setInterval, setTimeout } = require("node:timers")
const { parseArgs } = require("node:util")

const { previewKey, previewName } = require("./preview.cjs")

const USAGE = `Stand-in players for connected games on a Convex preview.

  pnpm bots host [--players 2] [--fill 0] [--format commander|none|<mtg format>] [--life 40]
  pnpm bots join <CODE> [--count 1] [--first 1]

Play
  --life-every 3s          each bot changes its life (-1, +1, ...) this often
  --commander-every off    each bot deals 1 commander damage to a random opponent this often
  --claims confirm         answer commander damage claims: confirm, decline or ignore
  --no-start               the host bot waits instead of starting when every seat is taken
  --duration 10m           stop after this long (off runs until the game ends or Ctrl-C)
  --end stay               then stay in the game, leave it, or finish it (host bot only)

Failure
  --drop-every off         drop each bot's socket this often; changes queue and replay
  --drop-for 5s            how long each drop lasts
  --burst 1                life changes per tick, sent at once
  --duplicate              send every change twice with the same operation id

Target
  --preview <name>         defaults to this branch's preview (pnpm preview:up)
  --json                   one JSON event per line, for agents and scripts
`

const PRODUCTION_DEPLOYMENT = "dashing-curlew-34"
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const COLORS = ["#B85636", "#41476E", "#39755C", "#94632D", "#77558A", "#A33A52", "#117B9C"]
const FINISHED = new Set(["finished", "abandoned"])

function parseDuration(value, name) {
  if (value === "off") return 0
  const match = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(value)
  if (!match) throw new Error(`--${name} takes a duration like 500ms, 1.5s or 2m`)
  return Number(match[1]) * { ms: 1, s: 1000, m: 60_000 }[match[2] ?? "s"]
}

function parseCount(value, name, min, max) {
  const count = Number(value)
  if (!Number.isInteger(count) || count < min || count > max)
    throw new Error(`--${name} must be a whole number from ${min} to ${max}`)
  return count
}

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "preview": { type: "string" },
      "players": { type: "string", default: "2" },
      "fill": { type: "string", default: "0" },
      "format": { type: "string", default: "commander" },
      "life": { type: "string" },
      "count": { type: "string", default: "1" },
      "first": { type: "string", default: "1" },
      "start": { type: "boolean", default: true },
      "life-every": { type: "string", default: "3s" },
      "commander-every": { type: "string", default: "off" },
      "claims": { type: "string", default: "confirm" },
      "duration": { type: "string", default: "10m" },
      "end": { type: "string", default: "stay" },
      "drop-every": { type: "string", default: "off" },
      "drop-for": { type: "string", default: "5s" },
      "burst": { type: "string", default: "1" },
      "duplicate": { type: "boolean", default: false },
      "json": { type: "boolean", default: false },
      "help": { type: "boolean", short: "h", default: false },
    },
    allowNegative: true,
  })
  const [command, code] = positionals
  if (values.help) return { command: "help" }
  if (command !== "host" && command !== "join") throw new Error(USAGE)
  if (command === "join" && !code) throw new Error("join needs the lobby's invite code")
  if (!["confirm", "decline", "ignore"].includes(values.claims))
    throw new Error("--claims must be confirm, decline or ignore")
  if (!["stay", "leave", "finish"].includes(values.end))
    throw new Error("--end must be stay, leave or finish")
  const players = parseCount(values.players, "players", 2, 6)
  const fill = parseCount(values.fill, "fill", 0, players - 1)
  const none = values.format === "none"
  return {
    command,
    code: code?.toUpperCase(),
    preview: values.preview,
    players,
    fill,
    system: none ? "none" : "mtg",
    format: values.format,
    life: values.life
      ? parseCount(values.life, "life", 1, 999)
      : values.format === "commander"
        ? 40
        : 20,
    count: parseCount(values.count, "count", 1, 5),
    first: parseCount(values.first, "first", 1, 50),
    start: values.start,
    lifeEvery: parseDuration(values["life-every"], "life-every"),
    commanderEvery: parseDuration(values["commander-every"], "commander-every"),
    claims: values.claims,
    duration: parseDuration(values.duration, "duration"),
    end: values.end,
    dropEvery: parseDuration(values["drop-every"], "drop-every"),
    dropFor: parseDuration(values["drop-for"], "drop-for"),
    burst: parseCount(values.burst, "burst", 1, 50),
    duplicate: values.duplicate,
    json: values.json,
  }
}

// why: bot subjects can't collide with real Clerk subjects, which start with `user_`.
function botIdentity(slot) {
  const name = slot === 0 ? "Host Bot" : `Bot ${slot}`
  return {
    name,
    deviceId: `scryve-bot-device-${slot}`,
    identity: { issuer: "https://scryve-bots.invalid", subject: `scryve-bot:${slot}`, name },
  }
}

function lobbyIdentifiers() {
  const codes = Array.from({ length: 8 }, () =>
    Array.from(randomBytes(6), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join(""),
  )
  return {
    inviteToken: randomBytes(32).toString("base64url"),
    publicId: randomBytes(18).toString("base64url"),
    manualCodeCandidates: codes,
  }
}

function operationId() {
  return `bot_${randomUUID().replaceAll("-", "")}`
}

function assertPreviewTarget({ deploymentName, url }) {
  if (deploymentName === PRODUCTION_DEPLOYMENT || url.includes(PRODUCTION_DEPLOYMENT))
    throw new Error("Refusing to run bots against production")
  if (url !== `https://${deploymentName}.convex.cloud`)
    throw new Error("Convex did not return a preview deployment URL")
}

/**
 * why: trades the project-wide preview key for one preview's admin key, as
 * `convex run --preview-name` does. The admin key stays in memory and is never printed.
 */
async function previewCredentials(deployKey, preview) {
  const [, teamSlug, projectSlug] = deployKey.split("|")[0].split(":")
  const response = await fetch("https://api.convex.dev/api/deployment/authorize_preview", {
    method: "POST",
    headers: { "Authorization": `Bearer ${deployKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      previewName: preview,
      projectSelection: { kind: "teamAndProjectSlugs", teamSlug, projectSlug },
    }),
  })
  if (!response.ok)
    throw new Error(
      `No preview named ${preview} (${response.status}). Run pnpm preview:up or pass --preview.`,
    )
  const { adminKey, url, deploymentName } = await response.json()
  assertPreviewTarget({ deploymentName, url })
  return { adminKey, url, deploymentName }
}

function createReporter(json) {
  return (bot, event, data = {}) => {
    if (json) console.log(JSON.stringify({ bot: bot?.name ?? null, event, ...data }))
    else
      console.log(
        `${bot ? `[${bot.name}] ` : ""}${event}${
          Object.keys(data).length
            ? ` ${Object.entries(data)
                .map(([key, value]) => `${key}=${value}`)
                .join(" ")}`
            : ""
        }`,
      )
  }
}

// why: each bot owns its socket, identity and device, so several can share one lobby.
class Bot {
  constructor(slot, credentials, options, report) {
    Object.assign(this, botIdentity(slot))
    Object.assign(this, { slot, credentials, options, report })
    this.queue = []
    this.inflight = new Set()
    this.answered = new Set()
    this.stats = { sent: 0, failed: 0, replayed: 0, drops: 0 }
    this.timers = []
    this.connect()
  }

  connect() {
    this.client = new ConvexClient(this.credentials.url, { logger: false })
    this.client.setAdminAuth(this.credentials.adminKey, this.identity)
    this.offline = false
    if (this.publicId) this.watch()
  }

  async host() {
    await this.client.mutation(api.users.syncCurrent, { displayName: this.name })
    const { page } = await this.client.query(api.games.activeConnectedGames, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    for (const game of page.filter((game) => game.isHost)) {
      await this.client.mutation(api.games.abandonGame, { publicId: game.publicId })
      this.report(this, "abandoned-leftover", { publicId: game.publicId })
    }
    const { players, system, format, life } = this.options
    const lobby = await this.client.mutation(api.games.createLobby, {
      ...lobbyIdentifiers(),
      playerCount: players,
      startingLife: life,
      ruleset: format,
      system,
      ...(system === "none" ? {} : { format }),
      hostDisplayName: this.name,
      hostColor: COLORS[0],
      deviceId: this.deviceId,
    })
    this.publicId = lobby.publicId
    this.watch()
    return lobby
  }

  async join(manualCode) {
    await this.client.mutation(api.users.syncCurrent, { displayName: this.name })
    const seat = await this.client.mutation(api.games.claimSeat, {
      manualCode,
      displayName: this.name,
      color: COLORS[this.slot % COLORS.length],
      deviceId: this.deviceId,
    })
    this.publicId = seat.publicId
    this.report(this, "joined", { seat: seat.seat })
    this.watch()
  }

  watch() {
    this.unsubscribe = this.client.onUpdate(
      api.games.lobbyProjection,
      { publicId: this.publicId, deviceId: this.deviceId, includeRecentOperationIds: false },
      (lobby) => this.onLobby(lobby),
      (error) => this.report(this, "error", { message: error.message }),
    )
  }

  onLobby(lobby) {
    this.lobby = lobby
    this.me = lobby.players.find((player) => player.controlledByMe)
    if (FINISHED.has(lobby.status)) return this.stop(`game-${lobby.status}`)
    if (lobby.status === "lobby" && lobby.isHost && this.options.start && !this.starting) {
      if (lobby.players.length === lobby.playerCount) {
        this.starting = true
        this.client
          .mutation(api.games.startGame, { publicId: this.publicId })
          .catch((error) => this.report(this, "start-failed", { message: error.message }))
      }
    }
    if (lobby.status === "active" && !this.playing) this.play()
    if (this.options.claims !== "ignore") {
      for (const claim of lobby.commanderDamage?.pendingClaims ?? []) {
        if (this.answered.has(claim.operationId)) continue
        this.answered.add(claim.operationId)
        const fn =
          this.options.claims === "confirm"
            ? api.games.confirmCommanderDamage
            : api.games.declineCommanderDamage
        this.send(fn, {
          publicId: this.publicId,
          operationId: claim.operationId,
          deviceId: this.deviceId,
          clientCreatedAt: Date.now(),
        })
      }
    }
  }

  play() {
    this.playing = true
    this.report(this, "playing", { seat: this.me?.seat, life: this.me?.currentLife })
    let tick = 0
    const { lifeEvery, commanderEvery, dropEvery, burst } = this.options
    if (lifeEvery)
      this.every(lifeEvery, () => {
        for (let i = 0; i < burst; i += 1, tick += 1) this.changeLife(tick % 2 === 0 ? -1 : 1)
      })
    if (commanderEvery && this.lobby.commanderDamage)
      this.every(commanderEvery, () => this.dealCommander())
    if (dropEvery) this.every(dropEvery, () => this.drop())
  }

  every(ms, fn) {
    this.timers.push(setInterval(fn, ms))
  }

  changeLife(delta) {
    if (!this.me) return
    this.send(api.games.changeLife, {
      publicId: this.publicId,
      playerId: this.me.playerId,
      operationId: operationId(),
      delta,
      deviceId: this.deviceId,
      clientCreatedAt: Date.now(),
    })
  }

  dealCommander() {
    const eliminated = new Set(this.lobby.commanderDamage?.eliminatedPlayerIds ?? [])
    const targets = this.lobby.players.filter(
      (player) => player.playerId !== this.me?.playerId && !eliminated.has(player.playerId),
    )
    if (!this.me || targets.length === 0) return
    this.send(api.games.submitCommanderDamage, {
      publicId: this.publicId,
      fromPlayerId: this.me.playerId,
      toPlayerId: targets[Math.floor(Math.random() * targets.length)].playerId,
      operationId: operationId(),
      delta: 1,
      deviceId: this.deviceId,
      clientCreatedAt: Date.now(),
    })
  }

  /**
   * why: offline writes keep their operation id and timestamp, like the app's outbox, so
   * replays are retries the server must dedupe rather than new changes.
   */
  send(fn, args, replay = false) {
    const op = { fn, args, settled: false }
    if (this.offline) return void this.queue.push(op)
    const copies = this.options.duplicate ? 2 : 1
    this.inflight.add(op)
    Promise.allSettled(Array.from({ length: copies }, () => this.client.mutation(fn, args))).then(
      (results) => {
        if (op.settled) return
        op.settled = true
        this.inflight.delete(op)
        const failure = results.find((result) => result.status === "rejected")
        if (!failure) return void (this.stats[replay ? "replayed" : "sent"] += 1)
        this.stats.failed += 1
        this.report(this, "rejected", { fn: getFunctionName(fn), message: failure.reason.message })
      },
    )
  }

  drop() {
    if (this.offline || this.stopped) return
    this.offline = true
    this.stats.drops += 1
    for (const op of this.inflight) {
      op.settled = true
      this.queue.push(op)
    }
    this.inflight.clear()
    this.unsubscribe?.()
    void this.client.close()
    this.report(this, "dropped", { for: `${this.options.dropFor}ms` })
    setTimeout(() => {
      if (this.stopped) return
      this.connect()
      const queued = this.queue.splice(0)
      this.report(this, "reconnected", { replaying: queued.length })
      for (const op of queued) this.send(op.fn, op.args, true)
    }, this.options.dropFor)
  }

  stop(reason) {
    if (this.stopped) return
    this.stopped = true
    for (const timer of this.timers) clearInterval(timer)
    this.report(this, "stopped", { reason })
    this.onStop?.()
  }

  async end(action) {
    if (!this.publicId || FINISHED.has(this.lobby?.status) || action === "stay") return
    if (this.offline) this.connect()
    if (action === "finish" && this.lobby?.isHost)
      await this.client.mutation(api.games.finishGameWithOperation, {
        publicId: this.publicId,
        operationId: operationId(),
        result: { kind: "unknown" },
      })
    else
      await this.client.mutation(api.games.leaveMyGame, {
        publicId: this.publicId,
        deviceId: this.deviceId,
      })
  }

  async close() {
    this.unsubscribe?.()
    if (!this.offline) await this.client.close()
  }
}

function currentPreviewName() {
  const branch = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" }).stdout?.trim()
  if (!branch) throw new Error("Check out a branch or pass --preview <name>")
  return previewName(branch)
}

async function main() {
  const options = parseCli(process.argv.slice(2))
  if (options.command === "help") return void console.log(USAGE)
  const report = createReporter(options.json)
  const preview = options.preview ?? currentPreviewName()
  const credentials = await previewCredentials(previewKey(), preview)
  report(null, "preview", { name: preview, deployment: credentials.deploymentName })

  const bots = []
  const spawn = (slot) => {
    const bot = new Bot(slot, credentials, options, report)
    bots.push(bot)
    return bot
  }
  try {
    if (options.command === "host") {
      const host = spawn(0)
      const lobby = await host.host()
      report(host, "lobby", {
        code: lobby.manualCode,
        publicId: lobby.publicId,
        players: options.players,
      })
      for (let slot = 1; slot <= options.fill; slot += 1) {
        const bot = spawn(slot)
        await bot.join(lobby.manualCode)
      }
    } else {
      for (let slot = options.first; slot < options.first + options.count; slot += 1) {
        const bot = spawn(slot)
        await bot.join(options.code)
      }
    }
  } catch (error) {
    report(null, "setup-failed", { message: error.message })
    await Promise.allSettled(bots.map((bot) => bot.close()))
    process.exitCode = 1
    return
  }

  await new Promise((resolve) => {
    let remaining = bots.length
    for (const bot of bots) bot.onStop = () => --remaining === 0 && resolve()
    const timeout = options.duration ? setTimeout(resolve, options.duration) : undefined
    process.once("SIGINT", () => {
      clearTimeout(timeout)
      resolve()
    })
  })
  for (const bot of bots) bot.stop("done")
  await new Promise((resolve) => setTimeout(resolve, 1000))
  for (const bot of bots) {
    await bot
      .end(options.end)
      .catch((error) => report(bot, "end-failed", { message: error.message }))
    report(bot, "summary", { ...bot.stats, unsent: bot.queue.length })
  }
  await Promise.allSettled(bots.map((bot) => bot.close()))
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { assertPreviewTarget, botIdentity, lobbyIdentifiers, parseCli, parseDuration }
