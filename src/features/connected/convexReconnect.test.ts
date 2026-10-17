import { addNetworkStateListener, type NetworkState, NetworkStateType } from "expo-network"
import { ConvexReactClient } from "convex/react"

import { reconnectAfterOutage, reconnectConvexOnNetworkReturn } from "./convexReconnect"

const sockets: FakeSocket[] = []

class FakeSocket {
  onopen: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  constructor() {
    sockets.push(this)
  }
  send() {}
  close() {}
  open() {
    this.onopen?.()
  }
  drop() {
    this.onclose?.({ code: 1006, reason: "" })
  }
}

// why: Convex publishes connection state on a microtask.
const settle = async () => {
  for (let tick = 0; tick < 3; tick++) await Promise.resolve()
}

function connectedClient() {
  const client = new ConvexReactClient("https://example.convex.cloud", {
    webSocketConstructor: FakeSocket as unknown as typeof WebSocket,
    unsavedChangesWarning: false,
    logger: false,
  })
  client.connectionState()
  sockets[0].open()
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

const online = { isConnected: true, isInternetReachable: true }
const offline = { isConnected: false, isInternetReachable: false }

describe("reconnectConvexOnNetworkReturn", () => {
  // why: this reaches Convex's private reconnect. If it fails after a Convex upgrade, native apps are back on full backoff.
  it("opens a new Convex socket as soon as the network returns, without waiting out backoff", async () => {
    const emit = connectedClient()
    emit(online)
    emit(offline)
    sockets[0].drop()
    await settle()
    emit({ ...online, isInternetReachable: false })
    expect(sockets).toHaveLength(1)

    emit(online)

    expect(sockets).toHaveLength(2)
  })

  it("retries on the first usable network, so a launch while offline recovers too", async () => {
    const emit = connectedClient()
    sockets[0].drop()
    await settle()

    emit(online)

    expect(sockets).toHaveLength(2)
  })

  it("skips the backoff once more when an attempt already in flight at network return fails", async () => {
    const emit = connectedClient()
    emit(online)
    emit(offline)
    sockets[0].drop()
    jest.runOnlyPendingTimers()
    expect(sockets).toHaveLength(2)

    emit(online)
    expect(sockets).toHaveLength(2)
    sockets[1].drop()
    await settle()

    expect(sockets).toHaveLength(3)
    sockets[2].drop()
    await settle()
    expect(sockets).toHaveLength(3)
  })

  it("keeps Convex's backoff while the same network stays up, and retries when another takes over", async () => {
    const emit = connectedClient()
    emit({ ...online, type: NetworkStateType.CELLULAR })
    sockets[0].drop()
    await settle()
    emit({ ...online, type: NetworkStateType.CELLULAR })
    expect(sockets).toHaveLength(1)

    emit({ ...online, type: NetworkStateType.WIFI })
    expect(sockets).toHaveLength(2)
  })
})

describe("reconnectAfterOutage", () => {
  it("skips the backoff now, and once more if the attempt already in flight fails", async () => {
    const client = new ConvexReactClient("https://example.convex.cloud", {
      webSocketConstructor: FakeSocket as unknown as typeof WebSocket,
      unsavedChangesWarning: false,
      logger: false,
    })
    client.connectionState()
    sockets[0].open()
    sockets[0].drop()
    jest.runOnlyPendingTimers()
    expect(sockets).toHaveLength(2)

    reconnectAfterOutage(client)
    expect(sockets).toHaveLength(2)
    sockets[1].drop()
    await settle()

    expect(sockets).toHaveLength(3)
    sockets[2].drop()
    await settle()
    expect(sockets).toHaveLength(3)
  })
})
