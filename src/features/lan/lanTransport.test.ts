import { DeviceEventEmitter, NativeModules } from "react-native"
import { Buffer } from "buffer"
import type { Service } from "react-native-zeroconf"

const tcpSockets = {
  connect: jest.fn((_id: number) => {}),
  write: jest.fn((_id: number, _base64: string) => {}),
  setNoDelay: jest.fn(),
  destroy: jest.fn(),
  end: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
}
NativeModules.TcpSockets = tcpSockets

// why: Node's own Buffer would stand in for the npm polyfill that tcp-socket gets in the app.
jest.mock("buffer", () => jest.requireActual("buffer/"))
jest.mock("react-native-zeroconf", () => jest.fn())

// why: tcp-socket reads NativeModules.TcpSockets when it loads, so it has to load after the mock above.
const { connectLan } = jest.requireActual<typeof import("./lanTransport")>("./lanTransport")

const service: Service = {
  name: "Host",
  fullName: "Host._scryve._tcp.local.",
  host: "host.local",
  port: 4000,
  addresses: ["192.168.1.2"],
  ipv4: ["192.168.1.2"],
  ipv6: [],
  txt: {},
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

async function connected() {
  const messages: unknown[] = []
  const pending = connectLan<unknown, unknown>(service, (line) => JSON.parse(line), {
    onMessage: (message) => messages.push(message),
    onClose: jest.fn(),
  })
  const id = tcpSockets.connect.mock.lastCall?.[0]
  DeviceEventEmitter.emit("connect", { id, connection: {} })
  const connection = await pending
  tcpSockets.write.mockClear()
  const written = () => tcpSockets.write.mock.calls.map(([, base64]) => base64)
  const receive = (bytes: Uint8Array) =>
    DeviceEventEmitter.emit("data", { id, data: Buffer.from(bytes).toString("base64") })
  return { connection, messages, written, receive }
}

describe("nearby socket", () => {
  it("writes non-ASCII names as ASCII JSON that any peer reads back the same", async () => {
    const { connection, written } = await connected()
    const players = [{ name: "José" }, { name: "Zoë 🐉" }]

    connection.send(...players)

    expect(written()).toHaveLength(1)
    const text = Buffer.from(written()[0], "base64").toString("utf8")
    expect(text).toMatch(/^[\x00-\x7f]*$/)
    const lines = text.split("\n").filter(Boolean)
    expect(lines.map((line) => JSON.parse(line))).toEqual(players)
  })

  it("reads a peer's raw UTF-8 even when an emoji splits across chunks", async () => {
    const { messages, receive } = await connected()
    const bytes = Buffer.from('{"name":"Zoë 🐉"}\n\n{"name":"José"}\n')
    const insideDragon = bytes.indexOf(0xf0) + 2

    receive(bytes.subarray(0, insideDragon))
    receive(bytes.subarray(insideDragon))

    expect(messages).toEqual([{ name: "Zoë 🐉" }, { name: "José" }])
  })
})
