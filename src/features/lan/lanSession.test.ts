import {
  admitLanGuest,
  claimLanCommanderDamage,
  createLanGame,
  startLanGame,
  type LanGuestMessage,
  type LanHostMessage,
} from "./lanGame"
import { LanSession } from "./lanSession"
import {
  connectLan,
  hostLan,
  resolveLanService,
  type LanConnection,
  type LanPeerHandlers,
} from "./lanTransport"

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

async function startedGame(format?: "commander") {
  const session = new LanSession()
  await session.host()
  const alice = socket()
  alice.send({ type: "join", name: "Alice" })
  const bob = socket()
  bob.send({ type: "join", name: "Bob" })
  session.start(format ? 40 : 20, format)
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

describe("LAN session commander damage", () => {
  it("lets a guest claim only from its own seat and only the defender confirm", async () => {
    const { session, alice, bob } = await startedGame("commander")
    const hostKey = session.getState().seatKey!

    alice.send({ type: "commander.claim", id: "c1", to: bob.pass().key, delta: 6, round: 1 })
    alice.send({ type: "commander.resolve", id: "c1", accepted: true })
    session.resolveCommanderDamage("c1", true)
    bob.send({ type: "commander.resolve", id: "c1", accepted: true })
    jest.advanceTimersByTime(50)

    expect(lifeOf(session, bob.pass().key)).toBe(34)
    expect(lifeOf(session, alice.pass().key)).toBe(40)
    expect(lifeOf(session, hostKey)).toBe(40)
    expect(session.getState().game?.commander?.totals).toEqual([
      { from: alice.pass().key, to: bob.pass().key, total: 6 },
    ])
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

  async function guestFacingClaim() {
    const sent: unknown[] = []
    let host: LanPeerHandlers<LanHostMessage> | undefined
    jest.mocked(connectLan).mockImplementation(async (_service, _parse, handlers) => {
      host = handlers as LanPeerHandlers<LanHostMessage>
      return {
        send: (message: unknown) => sent.push(message),
        sendAndClose: jest.fn(),
        close: jest.fn(),
      }
    })
    const guest = new LanSession()
    await guest.join({ name: "Host game" } as Parameters<LanSession["join"]>[0])
    host?.onMessage({ type: "welcome", pass: { key: "guest", token: "token" } })
    const seated = admitLanGuest(
      createLanGame("game", "host", "Host"),
      new Map(),
      { type: "join", name: "Guest" },
      { key: "guest", token: "token" },
    )
    if ("rejected" in seated) throw new Error(seated.rejected)
    const game = claimLanCommanderDamage(startLanGame(seated.game, 40, "commander"), "host", {
      id: "c1",
      to: "guest",
      delta: 5,
      round: 1,
    })
    host?.onMessage({ type: "game", game })
    return { guest, game, sent, host: () => host }
  }

  const confirmed = {
    type: "commander.resolve",
    id: "c1",
    accepted: true,
    life: { life: 35, version: 1, round: 1 },
  }

  it("builds a tap right after confirming on the confirmed life", async () => {
    const { guest, sent } = await guestFacingClaim()

    guest.resolveCommanderDamage("c1", true)
    guest.changeLife("guest", -1)

    expect(sent.slice(-2)).toEqual([confirmed, { type: "life", life: 34, version: 2, round: 1 }])
  })

  it("never offers a claim again once confirmed, even from a stale snapshot", async () => {
    const { guest, game, host } = await guestFacingClaim()

    guest.resolveCommanderDamage("c1", true)
    host()?.onMessage({ type: "game", game })

    expect(guest.getState().game?.commander?.claims).toEqual([])
    expect(lifeOf(guest, "guest")).toBe(35)
  })

  it("replays a claim until the host has seen it", async () => {
    const { guest, game, host, sent } = await guestFacingClaim()
    jest.mocked(resolveLanService).mockResolvedValue({ name: "Host game" } as never)
    const replays = () =>
      sent.filter((message) => (message as LanGuestMessage).type === "commander.claim")

    host()?.onClose()
    guest.claimCommanderDamage("guest", [{ toPlayerId: "host", delta: 3 }])
    await jest.advanceTimersByTimeAsync(2_000)
    const [replayed] = replays() as Extract<LanGuestMessage, { type: "commander.claim" }>[]
    host()?.onMessage({
      type: "game",
      game: claimLanCommanderDamage(game, "guest", replayed!),
    })
    host()?.onClose()
    await jest.advanceTimersByTimeAsync(2_000)

    expect(replays()).toEqual([expect.objectContaining({ to: "host", delta: 3, round: 1 })])
  })

  it("replays a confirm the host never received after reconnecting", async () => {
    const { guest, host, sent } = await guestFacingClaim()
    jest.mocked(resolveLanService).mockResolvedValue({ name: "Host game" } as never)

    host()?.onClose()
    guest.resolveCommanderDamage("c1", true)
    await jest.advanceTimersByTimeAsync(2_000)

    expect(sent.slice(-2)).toEqual([
      expect.objectContaining({ type: "join", life: confirmed.life }),
      confirmed,
    ])
  })
})
