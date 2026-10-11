import { addNetworkStateListener, type NetworkState } from "expo-network"
import { ConvexReactClient } from "convex/react"

import { reconnectConvexOnNetworkReturn } from "./convexReconnect"

const sockets: FakeSocket[] = []

class FakeSocket {
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  constructor() {
    sockets.push(this)
  }
  send() {}
  close() {}
  drop() {
    this.onclose?.({ code: 1006, reason: "" })
  }
}

function connectedClient() {
  const client = new ConvexReactClient("https://example.convex.cloud", {
    webSocketConstructor: FakeSocket as unknown as typeof WebSocket,
    unsavedChangesWarning: false,
    logger: false,
  })
  client.connectionState()
  reconnectConvexOnNetworkReturn(client)
  const listener = jest.mocked(addNetworkStateListener).mock.calls.at(-1)![0]
  return (state: NetworkState) => listener(state)
}

beforeEach(() => {
  jest.useFakeTimers()
  sockets.length = 0
})

afterEach(() => {
  jest.useRealTimers()
})

describe("reconnectConvexOnNetworkReturn", () => {
  // why: this reaches Convex's private reconnect. If it fails after a Convex upgrade, native apps are back on full backoff.
  it("opens a new Convex socket as soon as the network returns, without waiting out backoff", () => {
    const emit = connectedClient()
    emit({ isConnected: false, isInternetReachable: false })
    sockets[0].drop()
    expect(sockets).toHaveLength(1)

    emit({ isConnected: true, isInternetReachable: true })

    expect(sockets).toHaveLength(2)
  })

  it("waits for a validated network and ignores updates while the network stays up", () => {
    const emit = connectedClient()
    sockets[0].drop()
    emit({ isConnected: true, isInternetReachable: true })
    expect(sockets).toHaveLength(1)

    emit({ isConnected: false, isInternetReachable: false })
    emit({ isConnected: true, isInternetReachable: false })
    expect(sockets).toHaveLength(1)
    emit({ isConnected: true, isInternetReachable: true })
    expect(sockets).toHaveLength(2)
  })
})
