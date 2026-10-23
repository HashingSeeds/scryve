import { Buffer } from "buffer"
import TcpSocket from "react-native-tcp-socket"
import Zeroconf, { type Service } from "react-native-zeroconf"

import { createLineReader } from "./lineReader"

// why: iOS only browses Bonjour types listed in NSBonjourServices, so renaming this needs app.config.ts too.
export const LAN_SERVICE_TYPE = "scryve"
const LAN_PROTOCOL = "tcp"
const CONNECT_TIMEOUT_MS = 2_500
const RESOLVE_TIMEOUT_SECONDS = 3
// why: phone Wi-Fi radios doze between packets, and a dozing host on a real table held 1 in 10 changes for 300+ ms; traffic every 200 ms keeps the radio awake at no measurable battery cost.
const HEARTBEAT_MS = 200
// why: a peer that loses Wi-Fi never sends a close, so silence is the only sign the socket is dead.
const SILENCE_LIMIT_MS = 4_000

type Socket = ReturnType<typeof TcpSocket.createConnection>

const NON_ASCII = /[^\x00-\x7f]/g

// why: btoa takes one byte per char, and peers on any version parse the \u escapes back to the same text.
const asciiLine = (message: unknown) =>
  `${JSON.stringify(message).replace(NON_ASCII, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`)}\n`

// why: tcp-socket base64-encodes each write with its JS Buffer polyfill, the host's biggest JS cost. It only reads byteLength and toString("base64") from a Buffer, so this one hands native Hermes' btoa output as-is.
function wire(text: string) {
  const base64 = btoa(text)
  return Object.defineProperties(Buffer.alloc(0), {
    byteLength: { value: text.length },
    toString: { value: () => base64 },
  })
}

export interface LanConnection<Out> {
  send: (...messages: Out[]) => void
  sendAndClose: (message: Out) => void
  close: () => void
}

export interface LanPeerHandlers<In> {
  onMessage: (message: In) => void
  onClose: () => void
}

export interface LanHost {
  name: string
  stop: () => Promise<void>
}

// why: the constructor throws without the native module, so creating it on import crashes web.
let zeroconfInstance: Zeroconf | undefined
const zeroconf = () => (zeroconfInstance ??= new Zeroconf())

export const checkLocalNetworkAccess = () =>
  zeroconf().checkLocalNetworkAccess({ type: LAN_SERVICE_TYPE, protocol: LAN_PROTOCOL })

// why: react-native-zeroconf advertises a throwaway service of our type while it checks permission, and nearby events share our type.
export const isLanGameService = (service: Service) =>
  !service.name.startsWith("rnzeroconf-") && !service.name.startsWith("event-")

// why: a USB or VPN link-local address resolves too, but other players usually cannot reach it.
export function lanAddresses(service: Service) {
  const linkLocal = (address: string) => address.startsWith("169.254.")
  const ordered = [
    ...service.ipv4.filter((address) => !linkLocal(address)),
    ...service.ipv4.filter(linkLocal),
  ]
  return ordered.length > 0 ? ordered : [service.host]
}

export const resolveLanService = (name: string) =>
  zeroconf().resolveService({
    name,
    type: LAN_SERVICE_TYPE,
    protocol: LAN_PROTOCOL,
    timeout: RESOLVE_TIMEOUT_SECONDS,
  })

function wrapSocket<In, Out>(
  socket: Socket,
  parse: (line: string) => In | null,
  handlers: LanPeerHandlers<In>,
): LanConnection<Out> {
  socket.setNoDelay(true)
  // why: our tcp-socket patch hands base64 data straight from native, so Hermes' atob decodes it instead of the JS Buffer polyfill.
  socket.setEncoding("base64")
  let lastHeard = Date.now()
  let closed = false
  // why: tcp-socket throws on writes after destroy, and its close event can arrive well after, so shut down at once.
  const shutdown = () => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    socket.destroy()
    handlers.onClose()
  }
  const read = createLineReader((line) => {
    try {
      const message = parse(line)
      if (message) handlers.onMessage(message)
    } catch {
      shutdown()
    }
  })
  // why: empty lines double as heartbeats, which the line reader already skips.
  const heartbeat = setInterval(() => {
    if (Date.now() - lastHeard > SILENCE_LIMIT_MS) shutdown()
    else socket.write(wire("\n"))
  }, HEARTBEAT_MS)
  socket.on("data", (data) => {
    lastHeard = Date.now()
    try {
      read(atob(typeof data === "string" ? data : data.toString("base64")))
    } catch {
      shutdown()
    }
  })
  socket.on("error", shutdown)
  socket.on("close", shutdown)
  let ending = false
  return {
    send: (...messages) => {
      if (!closed && !ending) socket.write(wire(messages.map(asciiLine).join("")))
    },
    sendAndClose: (message) => {
      if (closed || ending) return
      ending = true
      socket.end(wire(asciiLine(message)))
      setTimeout(shutdown, SILENCE_LIMIT_MS)
    },
    close: shutdown,
  }
}

export function hostLan<In, Out>(
  name: string,
  parse: (line: string) => In | null,
  onPeer: (peer: LanConnection<Out>) => LanPeerHandlers<In>,
  onServerClosed: () => void,
): Promise<LanHost> {
  return new Promise((resolve, reject) => {
    const server = TcpSocket.createServer((socket) => {
      const peer = wrapSocket<In, Out>(socket, parse, {
        onMessage: (message) => handlers.onMessage(message),
        onClose: () => handlers.onClose(),
      })
      const handlers = onPeer(peer)
    })
    let listening = false
    server.on("error", (error) => (listening ? onServerClosed() : reject(error)))
    server.on("close", () => listening && onServerClosed())
    server.listen({ port: 0, host: "0.0.0.0" }, () => {
      const address = server.address()
      if (!address) return reject(new Error("Server has no address"))
      zeroconf()
        .publishService({
          type: LAN_SERVICE_TYPE,
          protocol: LAN_PROTOCOL,
          name,
          port: address.port,
        })
        .then((published) => {
          listening = true
          resolve({
            name: published.name,
            stop: async () => {
              listening = false
              server.close()
              await zeroconf()
                .unpublishService(published.name)
                .catch(() => null)
            },
          })
        })
        .catch((error: unknown) => {
          server.close()
          reject(error)
        })
    })
  })
}

export function connectLan<In, Out>(
  service: Service,
  parse: (line: string) => In | null,
  handlers: LanPeerHandlers<In>,
): Promise<LanConnection<Out>> {
  const [host, ...rest] = lanAddresses(service)
  return new Promise((resolve, reject) => {
    let opened = false
    const socket = TcpSocket.createConnection(
      { host, port: service.port, connectTimeout: CONNECT_TIMEOUT_MS },
      () => {
        opened = true
        resolve(wrapSocket<In, Out>(socket, parse, handlers))
      },
    )
    socket.on("error", (error) => {
      if (opened) return
      socket.destroy()
      if (rest.length === 0) return reject(error)
      connectLan<In, Out>({ ...service, ipv4: rest }, parse, handlers).then(resolve, reject)
    })
  })
}
