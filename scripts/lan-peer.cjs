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

let seatKey
const log = (line) => console.log(`${new Date().toISOString().slice(11, 23)} ${line}`)
let gameId
let writes = 0
let active = false

const socket = net.connect(Number(port), host, () => {
  log(`connected to ${host}:${port}`)
  send({ type: "join", protocol: 2, name })
})
const send = (message) => socket.write(`${JSON.stringify(message)}\n`)

let buffer = ""
socket.setEncoding("utf8")
socket.setNoDelay(true)
socket.on("data", (chunk) => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    if (!line) continue
    const message = JSON.parse(line)
    if (message.type === "rejected") log(`rejected: ${message.reason}`)
    if (message.type === "welcome") seatKey = message.pass.key
    if (message.type === "nack") log(`refused ${message.operationId}: ${message.message}`)
    if (message.type !== "state") continue
    const { lobby, projection } = message
    gameId = projection.publicId
    active = lobby.status === "active"
    log(
      `${lobby.status}: ${projection.players.map((p) => `${p.displayName}=${p.currentLife}`).join(" ")}`,
    )
  }
})
socket.on("error", (error) => log(`error: ${error.message}`))
socket.on("close", () => process.exit(0))

const heartbeat = setInterval(() => socket.write("\n"), 1000)
const lose = setInterval(() => {
  if (!active) return
  writes += 1
  send({
    type: "op",
    event: {
      type: "life.changed",
      operationId: `peer-${process.pid}-${String(writes).padStart(10, "0")}`,
      gameId,
      actorId: seatKey,
      deviceId: "peer-device",
      clientCreatedAt: Date.now(),
      playerId: seatKey,
      delta: -1,
    },
  })
}, 3000)
process.on("exit", () => [heartbeat, lose].forEach((timer) => timer.unref()))
