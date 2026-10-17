import { ConvexError } from "convex/values"

import { archiveLanGame, hashSeatPassToken } from "./lanArchive"
import { saveLanName } from "./lanAvailability"
import {
  createLanGame,
  LAN_PROTOCOL,
  lanLobbyOf,
  lanProjection,
  type LanGuestMessage,
  type LanHostMessage,
  type LanSetup,
} from "./lanGame"
import { LanSession } from "./lanSession"
import { connectLan, hostLan, type LanConnection, type LanPeerHandlers } from "./lanTransport"
import { onSeatClaim, pendingSeatClaims, setNearbyOwner } from "./nearbyAccount"
import type { PendingLifeAction } from "../connected/model"

jest.mock("./lanTransport", () => ({
  hostLan: jest.fn(),
  connectLan: jest.fn(),
  resolveLanService: jest.fn(),
}))
jest.mock("./lanArchive", () => ({
  archiveLanGame: jest.fn(() => null),
  hashSeatPassToken: jest.fn(async (token: string) => `hash-${token}`),
}))

type Accept = (peer: LanConnection<LanHostMessage>) => LanPeerHandlers<LanGuestMessage>

const setup: LanSetup = {
  playerCount: 3,
  startingLife: 40,
  lifeStep: 1,
  ruleset: "commander",
  system: "mtg",
  format: "commander",
}
let accept: Accept

beforeEach(() => {
  jest.clearAllMocks()
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
  const pass = () => {
    const welcome = sent.find((message) => message.type === "welcome")
    if (welcome?.type !== "welcome") throw new Error("no welcome")
    return welcome.pass
  }
  return { sent, peer, send: (message: LanGuestMessage) => handlers.onMessage(message), pass }
}

const lifeEvent = (operationId: string, playerId: string, delta: number, gameId = "game") =>
  ({
    type: "life.changed",
    operationId,
    gameId,
    actorId: "actor",
    deviceId: "device-0001",
    clientCreatedAt: 1_700_000_000_000,
    playerId,
    delta,
  }) as PendingLifeAction["event"]

async function startedGame() {
  const session = new LanSession()
  await session.host(setup)
  const alice = socket()
  alice.send({ type: "join", protocol: LAN_PROTOCOL, name: "Alice" })
  const bob = socket()
  bob.send({ type: "join", protocol: LAN_PROTOCOL, name: "Bob" })
  jest.advanceTimersByTime(50)
  session.start()
  jest.advanceTimersByTime(50)
  return { session, alice, bob }
}

const roundOf = (session: LanSession) => session.getState().projection?.publicId ?? ""

const lifeOf = (session: LanSession, key: string) =>
  session.getState().projection?.players.find((player) => player.playerId === key)?.currentLife

describe("nearby host", () => {
  it("sends a guest the projection with its change before acknowledging the change", async () => {
    const { session, bob } = await startedGame()
    const { key } = bob.pass()
    bob.sent.length = 0

    bob.send({ type: "op", event: lifeEvent("life-operation-0001", key, -3, roundOf(session)) })
    jest.advanceTimersByTime(50)

    expect(bob.sent.map((message) => message.type)).toEqual(["state", "ack"])
    const state = bob.sent[0]
    expect(state.type === "state" && state.projection.recentOperationIds).toEqual([
      "life-operation-0001",
    ])
    expect(lifeOf(session, key)).toBe(37)
  })

  it("refuses a write to another player's seat", async () => {
    const { session, alice, bob } = await startedGame()

    bob.send({
      type: "op",
      event: lifeEvent("life-operation-0002", alice.pass().key, -3, roundOf(session)),
    })
    jest.advanceTimersByTime(50)

    expect(bob.sent.at(-1)).toMatchObject({ type: "nack", code: "seat_owner_required" })
    expect(lifeOf(session, alice.pass().key)).toBe(40)
  })

  it("caps how fast one socket can write", async () => {
    const { session, bob } = await startedGame()

    for (let index = 0; index < 31; index++)
      bob.send({
        type: "op",
        event: lifeEvent(`life-operation-${1000 + index}`, bob.pass().key, -1, roundOf(session)),
      })

    expect(bob.sent.at(-1)).toMatchObject({ type: "nack", code: "rate_limited" })
  })

  it("archives a finished round once, with the winner, every guest's pass, and the account that started it", async () => {
    setNearbyOwner("host-account")
    const { session, alice, bob } = await startedGame()
    setNearbyOwner("switched-account")
    const result = { kind: "win" as const, winnerPlayerIds: [alice.pass().key] }

    await Promise.all([session.writes.finish(result), session.writes.finish(result)])
    await session.writes.finish(result)

    expect(archiveLanGame).toHaveBeenCalledTimes(1)
    const [game, archivedResult, hashes, ownerId] = jest.mocked(archiveLanGame).mock.calls[0]
    setNearbyOwner(undefined)
    expect(ownerId).toBe("host-account")
    expect(game.status).toBe("active")
    expect(archivedResult).toEqual(result)
    expect(hashes).toEqual(
      new Map([
        [alice.pass().key, `hash-${alice.pass().token}`],
        [bob.pass().key, `hash-${bob.pass().token}`],
      ]),
    )
  })

  it("hosts under a saved name cut inside a character without the broken half", async () => {
    saveLanName(`${"a".repeat(23)}😀`)
    const { session, alice } = await startedGame()
    saveLanName("")

    await session.writes.finish({ kind: "win", winnerPlayerIds: [alice.pass().key] })

    const [game] = jest.mocked(archiveLanGame).mock.calls[0]
    expect(game.seats.map((seat) => seat.name)).toEqual(["a".repeat(23), "Alice", "Bob"])
  })

  it("waits for a guest's pass hash before saving the round", async () => {
    let release = (_hash: string) => {}
    jest
      .mocked(hashSeatPassToken)
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    const { session, alice } = await startedGame()

    const finished = session.writes.finish()
    await Promise.resolve()
    expect(archiveLanGame).not.toHaveBeenCalled()
    release("late-hash")
    await finished

    expect(jest.mocked(archiveLanGame).mock.calls[0][2].get(alice.pass().key)).toBe("late-hash")
  })

  it("still finishes when a guest's pass can't be hashed, leaving that seat unclaimable", async () => {
    jest.mocked(hashSeatPassToken).mockRejectedValueOnce(new Error("No digest"))
    const { session, alice, bob } = await startedGame()

    await session.writes.finish()

    const hashes = jest.mocked(archiveLanGame).mock.calls[0][2]
    expect(hashes.has(alice.pass().key)).toBe(false)
    expect(hashes.get(bob.pass().key)).toBe(`hash-${bob.pass().token}`)
  })

  it("keeps the round open when saving it fails, so the host can finish again", async () => {
    const { session } = await startedGame()
    jest.mocked(archiveLanGame).mockImplementationOnce(() => {
      throw new Error("Storage is full")
    })

    await expect(session.writes.finish()).rejects.toThrow("Storage is full")
    jest.advanceTimersByTime(50)
    expect(session.getState().projection?.status).toBe("active")

    await session.writes.finish()
    jest.advanceTimersByTime(50)
    expect(session.getState().projection?.status).toBe("finished")
  })

  it("turns away a socket that names another guest's seat or the host's", async () => {
    const { session, alice } = await startedGame()
    const thief = socket()
    const hostThief = socket()

    thief.send({
      type: "join",
      protocol: LAN_PROTOCOL,
      name: "Thief",
      pass: { key: alice.pass().key, token: "guess" },
    })
    hostThief.send({
      type: "join",
      protocol: LAN_PROTOCOL,
      name: "Thief",
      pass: { key: session.getState().seatKey!, token: "" },
    })

    expect(thief.sent).toEqual([
      { type: "rejected", reason: "That seat belongs to another device." },
    ])
    expect(hostThief.sent[0]).toMatchObject({ type: "rejected" })
    expect(alice.peer.close).not.toHaveBeenCalled()
  })
})

describe("nearby guest", () => {
  async function guest() {
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
    const session = new LanSession()
    await session.join({ name: "Host game" } as Parameters<LanSession["join"]>[0])
    host?.onMessage({ type: "welcome", pass: { key: "guest", token: "token" } })
    const game = createLanGame("game", "host", "Host", setup, 1)
    host?.onMessage({
      type: "state",
      lobby: lanLobbyOf(game),
      projection: lanProjection(game, "guest"),
    })
    return { session, sent, host: () => host }
  }

  it("settles a write on the host's reply, refused or not", async () => {
    const { session, host } = await guest()
    const acked = session.writes.send({
      event: lifeEvent("life-operation-0003", "guest", -1),
    } as PendingLifeAction)
    const refused = session.writes.send({
      event: lifeEvent("life-operation-0004", "host", -1),
    } as PendingLifeAction)

    host()?.onMessage({ type: "ack", operationId: "life-operation-0003" })
    host()?.onMessage({
      type: "nack",
      operationId: "life-operation-0004",
      code: "seat_owner_required",
      message: "Seat-owner permission required",
    })
    jest.advanceTimersByTime(50)

    await expect(acked).resolves.toEqual({ operationId: "life-operation-0003" })
    await expect(refused).rejects.toBeInstanceOf(ConvexError)
  })

  it("fails a write it never heard back about when the host drops, so the outbox retries it", async () => {
    const { session, host } = await guest()
    const pending = session.writes.send({
      event: lifeEvent("life-operation-0005", "guest", -1),
    } as PendingLifeAction)

    host()?.onClose()

    await expect(pending).rejects.toThrow("Lost the host")
  })

  it("keeps a claim from the round's start and asks for it once the round finishes", async () => {
    setNearbyOwner("guest-account")
    const nudged = jest.fn()
    const unsubscribe = onSeatClaim(nudged)
    const { host } = await guest()
    const game = { ...createLanGame("game", "host", "Host", setup, 1), round: 1 }
    const stateWith = (status: "active" | "finished") =>
      ({
        type: "state",
        lobby: { ...lanLobbyOf(game), status },
        projection: { ...lanProjection(game, "guest"), status },
      }) as const

    host()?.onMessage(stateWith("active"))
    expect(pendingSeatClaims("guest-account")).toEqual([
      expect.objectContaining({ publicId: "game-1", token: "token" }),
    ])
    expect(nudged).not.toHaveBeenCalled()
    host()?.onMessage(stateWith("finished"))
    host()?.onMessage(stateWith("finished"))

    expect(pendingSeatClaims("guest-account")).toHaveLength(1)
    expect(nudged).toHaveBeenCalledTimes(1)
    unsubscribe()
    setNearbyOwner(undefined)
  })

  it("keeps its seat and the last board when the host ends the game", async () => {
    const { session, host } = await guest()
    const game = createLanGame("game", "host", "Host", setup, 1)

    host()?.onMessage({
      type: "state",
      lobby: { ...lanLobbyOf(game), status: "abandoned" },
      projection: { ...lanProjection(game, "guest"), status: "abandoned" },
    })

    expect(session.getState()).toMatchObject({
      status: "idle",
      seatKey: "guest",
      projection: { status: "abandoned" },
    })
  })
})
