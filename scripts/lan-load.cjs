// why: a full table tapping fast is the load nearby games must survive, and no unit test runs a real host.
const { Buffer } = require("node:buffer")
const net = require("node:net")
const { clearInterval, setInterval, setTimeout } = require("node:timers")

const [host, port, guestCount = "7", rate = "5", seconds = "30"] = process.argv.slice(2)
if (!host || !port) {
  console.error("Usage: node scripts/lan-load.cjs <ip> <port> [guests] [tapsPerSecond] [seconds]")
  process.exit(1)
}

const latencies = []
let bytesIn = 0
let messagesIn = 0
let rejected = 0
let closedEarly = 0
let refusedWrites = 0

function guest(index) {
  let seatKey
  let gameId
  let writes = 0
  const sent = new Map()
  let active = false
  let buffer = ""
  let tapper
  const socket = net.connect(Number(port), host, () =>
    socket.write(`${JSON.stringify({ type: "join", protocol: 2, name: `Load ${index}` })}\n`),
  )
  socket.setEncoding("utf8")
  socket.setNoDelay(true)
  socket.on("data", (chunk) => {
    bytesIn += Buffer.byteLength(chunk)
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (!line) continue
      messagesIn += 1
      const message = JSON.parse(line)
      if (message.type === "rejected") rejected += 1
      if (message.type === "welcome") seatKey = message.pass.key
      if (message.type === "nack") refusedWrites += 1
      if (message.type === "ack") {
        const sentAt = sent.get(message.operationId)
        if (sentAt !== undefined) latencies.push(Date.now() - sentAt)
        sent.delete(message.operationId)
      }
      if (message.type !== "state") continue
      gameId = message.projection.publicId
      active = message.lobby.status === "active"
    }
  })
  socket.on("close", () => {
    clearInterval(tapper)
    if (!stopping) closedEarly += 1
  })
  socket.on("error", () => {})
  const heartbeat = setInterval(() => socket.write("\n"), 1000)
  tapper = setInterval(
    () => {
      if (!active) return
      writes += 1
      const operationId = `load-${index}-${String(writes).padStart(10, "0")}`
      const event = {
        type: "life.changed",
        operationId,
        gameId,
        actorId: seatKey,
        deviceId: `load-device-${index}`,
        clientCreatedAt: Date.now(),
        playerId: seatKey,
        delta: -1,
      }
      sent.set(operationId, Date.now())
      socket.write(`${JSON.stringify({ type: "op", event })}\n`)
    },
    1000 / Number(rate),
  )
  return () => {
    clearInterval(heartbeat)
    clearInterval(tapper)
    socket.destroy()
  }
}

let stopping = false
const stops = Array.from({ length: Number(guestCount) }, (_, index) => guest(index + 1))
const startedAt = Date.now()

setTimeout(
  () => {
    stopping = true
    stops.forEach((stop) => stop())
    const sorted = [...latencies].sort((a, b) => a - b)
    const at = (p) =>
      sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))] ?? 0
    const elapsed = (Date.now() - startedAt) / 1000
    console.log(
      JSON.stringify(
        {
          guests: Number(guestCount),
          tapsPerSecond: Number(rate),
          seconds: elapsed,
          acknowledgedTaps: sorted.length,
          latencyMs: { p50: at(50), p90: at(90), p99: at(99), max: sorted.at(-1) ?? 0 },
          broadcastsPerSecond: Math.round(messagesIn / elapsed),
          kilobytesPerSecond: Math.round(bytesIn / 1024 / elapsed),
          rejected,
          refusedWrites,
          closedEarly,
        },
        null,
        2,
      ),
    )
    process.exit(0)
  },
  Number(seconds) * 1000,
)
