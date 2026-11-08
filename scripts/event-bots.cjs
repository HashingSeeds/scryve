/**
 * why: stand-in players for events, so one person can fill an event with up to 128 players on
 * either authority. On Convex they act as made-up users through admin auth on a preview, like
 * scripts/bots.cjs. Nearby they join a real device's hosted event over Wi-Fi, which is the
 * authority no unit test runs.
 */
const { ConvexClient } = require("convex/browser")
const { anyApi: api } = require("convex/server")
const { randomBytes } = require("node:crypto")
const net = require("node:net")
const { clearInterval, clearTimeout, setInterval, setTimeout } = require("node:timers")
const { parseArgs } = require("node:util")

const {
  createReporter,
  currentPreviewName,
  lobbyIdentifiers,
  parseCount,
  parseDuration,
  previewCredentials,
} = require("./bots.cjs")
const { previewKey } = require("./preview.cjs")

const USAGE = `Stand-in players for events: on a Convex preview, or in a nearby event a device hosts.

  pnpm event-bots convex host [--players 16] [--guests 0] [--structure swiss|pods]
                              [--best-of 3] [--rounds 3] [--format standard]
  pnpm event-bots convex join <CODE> [--players 16] [--first 1]
  pnpm event-bots nearby <CODE> <ip>:<port> [--players 16]
      port: dns-sd -B _scryve._tcp then dns-sd -L "event-<CODE> <name>" _scryve._tcp (macOS),
            or avahi-browse -rt _scryve._tcp (Linux)

The first seat at each table reports and the others confirm. Tables with a guest wait for the
organizer, which is the host bot on convex host and you everywhere else.

Play
  --think 1s-6s            each bot waits this long before reporting or confirming
  --race                   every player at a table reports at once
  --dispute 0              chance a bot reports a different result instead of confirming
  --drop 0                 chance each bot leaves the event after each round
  --round-gap 5s           the host bot waits this long to pair the next round
  --no-finish              the host bot leaves the event running after its last round
  --expect <n>             the host bot pairs once n players are in, so bots from other
                           processes (convex join) can fill one event past one CPU

Failure
  --disconnect-every off   cut each bot's connection this often
  --disconnect-for 5s      how long each cut lasts
  --skip-patch 0           nearby: chance a bot loses a patch and must notice the gap
  --lag off                nearby: delay each message both ways by a range like 50ms-400ms
  --legacy 0               bots that act like older apps: nearby without patches, convex
                           loading events.view instead of events.board and events.viewer

Run
  --duration 30m           stop after this long (off runs until the event finishes or Ctrl-C)
  --preview <name>         convex: defaults to this branch's preview (pnpm preview:up)
  --json                   one JSON event per line, for agents and scripts
`

// why: above the app's cap on purpose, so a run can test the refusal at the cap and a raised cap.
const MAX_PLAYERS = 512
// why: the nearby host batches changes for 250 ms, so a few seconds without updates means every bot has caught up.
const QUIET_MS = 3_000
const SEEN_TIMEOUT_MS = 60_000
// why: mirrors nearbyEventClient, so a bot comes back on the schedule a phone does.
const NEARBY_RECONNECT_MS = 2_000
const NEARBY_SILENCE_MS = 4_000
const NEARBY_PROTOCOL = 1
const MAX_TRIES = 3

function parseRange(value, name) {
  const [low, high = low] = value.split("-")
  const range = [parseDuration(low, name), parseDuration(high, name)]
  if (range[1] < range[0]) throw new Error(`--${name} takes a range like 1s-6s`)
  return range
}

function parseChance(value, name) {
  const chance = Number(value)
  if (!(chance >= 0 && chance <= 1)) throw new Error(`--${name} takes a chance from 0 to 1`)
  return chance
}

function parseTarget(positionals) {
  const [transport, first, second] = positionals
  if (transport === "convex" && first === "host") return { transport, mode: "host" }
  if (transport === "convex" && first === "join") {
    if (!second) throw new Error("convex join needs the event's code")
    return { transport, mode: "join", code: second.toUpperCase() }
  }
  if (transport === "nearby") {
    if (!first) throw new Error("nearby needs the event's code")
    const address = /^(.+):(\d+)$/.exec(second ?? "")
    if (!address) throw new Error("nearby needs the host's <ip>:<port>")
    return { transport, code: first.toUpperCase(), host: address[1], port: Number(address[2]) }
  }
  throw new Error(USAGE)
}

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      "players": { type: "string", default: "16" },
      "first": { type: "string", default: "1" },
      "guests": { type: "string", default: "0" },
      "expect": { type: "string" },
      "structure": { type: "string", default: "swiss" },
      "best-of": { type: "string" },
      "rounds": { type: "string", default: "3" },
      "format": { type: "string" },
      "think": { type: "string", default: "1s-6s" },
      "race": { type: "boolean", default: false },
      "dispute": { type: "string", default: "0" },
      "drop": { type: "string", default: "0" },
      "round-gap": { type: "string", default: "5s" },
      "finish": { type: "boolean", default: true },
      "disconnect-every": { type: "string", default: "off" },
      "disconnect-for": { type: "string", default: "5s" },
      "skip-patch": { type: "string", default: "0" },
      "lag": { type: "string", default: "off" },
      "legacy": { type: "string", default: "0" },
      "duration": { type: "string", default: "30m" },
      "preview": { type: "string" },
      "json": { type: "boolean", default: false },
      "help": { type: "boolean", short: "h", default: false },
    },
  })
  if (values.help) return { help: true }
  const target = parseTarget(positionals)
  const { structure } = values
  if (structure !== "swiss" && structure !== "pods")
    throw new Error("--structure must be swiss or pods")
  const bestOf = Number(values["best-of"] ?? (structure === "pods" ? 1 : 3))
  if (![1, 3, 5].includes(bestOf)) throw new Error("--best-of must be 1, 3 or 5")
  if (structure === "pods" && bestOf !== 1) throw new Error("Pod events play one game per round")
  const players = parseCount(values.players, "players", 1, MAX_PLAYERS)
  const guests = parseCount(values.guests, "guests", 0, MAX_PLAYERS - players)
  if (guests > 0 && target.mode !== "host")
    throw new Error("--guests needs convex host; add guests on the organizer's device instead")
  const lag = parseRange(values.lag, "lag")
  if (lag[1] > 0 && target.transport !== "nearby") throw new Error("--lag needs nearby")
  return {
    ...target,
    players,
    first: parseCount(values.first, "first", 1, 10_000),
    guests,
    expect: values.expect === undefined ? 0 : parseCount(values.expect, "expect", 1, MAX_PLAYERS),
    structure,
    bestOf,
    rounds: parseCount(values.rounds, "rounds", 1, 15),
    format: values.format ?? (structure === "pods" ? "commander" : "standard"),
    think: parseRange(values.think, "think"),
    race: values.race,
    dispute: parseChance(values.dispute, "dispute"),
    drop: parseChance(values.drop, "drop"),
    roundGap: parseDuration(values["round-gap"], "round-gap"),
    finish: values.finish,
    disconnectEvery: parseDuration(values["disconnect-every"], "disconnect-every"),
    disconnectFor: parseDuration(values["disconnect-for"], "disconnect-for"),
    skipPatch: parseChance(values["skip-patch"], "skip-patch"),
    lag,
    legacy: parseCount(values.legacy, "legacy", 0, players),
    duration: parseDuration(values.duration, "duration"),
    preview: values.preview,
    json: values.json,
  }
}

// why: mirrors standingsThroughRound in convex/lib/events/commands.ts, which Node can't require.
function standingsThroughRound(view) {
  if (view.round === 0 || view.status === "finished") return view.round
  return view.tables.every((table) => table.result != null) ? view.round : view.round - 1
}

// why: a few draws keep the tiebreakers busy; results that only win would never test them.
function randomResult(view, seats, random = Math.random) {
  if (view.structure === "pods")
    return { kind: "pod", winnerSeat: random() < 0.1 ? null : Math.floor(random() * seats) }
  const needed = (view.bestOf + 1) / 2
  if (random() < 0.05) {
    const each = Math.floor(random() * needed)
    return { kind: "match", gamesWon: [each, each], gamesDrawn: 1 }
  }
  const loserWins = Math.floor(random() * needed)
  return {
    kind: "match",
    gamesWon: random() < 0.5 ? [needed, loserWins] : [loserWins, needed],
    gamesDrawn: 0,
  }
}

function otherResult(view, table, random = Math.random) {
  const current = JSON.stringify(table.result)
  for (let tries = 0; tries < 10; tries += 1) {
    const result = randomResult(view, table.playerIds.length, random)
    if (JSON.stringify(result) !== current) return result
  }
  return table.result
}

function hasGuest(view, table) {
  const guests = new Set(view.players.filter((player) => player.guest).map((player) => player.id))
  return table.playerIds.some((id) => guests.has(id))
}

function playerMove(view, playerId, options, random = Math.random) {
  if (view.status !== "active") return undefined
  const me = view.players.find((player) => player.id === playerId)
  const table = view.tables.find((candidate) => candidate.playerIds.includes(playerId))
  if (!me || me.dropped || !table || table.result?.kind === "bye" || hasGuest(view, table))
    return undefined
  if (table.status === "open")
    return options.race || table.playerIds[0] === playerId
      ? {
          kind: "report",
          tableId: table.id,
          result: randomResult(view, table.playerIds.length, random),
        }
      : undefined
  if (table.status !== "reported" || table.reportedBy === playerId) return undefined
  return random() < options.dispute
    ? { kind: "report", tableId: table.id, result: otherResult(view, table, random) }
    : { kind: "confirm", tableId: table.id }
}

function organizerMove(view, options, ready, random = Math.random) {
  if (view.status === "registration")
    return ready && view.players.length >= (options.expect ?? 0)
      ? { kind: "startRound" }
      : undefined
  if (view.status !== "active") return undefined
  const guestTable = view.tables.find((table) => table.status === "open" && hasGuest(view, table))
  if (guestTable)
    return {
      kind: "report",
      tableId: guestTable.id,
      result: randomResult(view, guestTable.playerIds.length, random),
    }
  if (!view.tables.every((table) => table.result != null)) return undefined
  if (view.round < view.plannedRounds) return { kind: "startRound" }
  return options.finish ? { kind: "finish" } : undefined
}

// why: a command's key leaves out its random result, so a bot acts once per table state however often the view repeats.
function moveKey(move, view) {
  const table = view.tables.find((candidate) => candidate.id === move.tableId)
  return [move.kind, view.round, move.tableId, table?.status, table?.reportedBy].join(":")
}

function applyList(items, patch) {
  const gone = new Set(patch.gone)
  const changed = new Map(patch.set.map((item) => [item.id, item]))
  const known = new Set(items.map((item) => item.id))
  return [
    ...items.filter((item) => !gone.has(item.id)).map((item) => changed.get(item.id) ?? item),
    ...patch.set.filter((item) => !known.has(item.id)),
  ]
}

// why: mirrors applyHostMessage in src/features/events/nearby/nearbyEventFeed.ts; written apart from it, so wire drift shows up here as gaps or disagreement.
function applyHostMessage(feed, message) {
  if (message.t === "view")
    return { seq: message.seq ?? 0, view: message.view, standings: message.standings }
  if (!feed || message.seq !== feed.seq + 1) return undefined
  return {
    seq: message.seq,
    view: {
      ...feed.view,
      ...message.view,
      players: message.players ? applyList(feed.view.players, message.players) : feed.view.players,
      tables: message.tables
        ? applyList(feed.view.tables, message.tables).sort((a, b) => a.table - b.table)
        : feed.view.tables,
    },
    standings: message.standings ?? feed.standings,
  }
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// why: myPlayerId, isOrganizer and list order differ by phone, and would read as disagreement.
function digest(view, standings) {
  const { isOrganizer: _, myPlayerId: __, players, tables, ...fields } = view
  return JSON.stringify({
    ...fields,
    players: [...players].sort(byId),
    tables: [...tables].sort(byId),
    standings: standings ?? null,
  })
}

function percentile(values, p) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

const connectionLost = (message) => Object.assign(new Error(message), { lost: true })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const between = ([low, high]) => low + Math.random() * (high - low)

// why: Wi-Fi delays packets unevenly but TCP never reorders them. Timers due together can fire in either order, so one chain delivers each message after the one before it.
function laggedQueue(lag) {
  let last = 0
  let chain = Promise.resolve()
  return (deliver) => {
    if (!lag[1]) return deliver()
    last = Math.max(last, Date.now() + between(lag))
    const dueAt = last
    chain = chain.then(() => sleep(Math.max(0, dueAt - Date.now()))).then(deliver)
  }
}

function matches(table, expect) {
  if (!table) return false
  const sameResult = JSON.stringify(table.result) === JSON.stringify(expect.result)
  if (expect.status === "reported")
    return sameResult && (table.status === "reported" || table.status === "confirmed")
  return table.status === "confirmed" && (expect.result === undefined || sameResult)
}

class Tracker {
  constructor(report) {
    this.report = report
    this.bots = []
    this.expected = []
    this.counts = {
      sent: 0,
      ok: 0,
      refused: 0,
      lost: 0,
      reconnects: 0,
      gaps: 0,
      skipped: 0,
      seatChanges: 0,
      agreed: 0,
      disagreed: 0,
    }
    this.refusals = new Map()
    this.ack = []
    this.seen = []
    this.round = 0
    this.finished = false
  }

  sent(bot, command, view) {
    this.counts.sent += 1
    const table = view.tables.find((candidate) => candidate.id === command.tableId)
    if (!table) return
    const expect =
      command.kind === "report"
        ? { status: bot.organizer ? "confirmed" : "reported", result: command.result }
        : command.kind === "confirm"
          ? { status: "confirmed", result: table.result }
          : undefined
    if (expect)
      this.expected.push({ tableId: table.id, ...expect, sentAt: Date.now(), seenBy: new Set() })
  }

  settled(command, sentAt, error) {
    if (!error) {
      this.counts.ok += 1
      this.ack.push(Date.now() - sentAt)
      return
    }
    if (error.lost) return void (this.counts.lost += 1)
    this.refuse(command.kind, error)
  }

  refuse(kind, error) {
    this.counts.refused += 1
    // why: Convex wraps a thrown Error's text in a request id and stack, so only its first line groups.
    const text =
      error.data?.message ?? /Uncaught \w+: (.*)/.exec(error.message)?.[1] ?? error.message
    const reason = `${kind}: ${text}`
    this.refusals.set(reason, (this.refusals.get(reason) ?? 0) + 1)
  }

  observe(bot) {
    const { round, status, tables } = bot.view
    if (round > this.round || (status === "finished" && !this.finished)) {
      this.round = round
      this.finished = status === "finished"
      this.report(null, this.finished ? "finished" : "round", { round, tables: tables.length })
    }
    const now = Date.now()
    this.expected = this.expected.filter((expect) => now - expect.sentAt < SEEN_TIMEOUT_MS)
    for (const expect of this.expected) {
      if (expect.seenBy.has(bot)) continue
      if (
        !matches(
          bot.view.tables.find((table) => table.id === expect.tableId),
          expect,
        )
      )
        continue
      expect.seenBy.add(bot)
      this.seen.push(now - expect.sentAt)
    }
    clearTimeout(this.quiet)
    this.quiet = setTimeout(() => this.checkAgreement(), QUIET_MS)
  }

  checkAgreement() {
    const live = this.bots.filter((bot) => bot.view && bot.link?.current())
    if (live.length < 2) return
    const groups = new Map()
    for (const bot of live) {
      const key = digest(bot.view, bot.standings)
      groups.set(key, [...(groups.get(key) ?? []), bot.name])
    }
    if (groups.size === 1) return void (this.counts.agreed += 1)
    this.counts.disagreed += 1
    this.report(null, "disagree", {
      groups: [...groups.values()].map((names) => `${names[0]}+${names.length - 1}`).join(" "),
    })
  }

  summary() {
    clearTimeout(this.quiet)
    const ms = (values, p) => percentile(values, p) ?? "-"
    return {
      bots: this.bots.length,
      ...this.counts,
      ackP50: ms(this.ack, 50),
      ackP95: ms(this.ack, 95),
      seenP50: ms(this.seen, 50),
      seenP95: ms(this.seen, 95),
      seenMax: ms(this.seen, 100),
    }
  }
}

class Bot {
  constructor({ name, organizer = false, options, tracker, report }) {
    Object.assign(this, { name, organizer, options, tracker, report })
    this.playerId = null
    this.view = null
    this.standings = undefined
    this.ready = false
    this.done = new Set()
    this.tries = new Map()
    this.rolled = new Set()
    this.timers = []
    tracker.bots.push(this)
  }

  onView(view, standings) {
    if (!view) return
    // why: a stopped bot still takes updates, so late standings don't read as disagreement.
    this.view = view
    this.standings = standings
    this.tracker.observe(this)
    if (this.stopped) return
    if (view.status === "finished") return this.stop("event-finished")
    this.schedule()
  }

  decide() {
    const { view, options } = this
    if (this.organizer) return organizerMove(view, options, this.ready)
    const table = view.tables.find((candidate) => candidate.playerIds.includes(this.playerId))
    // why: rolling once per round keeps --drop a per-round chance however many views arrive.
    const last = view.round >= view.plannedRounds
    if (table?.status === "confirmed" && !last && !this.rolled.has(view.round)) {
      this.rolled.add(view.round)
      if (Math.random() < options.drop) return { kind: "drop", playerId: this.playerId }
    }
    return playerMove(view, this.playerId, options)
  }

  schedule() {
    if (this.pending || this.stopped || !this.view) return
    const move = this.decide()
    if (!move) return
    const key = moveKey(move, this.view)
    if (this.done.has(key)) return
    const pace = move.kind === "startRound" || move.kind === "finish"
    this.pending = setTimeout(
      () => {
        this.pending = undefined
        if (this.stopped) return
        const now = move.kind === "drop" ? move : this.decide()
        if (now && moveKey(now, this.view) === key) this.send(now, key)
        this.schedule()
      },
      pace ? this.options.roundGap : between(this.options.think),
    )
  }

  send(command, key) {
    this.done.add(key)
    const sentAt = Date.now()
    this.tracker.sent(this, command, this.view)
    if (command.kind === "drop") this.report(this, "dropping", { round: this.view.round })
    if (command.kind === "startRound") this.report(this, "pairing", { round: this.view.round + 1 })
    this.link.run(command).then(
      () => this.tracker.settled(command, sentAt),
      (error) => {
        this.tracker.settled(command, sentAt, error)
        // why: a lost connection says nothing about the command, so it retries on the view after reconnecting; a rules refusal would repeat, so those stop.
        const tries = (this.tries.get(key) ?? 0) + (error.lost ? 0 : 1)
        this.tries.set(key, tries)
        if (tries < MAX_TRIES) this.done.delete(key)
      },
    )
  }

  churn() {
    const { disconnectEvery, disconnectFor } = this.options
    if (!disconnectEvery) return
    // why: a random first cut keeps the whole room from dropping in the same instant.
    const first = setTimeout(() => {
      this.link.cut(disconnectFor)
      this.timers.push(setInterval(() => this.link.cut(disconnectFor), disconnectEvery))
    }, Math.random() * disconnectEvery)
    this.timers.push(first)
  }

  stop(reason) {
    if (this.stopped) return
    this.stopped = true
    clearTimeout(this.pending)
    for (const timer of this.timers) clearInterval(timer)
    if (reason !== "done" && reason !== "event-finished") this.report(this, "stopped", { reason })
    this.onStop?.()
  }
}

class ConvexLink {
  constructor(bot, credentials, slot, legacy) {
    Object.assign(this, { bot, credentials, legacy })
    this.inflight = new Set()
    this.identity = {
      issuer: "https://scryve-bots.invalid",
      subject: `scryve-event-bot:${slot}`,
      name: bot.name,
    }
    this.connect()
  }

  connected() {
    return !this.offline
  }

  current() {
    return this.connected()
  }

  connect() {
    this.client = new ConvexClient(this.credentials.url, { logger: false })
    this.client.setAdminAuth(this.credentials.adminKey, this.identity)
    this.offline = false
    if (this.eventId) this.watch()
  }

  async create(options) {
    await this.client.mutation(api.users.syncCurrent, { displayName: this.bot.name })
    for (const event of await this.client.query(api.events.mine, {})) {
      if (!event.isOrganizer || event.status === "finished") continue
      const fn = event.round === 0 ? api.events.remove : api.events.finish
      await this.client.mutation(fn, { eventId: event.id })
      this.bot.report(this.bot, "closed-leftover", { eventId: event.id })
    }
    const created = await this.client.mutation(api.events.create, {
      name: `Bot ${options.structure === "pods" ? "Pods" : "Swiss"} ${new Date().toTimeString().slice(0, 5)}`,
      system: "mtg",
      format: options.format,
      structure: options.structure,
      bestOf: options.bestOf,
      plannedRounds: options.rounds,
      roundMinutes: 50,
      codeCandidates: lobbyIdentifiers().manualCodeCandidates,
      joinAsPlayer: false,
    })
    this.eventId = created.eventId
    this.watch()
    return created
  }

  async join(code) {
    await this.client.mutation(api.users.syncCurrent, { displayName: this.bot.name })
    const joined = await this.client.mutation(api.events.join, { code })
    if (!joined) throw new Error(`No event has the code ${code}`)
    this.eventId = joined.eventId
    this.bot.playerId = joined.playerId
    this.watch()
  }

  watch() {
    const fail = (error) => this.bot.report(this.bot, "error", { message: error.message })
    const args = { eventId: this.eventId }
    this.through = undefined
    const show = (view) => {
      this.view = view
      if (!view) return this.bot.stop("event-gone")
      // why: the app follows standings through the last complete round, so bots load the same query.
      const through = standingsThroughRound(view)
      if (through !== this.through) {
        this.through = through
        this.unstand?.()
        this.unstand = this.client.onUpdate(
          api.events.standings,
          { ...args, throughRound: through },
          (standings) => this.bot.onView(this.view, standings ?? undefined),
          fail,
        )
      }
      this.bot.onView(view, this.bot.standings)
    }
    if (this.legacy) {
      this.unwatch = this.client.onUpdate(api.events.view, args, show, fail)
      return
    }
    // why: the app loads the shared board and its own viewer row separately, so bots load the same pair.
    const parts = {}
    const combine = () => {
      if ("board" in parts && "viewer" in parts)
        show(parts.board && parts.viewer && { ...parts.board, ...parts.viewer })
    }
    const unboard = this.client.onUpdate(
      api.events.board,
      args,
      (board) => {
        parts.board = board
        combine()
      },
      fail,
    )
    const unviewer = this.client.onUpdate(
      api.events.viewer,
      args,
      (viewer) => {
        parts.viewer = viewer
        combine()
      },
      fail,
    )
    this.unwatch = () => {
      unboard()
      unviewer()
    }
  }

  mutation(command) {
    const { eventId } = this
    switch (command.kind) {
      case "report":
        return [api.events.report, { tableId: command.tableId, result: command.result }]
      case "confirm":
        return [api.events.confirm, { tableId: command.tableId }]
      case "drop":
        return [api.events.dropPlayer, { playerId: command.playerId }]
      case "startRound":
        return [api.events.startNextRound, { eventId }]
      case "finish":
        return [api.events.finish, { eventId }]
      case "addGuest":
        return [api.events.addGuest, { eventId, name: command.name }]
    }
  }

  // why: a closed ConvexClient never settles its mutations, so a cut fails them and the bot retries once back.
  run(command) {
    if (this.offline) return Promise.reject(connectionLost("Offline"))
    return new Promise((resolve, reject) => {
      const settle = (done) => (value) => {
        this.inflight.delete(fail)
        done(value)
      }
      const fail = settle(reject)
      this.inflight.add(fail)
      this.client.mutation(...this.mutation(command)).then(settle(resolve), fail)
    })
  }

  cut(ms) {
    if (this.offline || this.bot.stopped) return
    this.offline = true
    this.bot.tracker.counts.reconnects += 1
    this.unwatch?.()
    this.unstand?.()
    void this.client.close()
    for (const fail of this.inflight) fail(connectionLost("Lost the connection"))
    setTimeout(() => !this.bot.stopped && this.connect(), ms)
  }

  async close() {
    this.unwatch?.()
    this.unstand?.()
    if (!this.offline) await this.client.close()
  }
}

class NearbyLink {
  constructor(bot, target, { patches, skipPatch, lag }) {
    Object.assign(this, { bot, target, patches, skipPatch, lag })
    // why: the host knows a device by this token, so reusing it on every reconnect must return the same seat.
    this.token = randomBytes(16).toString("hex")
    this.nextId = 1
    this.waiting = new Map()
    this.feed = undefined
  }

  connected() {
    return this.socket !== undefined && this.welcomed
  }

  // why: a bot that skipped a patch knows it is behind, so the agreement check leaves it out.
  current() {
    return this.connected() && !this.skipped
  }

  connect() {
    if (this.bot.stopped || this.rejected) return
    let buffer = ""
    this.welcomed = false
    this.skipped = false
    this.feed = undefined
    const incoming = laggedQueue(this.lag)
    const outgoing = laggedQueue(this.lag)
    // why: heartbeats share the lag, so the host's and the bot's silence checks see what a slow phone shows them.
    this.send = (line) => outgoing(() => socket.destroyed || socket.write(line))
    const socket = net.connect(this.target.port, this.target.host, () =>
      this.write({
        t: "hello",
        v: NEARBY_PROTOCOL,
        code: this.target.code,
        name: this.bot.name,
        token: this.token,
        ...(this.patches ? { patches: true } : {}),
      }),
    )
    this.socket = socket
    let lastHeard = Date.now()
    const heartbeat = setInterval(() => {
      if (Date.now() - lastHeard > NEARBY_SILENCE_MS) socket.destroy()
      else this.send("\n")
    }, 1_000)
    socket.setEncoding("utf8")
    socket.setNoDelay(true)
    socket.on("data", (chunk) =>
      incoming(() => {
        // why: a lagged chunk from a connection that has since closed belongs to a feed this bot already dropped.
        if (this.socket !== socket) return
        lastHeard = Date.now()
        buffer += chunk
        let newline
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          if (line) this.receive(JSON.parse(line))
        }
      }),
    )
    socket.on("error", () => {})
    socket.on("close", () => {
      clearInterval(heartbeat)
      if (this.socket !== socket) return
      this.socket = undefined
      for (const { reject } of this.waiting.values()) reject(connectionLost("Lost the host"))
      this.waiting.clear()
      if (this.bot.stopped || this.rejected || this.cutting) return
      this.bot.tracker.counts.reconnects += 1
      setTimeout(() => this.connect(), NEARBY_RECONNECT_MS)
    })
  }

  write(message) {
    if (this.socket) this.send(`${JSON.stringify(message)}\n`)
  }

  receive(message) {
    const { bot } = this
    switch (message.t) {
      case "welcome":
        if (bot.playerId && bot.playerId !== message.playerId) {
          bot.tracker.counts.seatChanges += 1
          bot.report(bot, "new-seat", { was: bot.playerId, now: message.playerId })
        }
        this.welcomed = true
        bot.playerId = message.playerId
        return
      case "rejected":
        this.rejected = true
        bot.tracker.refuse("join", new Error(message.code ?? message.reason))
        bot.report(bot, "rejected", { reason: message.reason, code: message.code })
        this.socket?.destroy()
        return bot.stop(`rejected-${message.reason}`)
      case "view":
      case "patch": {
        if (message.t === "patch" && Math.random() < this.skipPatch) {
          bot.tracker.counts.skipped += 1
          this.skipped = true
          // why: a skipped final patch has no next patch to reveal the gap, so a quiet host forces the resync.
          clearTimeout(this.resync)
          this.resync = setTimeout(() => this.skipped && this.socket?.destroy(), QUIET_MS)
          return
        }
        const feed = applyHostMessage(this.feed, message)
        if (!feed) {
          // why: only a gap this bot didn't make means the host lost a patch.
          if (!this.skipped) {
            bot.tracker.counts.gaps += 1
            bot.report(bot, "gap", { had: this.feed?.seq, got: message.seq })
          }
          return void this.socket?.destroy()
        }
        this.skipped = false
        clearTimeout(this.resync)
        this.feed = feed
        return bot.onView(feed.view, feed.standings)
      }
      case "done": {
        const waiting = this.waiting.get(message.id)
        this.waiting.delete(message.id)
        if (!waiting) return
        if (message.error === undefined) waiting.resolve()
        else
          waiting.reject(
            new Error(message.code ? `${message.error} (${message.code})` : message.error),
          )
      }
    }
  }

  run(command) {
    if (!this.connected()) return Promise.reject(connectionLost("Not connected to the host"))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject })
      this.write({ t: "do", id, command })
    })
  }

  cut(ms) {
    if (!this.socket || this.bot.stopped) return
    this.cutting = true
    this.socket.destroy()
    setTimeout(() => {
      this.cutting = false
      this.bot.tracker.counts.reconnects += 1
      this.connect()
    }, ms)
  }

  close() {
    this.rejected = true
    this.socket?.destroy()
  }
}

async function startConvex(options, tracker, report, bots) {
  const preview = options.preview ?? currentPreviewName()
  const credentials = await previewCredentials(previewKey(), preview)
  report(null, "preview", { name: preview, deployment: credentials.deploymentName })
  const player = (slot) => {
    const bot = new Bot({ name: `Bot ${slot}`, options, tracker, report })
    bot.link = new ConvexLink(bot, credentials, slot, slot - options.first < options.legacy)
    bots.push(bot)
    return bot
  }
  let code = options.code
  let organizer
  if (options.mode === "host") {
    organizer = new Bot({ name: "Host Bot", organizer: true, options, tracker, report })
    organizer.link = new ConvexLink(organizer, credentials, 0)
    bots.push(organizer)
    const created = await organizer.link.create(options)
    code = created.code
    report(organizer, "event", { code, eventId: created.eventId })
  }
  const last = options.first + options.players
  const joins = []
  for (let slot = options.first; slot < last; slot += 1) {
    const bot = player(slot)
    // why: a refusal must be handled the moment it lands; one left for later during the sleep below ends the process.
    joins.push(
      bot.link.join(code).then(
        () => bot.churn(),
        (error) => {
          tracker.refuse("join", error)
          bot.stop("join-failed")
          return error
        },
      ),
    )
    // why: a room checks in over minutes; 50 ms apart still races the event's player count.
    await sleep(50)
  }
  const failed = (await Promise.all(joins)).filter((result) => result instanceof Error)
  report(null, "joined", { bots: options.players - failed.length, code })
  if (!organizer) return
  for (let guest = 1; guest <= options.guests; guest += 1)
    await organizer.link.run({ kind: "addGuest", name: `Guest ${guest}` })
  organizer.ready = true
  organizer.schedule()
}

async function startNearby(options, tracker, report, bots) {
  const last = options.first + options.players
  for (let slot = options.first; slot < last; slot += 1) {
    const bot = new Bot({ name: `Bot ${slot}`, options, tracker, report })
    bot.link = new NearbyLink(bot, options, {
      patches: slot - options.first >= options.legacy,
      skipPatch: options.skipPatch,
      lag: options.lag,
    })
    bots.push(bot)
    bot.link.connect()
    bot.churn()
    await sleep(20)
  }
  report(null, "connecting", { bots: options.players, host: `${options.host}:${options.port}` })
}

async function main() {
  const options = parseCli(process.argv.slice(2))
  if (options.help) return void console.log(USAGE)
  const report = createReporter(options.json)
  const tracker = new Tracker(report)
  const bots = []
  try {
    if (options.transport === "convex") await startConvex(options, tracker, report, bots)
    else await startNearby(options, tracker, report, bots)
  } catch (error) {
    report(null, "setup-failed", { message: error.message })
    await Promise.allSettled(bots.map((bot) => bot.link?.close()))
    process.exitCode = 1
    return
  }
  await new Promise((resolve) => {
    let running = bots.filter((bot) => !bot.stopped).length
    if (running === 0) return resolve()
    for (const bot of bots) bot.onStop = () => --running === 0 && resolve()
    const timeout = options.duration ? setTimeout(resolve, options.duration) : undefined
    process.once("SIGINT", () => {
      clearTimeout(timeout)
      resolve()
    })
  })
  for (const bot of bots) bot.stop("done")
  // why: the quiet timer runs the last agreement check once the final updates land.
  await sleep(QUIET_MS + 500)
  report(null, "summary", tracker.summary())
  for (const [reason, count] of tracker.refusals) report(null, "refused", { reason, count })
  await Promise.allSettled(bots.map((bot) => bot.link?.close()))
  process.exit()
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = {
  applyHostMessage,
  digest,
  laggedQueue,
  moveKey,
  organizerMove,
  parseCli,
  playerMove,
  randomResult,
}
