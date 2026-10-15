import TcpSocket from "react-native-tcp-socket"
import Zeroconf, { type Service } from "react-native-zeroconf"

// why: iOS only browses Bonjour types listed in NSBonjourServices, so renaming this needs app.config.ts too.
export const LAN_SERVICE_TYPE = "scryve"
const LAN_PROTOCOL = "tcp"
const CONNECT_TIMEOUT_MS = 2_500
const HEARTBEAT_MS = 1_000
// why: a peer that loses Wi-Fi never sends a close, so silence is the only sign the socket is dead.
const SILENCE_LIMIT_MS = 4_000

type Socket = ReturnType<typeof TcpSocket.createConnection>

export interface LanConnection<Out> {
  send: (message: Out) => void
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

const zeroconf = new Zeroconf()

export const checkLocalNetworkAccess = () =>
  zeroconf.checkLocalNetworkAccess({ type: LAN_SERVICE_TYPE, protocol: LAN_PROTOCOL })

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
  zeroconf.resolveService({ name, type: LAN_SERVICE_TYPE, protocol: LAN_PROTOCOL, timeout: 3_000 })

// why: TCP has no message boundaries; one chunk can hold half a message or several.
export function createLineReader(onLine: (line: string) => void) {
  let buffer = ""
  return (chunk: string) => {
    buffer += chunk
    let newline = buffer.indexOf("\n")
    while (newline !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line) onLine(line)
      newline = buffer.indexOf("\n")
    }
  }
}

function wrapSocket<In, Out>(
  socket: Socket,
  parse: (line: string) => In | null,
  handlers: LanPeerHandlers<In>,
): LanConnection<Out> {
  let lastHeard = Date.now()
  let closed = false
  const read = createLineReader((line) => {
    try {
      const message = parse(line)
      if (message) handlers.onMessage(message)
    } catch {
      socket.destroy()
    }
  })
  // why: empty lines double as heartbeats, which the line reader already skips.
  const heartbeat = setInterval(() => {
    if (Date.now() - lastHeard > SILENCE_LIMIT_MS) socket.destroy()
    else socket.write("\n")
  }, HEARTBEAT_MS)
  socket.setEncoding("utf8")
  socket.on("data", (data) => {
    lastHeard = Date.now()
    read(String(data))
  })
  socket.on("error", () => socket.destroy())
  socket.on("close", () => {
    clearInterval(heartbeat)
    if (closed) return
    closed = true
    handlers.onClose()
  })
  return {
    send: (message) => socket.write(`${JSON.stringify(message)}\n`),
    close: () => socket.destroy(),
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
      zeroconf
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
              await zeroconf.unpublishService(published.name).catch(() => null)
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
