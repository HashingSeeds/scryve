import type { LanGuestMessage, LanHostMessage } from "./lanGame"
import { LanSession } from "./lanSession"
import { hostLan, type LanConnection, type LanPeerHandlers } from "./lanTransport"

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
