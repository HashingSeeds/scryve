// why: a non-iOS LAN guest catches wire-format drift that only React Native peers would hide.
const net = require("node:net")
const { setInterval } = require("node:timers")

const [host, port, name = "Mac"] = process.argv.slice(2)
if (!host || !port) {
  console.error(
    "Usage: node scripts/lan-peer.cjs <ip> <port> [name] (port: dns-sd -L <game> _scryve._tcp)",
  )
  process.exit(1)
}

const playerId = `mac-${name}`
const log = (line) => console.log(`${new Date().toISOString().slice(11, 23)} ${line}`)
let own = { life: 0, version: 0 }
let active = false

const socket = net.connect(Number(port), host, () => {
  log(`connected to ${host}:${port}`)
  send({ type: "join", playerId, name })
})
const send = (message) => socket.write(`${JSON.stringify(message)}\n`)

let buffer = ""
socket.setEncoding("utf8")
socket.on("data", (chunk) => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    if (!line) continue
    const message = JSON.parse(line)
    if (message.type === "rejected") log(`rejected: ${message.reason}`)
    if (message.type !== "game") continue
    const { game } = message
    active = game.status === "active"
    const seat = game.seats.find((candidate) => candidate.playerId === playerId)
    if (seat && seat.version >= own.version) own = { life: seat.life, version: seat.version }
    log(`${game.status}: ${game.seats.map((s) => `${s.name}=${s.life}`).join(" ")}`)
  }
})
socket.on("error", (error) => log(`error: ${error.message}`))
socket.on("close", () => process.exit(0))

const heartbeat = setInterval(() => socket.write("\n"), 1000)
const lose = setInterval(() => {
  if (!active) return
  own = { life: own.life - 1, version: own.version + 1 }
  send({ type: "life", ...own })
}, 3000)
process.on("exit", () => [heartbeat, lose].forEach((timer) => timer.unref()))
