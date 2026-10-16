import type { LanGuestMessage, LanHostMessage } from "./lanGame"
import { LanSession } from "./lanSession"
import { connectLan, hostLan, type LanConnection, type LanPeerHandlers } from "./lanTransport"

jest.mock("./lanTransport", () => ({
  hostLan: jest.fn(),
  connectLan: jest.fn(),
  resolveLanService: jest.fn(),
}))

type Accept = (peer: LanConnection<LanHostMessage>) => LanPeerHandlers<LanGuestMessage>

let accept: Accept

beforeEach(() => {
  jest.useFakeTimers()
  jest.mocked(hostLan).mockImplementation(async (name, _parse, onPeer) => {
    accept = onPeer as Accept
    return { name, stop: async () => {} }
  })
})

afterEach(() => jest.useRealTimers())

function socket() {
  const sent: LanHostMessage[] = []
  const peer = {
    send: (message: LanHostMessage) => sent.push(message),
    sendAndClose: (message: LanHostMessage) => sent.push(message),
    close: jest.fn(),
  }
  const handlers = accept(peer)
  const welcome = () => sent.find((message) => message.type === "welcome")
  return {
    sent,
    peer,
    send: (message: LanGuestMessage) => handlers.onMessage(message),
    pass: () => {
      const message = welcome()
      if (message?.type !== "welcome") throw new Error("no welcome")
      return message.pass
    },
  }
}

async function startedGame() {
  const session = new LanSession()
  await session.host()
  const alice = socket()
  alice.send({ type: "join", name: "Alice" })
  const bob = socket()
  bob.send({ type: "join", name: "Bob" })
  session.start(20)
  jest.advanceTimersByTime(50)
  return { session, alice, bob }
}

const lifeOf = (session: LanSession, key: string) =>
  session.getState().game?.seats.find((seat) => seat.key === key)?.life

describe("LAN session broadcasts", () => {
  it("sends an idle host's change at once and batches a burst into the next window", async () => {
    const { session, alice } = await startedGame()
    const hostKey = session.getState().seatKey!
    const games = () => alice.sent.filter((message) => message.type === "game").length
    jest.advanceTimersByTime(1_000)
    const before = games()

    session.changeLife(hostKey, -1)
    jest.advanceTimersByTime(0)
    session.changeLife(hostKey, -1)
    session.changeLife(hostKey, -1)
    jest.advanceTimersByTime(32)
    const duringWindow = games()
    jest.advanceTimersByTime(1)

    expect([duringWindow - before, games() - before]).toEqual([1, 2])
    expect(lifeOf(session, hostKey)).toBe(17)
  })
})

describe("LAN session seats", () => {
  it("turns away a socket that names another guest's seat without its token", async () => {
    const { alice } = await startedGame()
    const thief = socket()

    thief.send({ type: "join", name: "Thief", pass: { key: alice.pass().key, token: "guess" } })

    expect(thief.sent).toEqual([
      { type: "rejected", reason: "That seat belongs to another device." },
    ])
    expect(alice.peer.close).not.toHaveBeenCalled()
  })

  it("turns away a socket that names the host's seat", async () => {
    const { session } = await startedGame()
    const thief = socket()

    thief.send({
      type: "join",
      name: "Thief",
      pass: { key: session.getState().seatKey!, token: "" },
    })

    expect(thief.sent[0]).toMatchObject({ type: "rejected" })
  })

  it("applies a guest's life change only to that guest's own seat", async () => {
    const { session, alice, bob } = await startedGame()

    bob.send({ type: "life", life: 7, version: 1, round: 1 })
    jest.advanceTimersByTime(50)

    expect(lifeOf(session, bob.pass().key)).toBe(7)
    expect(lifeOf(session, alice.pass().key)).toBe(20)
    expect(lifeOf(session, session.getState().seatKey!)).toBe(20)
  })

  it("ignores a version so large the seat could never be written again", async () => {
    const { session, bob } = await startedGame()

    bob.send({ type: "life", life: 1, version: 1e308, round: 1 })
    bob.send({ type: "life", life: 15, version: 1, round: 1 })
    jest.advanceTimersByTime(50)

    expect(lifeOf(session, bob.pass().key)).toBe(15)
  })
})

describe("LAN session guest", () => {
  it("keeps its seat on the board after the host ends the game", async () => {
    let host: LanPeerHandlers<LanHostMessage> | undefined
    jest.mocked(connectLan).mockImplementation(async (_service, _parse, handlers) => {
      host = handlers as LanPeerHandlers<LanHostMessage>
      return { send: jest.fn(), sendAndClose: jest.fn(), close: jest.fn() }
    })
    const { session: hostSession } = await startedGame()
    const guest = new LanSession()
    await guest.join({ name: "Host game" } as Parameters<LanSession["join"]>[0])
    const pass = { key: "seat-guest", token: "token" }
    host?.onMessage({ type: "welcome", pass })
    const game = hostSession.getState().game!

    host?.onMessage({ type: "game", game: { ...game, status: "abandoned" } })

    expect(guest.getState()).toMatchObject({
      status: "idle",
      seatKey: pass.key,
      game: { status: "abandoned" },
    })
  })
})
