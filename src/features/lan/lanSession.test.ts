import { AppState } from "react-native"
import { act, renderHook } from "@testing-library/react-native"
import { ConvexError } from "convex/values"

import { storage } from "@/utils/storage"

import { archiveLanGame, hashSeatPassToken } from "./lanArchive"
import { HOSTED_GAME_KEY, saveLanName, savedHostedGame } from "./lanAvailability"
import {
  createLanGame,
  LAN_PROTOCOL,
  lanLobbyOf,
  lanProjection,
  type LanGuestMessage,
  type LanHostMessage,
  type LanSetup,
} from "./lanGame"
import {
  LanSession,
  lanSession,
  useLanSession,
  useLanSessionSlice,
  type LanSessionState,
} from "./lanSession"
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
    send: jest.fn((...messages: LanHostMessage[]) => sent.push(...messages)),
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
  it("sends a guest the projection with its change, then the acknowledgement, in one write", async () => {
    const { session, bob } = await startedGame()
    const { key } = bob.pass()
    bob.sent.length = 0
    bob.peer.send.mockClear()

    bob.send({ type: "op", event: lifeEvent("life-operation-0001", key, -3, roundOf(session)) })
    jest.advanceTimersByTime(50)

    expect(bob.peer.send).toHaveBeenCalledTimes(1)
    expect(bob.sent.map((message) => message.type)).toEqual(["state", "ack"])
    const state = bob.sent[0]
    expect(state.type === "state" && state.projection.recentOperationIds).toEqual([
      "life-operation-0001",
    ])
    expect(lifeOf(session, key)).toBe(37)
  })

  it("sends an idle change at once and holds a burst for the next broadcast", async () => {
    const { session, bob } = await startedGame()
    const { key } = bob.pass()
    jest.advanceTimersByTime(1000)
    const acked = () =>
      bob.sent.flatMap((message) => (message.type === "ack" ? [message.operationId] : []))
    const write = (operationId: string) =>
      bob.send({ type: "op", event: lifeEvent(operationId, key, -1, roundOf(session)) })

    write("life-operation-0001")
    jest.advanceTimersByTime(0)
    expect(acked()).toEqual(["life-operation-0001"])

    write("life-operation-0002")
    write("life-operation-0003")
    jest.advanceTimersByTime(32)
    expect(acked()).toEqual(["life-operation-0001"])
    jest.advanceTimersByTime(1)
    expect(acked()).toEqual(["life-operation-0001", "life-operation-0002", "life-operation-0003"])
  })

  it("sends each guest only its own recent changes", async () => {
    const { session, alice, bob } = await startedGame()
    const round = roundOf(session)

    alice.send({ type: "op", event: lifeEvent("life-operation-0001", alice.pass().key, -1, round) })
    bob.send({ type: "op", event: lifeEvent("life-operation-0002", bob.pass().key, -1, round) })
    jest.advanceTimersByTime(50)

    const recent = (guest: typeof alice) => {
      const state = guest.sent.findLast((message) => message.type === "state")
      return state?.type === "state" ? state.projection.recentOperationIds : undefined
    }
    expect(recent(alice)).toEqual(["life-operation-0001"])
    expect(recent(bob)).toEqual(["life-operation-0002"])
  })

  it("hosts its game again after the OS ends it in the background, with changes from after it left, and a guest reclaims its seat", async () => {
    const { session, bob } = await startedGame()
    const pass = bob.pass()
    jest.mocked(AppState.addEventListener).mock.calls.at(-1)?.[1]("background")
    bob.send({
      type: "op",
      event: lifeEvent("life-operation-0003", pass.key, -5, roundOf(session)),
    })
    jest.advanceTimersByTime(50)

    const resumed = new LanSession()
    resumed.resumeHostedGame()
    await jest.advanceTimersByTimeAsync(50)
    const back = socket()
    back.send({ type: "join", protocol: LAN_PROTOCOL, name: "Bob", pass })

    expect(resumed.getState()).toMatchObject({ role: "host", status: "connected" })
    expect(roundOf(resumed)).toBe(roundOf(session))
    expect(lifeOf(resumed, pass.key)).toBe(35)
    expect(back.sent[0]).toEqual({ type: "welcome", pass })
  })

  it("saves a foreground host's game as the round starts, then once for a burst of taps", async () => {
    const { session, bob } = await startedGame()
    const { key } = bob.pass()
    expect(savedHostedGame()).toBeDefined()
    const set = jest.spyOn(storage, "set")
    const hostedSaves = () => set.mock.calls.filter(([saved]) => saved === HOSTED_GAME_KEY)

    for (let index = 0; index < 10; index++) {
      bob.send({
        type: "op",
        event: lifeEvent(`life-operation-${2000 + index}`, key, -1, roundOf(session)),
      })
      jest.advanceTimersByTime(40)
    }
    jest.advanceTimersByTime(1000)

    expect(hostedSaves()).toHaveLength(1)
    const resumed = new LanSession()
    resumed.resumeHostedGame()
    expect(lifeOf(resumed, key)).toBe(30)
    set.mockRestore()
  })

  it("keeps the saved game when the host comes back to the foreground", async () => {
    const { session } = await startedGame()
    const onAppState = jest.mocked(AppState.addEventListener).mock.calls.at(-1)?.[1]

    onAppState?.("background")
    onAppState?.("active")
    session.resumeHostedGame()

    const resumed = new LanSession()
    resumed.resumeHostedGame()
    expect(roundOf(resumed)).toBe(roundOf(session))
  })

  it("sends every guest the host's new seat count, and turns away a join past it", async () => {
    const session = new LanSession()
    await session.host(setup)
    const alice = socket()
    alice.send({ type: "join", protocol: LAN_PROTOCOL, name: "Alice" })

    session.updateSettings({ playerCount: 2 })
    jest.advanceTimersByTime(50)
    const latest = alice.sent.findLast((message) => message.type === "state")
    expect(latest?.type === "state" && latest.lobby.setup.playerCount).toBe(2)
    const bob = socket()
    bob.send({ type: "join", protocol: LAN_PROTOCOL, name: "Bob" })
    expect(bob.sent).toEqual([{ type: "rejected", reason: "This game is full." }])
  })

  it("sends each Treachery guest only roles it may see, and shares one once its owner reveals it", async () => {
    const session = new LanSession()
    await session.host({ ...setup, playerCount: 4, variant: "treachery" })
    const guests = ["Alice", "Bob", "Cy"].map((name) => {
      const guest = socket()
      guest.send({ type: "join", protocol: LAN_PROTOCOL, name, variants: ["treachery"] })
      return guest
    })
    jest.advanceTimersByTime(50)
    session.start()
    jest.advanceTimersByTime(50)
    const [alice, bob] = guests
    const playersSeenBy = (guest: (typeof guests)[number]) => {
      const state = guest.sent.findLast((message) => message.type === "state")
      return state?.type === "state" ? state.projection.players : []
    }

    for (const guest of guests)
      expect(
        playersSeenBy(guest).filter(
          (player) => !player.controlledByMe && !player.roleRevealed && player.role,
        ),
      ).toEqual([])
    alice.send({ type: "reveal" })
    jest.advanceTimersByTime(50)

    const aliceSeenByBob = playersSeenBy(bob).find((player) => player.playerId === alice.pass().key)
    expect(aliceSeenByBob).toMatchObject({ roleRevealed: true, role: expect.any(String) })
    const sentToBob = bob.sent.length
    alice.send({ type: "reveal" })
    jest.advanceTimersByTime(50)
    expect(bob.sent).toHaveLength(sentToBob)
  })

  it("listens again on returning from the background, since iOS reclaims the listener without closing it", async () => {
    await startedGame()
    const onAppState = jest.mocked(AppState.addEventListener).mock.calls.at(-1)?.[1]
    jest.mocked(hostLan).mockClear()

    onAppState?.("background")
    onAppState?.("active")
    await jest.advanceTimersByTimeAsync(50)

    expect(hostLan).toHaveBeenCalledTimes(1)
  })

  it("puts each player's deck pick on their own seat", async () => {
    const session = new LanSession()
    await session.host({ ...setup, playerCount: 2 })
    const alice = socket()
    alice.send({ type: "join", protocol: LAN_PROTOCOL, name: "Alice" })
    await session.selectDeck({ versionId: "version-host", name: "Host deck" })
    alice.send({ type: "deck", deck: { versionId: "version-alice", name: "Alice deck" } })
    jest.advanceTimersByTime(50)

    expect(session.getState().lobby?.seats.map((seat) => seat.deck?.versionId)).toEqual([
      "version-host",
      "version-alice",
    ])
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

  it("sends the finish to guests at once, so a deck picked next can't ride along", async () => {
    const { session, alice } = await startedGame()

    await session.writes.finish()

    expect(alice.sent.findLast((message) => message.type === "state")).toMatchObject({
      lobby: { status: "finished" },
    })
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
  async function guest(session = new LanSession()) {
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

  it("re-renders a lobby reader for a seat change but not for a life change", async () => {
    const { host } = await guest(lanSession)
    const game = createLanGame("game", "host", "Host", setup, 1)
    const lobby = lanLobbyOf(game)
    const projection = lanProjection(game, "guest")
    const selectLobby = ({ role, lobby }: LanSessionState) => ({ role, lobby })
    const lobbyReader = jest.fn(() => useLanSessionSlice(selectLobby))
    const wholeReader = jest.fn(() => useLanSession())
    renderHook(lobbyReader)
    renderHook(wholeReader)
    const receive = (next: { lobby: typeof lobby; projection: typeof projection }) =>
      act(() => host()?.onMessage({ type: "state", ...next }))

    receive({
      lobby: structuredClone(lobby),
      projection: {
        ...projection,
        players: projection.players.map((player) => ({ ...player, currentLife: 39 })),
      },
    })

    expect(wholeReader).toHaveBeenCalledTimes(2)
    expect(lobbyReader).toHaveBeenCalledTimes(1)

    receive({ lobby: { ...lobby, seats: [] }, projection })

    expect(lobbyReader).toHaveBeenCalledTimes(2)
    act(() => lanSession.leave())
  })

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
    expect(pendingSeatClaims("guest-account")[0]).not.toHaveProperty("deckVersionId")
    expect(nudged).not.toHaveBeenCalled()
    host()?.onMessage(stateWith("finished"))
    host()?.onMessage(stateWith("finished"))

    expect(pendingSeatClaims("guest-account")).toHaveLength(1)
    expect(nudged).toHaveBeenCalledTimes(1)
    unsubscribe()
    setNearbyOwner(undefined)
  })

  it("remembers the deck its own seat played, for its account's stats", async () => {
    setNearbyOwner("deck-account")
    const { host } = await guest()
    const seated = { ...createLanGame("game", "host", "Host", setup, 1), round: 2 }
    const game = {
      ...seated,
      status: "active" as const,
      seats: [
        { ...seated.seats[0], deck: { versionId: "version-host", name: "Host deck" } },
        {
          key: "guest",
          seat: 2,
          name: "Guest",
          connected: true,
          deck: { versionId: "version-guest", name: "Mine" },
        },
      ],
    }

    host()?.onMessage({
      type: "state",
      lobby: lanLobbyOf(game),
      projection: lanProjection(game, "guest"),
    })

    expect(pendingSeatClaims("deck-account")).toEqual([
      expect.objectContaining({ publicId: "game-2", deckVersionId: "version-guest" }),
    ])
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
