import { Buffer } from "buffer"
import TcpSocket from "react-native-tcp-socket"
import Zeroconf, { type Service } from "react-native-zeroconf"

import { createLineReader } from "./lineReader"

// why: iOS only browses Bonjour types listed in NSBonjourServices, so renaming this needs app.config.ts too.
export const LAN_SERVICE_TYPE = "scryve"
const LAN_PROTOCOL = "tcp"
const CONNECT_TIMEOUT_MS = 2_500
const RESOLVE_TIMEOUT_SECONDS = 3
const HEARTBEAT_MS = 1_000
// why: a peer that loses Wi-Fi never sends a close, so silence is the only sign the socket is dead.
const SILENCE_LIMIT_MS = 4_000

type Socket = ReturnType<typeof TcpSocket.createConnection>

export interface LanConnection<Out> {
  send: (message: Out) => void
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

// why: react-native-zeroconf advertises a throwaway service of our type while it checks permission.
export const isLanGameService = (service: Service) => !service.name.startsWith("rnzeroconf-")

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
    else socket.write("\n")
  }, HEARTBEAT_MS)
  socket.on("data", (data) => {
    lastHeard = Date.now()
    try {
      read(typeof data === "string" ? Buffer.from(data) : data)
    } catch {
      shutdown()
    }
  })
  socket.on("error", shutdown)
  socket.on("close", shutdown)
  let ending = false
  return {
    send: (message) => {
      if (!closed && !ending) socket.write(`${JSON.stringify(message)}\n`)
    },
    sendAndClose: (message) => {
      if (closed || ending) return
      ending = true
      socket.end(`${JSON.stringify(message)}\n`)
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
