import {
  parseGuestMessage,
  parseHostMessage,
  type LanGuestMessage,
  type LanHostMessage,
  type LanSetup,
} from "./lanGame"
import { LanSession } from "./lanSession"
import { connectLan, hostLan, type LanConnection, type LanPeerHandlers } from "./lanTransport"
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
  jest.useFakeTimers()
  jest.mocked(hostLan).mockImplementation(async (name, _parse, onPeer) => {
    accept = onPeer as Accept
    return { name, advertise: () => {}, stop: async () => {} }
  })
})

afterEach(() => jest.useRealTimers())

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
}

function socketDirectionWithLag<In>(
  random: () => number,
  parse: (line: string) => In | null,
  deliver: (message: In) => void,
) {
  let lastAt = 0
  return (...messages: unknown[]) => {
    for (const message of messages) {
      lastAt = Math.max(lastAt, Date.now() + Math.floor(random() * 40))
      const line = JSON.stringify(message)
      setTimeout(() => {
        const parsed = parse(line)
        if (parsed) deliver(parsed)
      }, lastAt - Date.now())
    }
  }
}

async function table(random: () => number) {
  const host = new LanSession()
  await host.host(setup)
  const guests: LanSession[] = []
  for (let index = 0; index < 2; index += 1) {
    jest.mocked(connectLan).mockImplementationOnce(async (_service, _parse, handlers) => {
      const toGuest = socketDirectionWithLag(random, parseHostMessage, (message) =>
        (handlers as LanPeerHandlers<LanHostMessage>).onMessage(message),
      )
      const atHost = accept({ send: toGuest, sendAndClose: toGuest, close: jest.fn() })
      const toHost = socketDirectionWithLag(random, parseGuestMessage, (message) =>
        atHost.onMessage(message),
      )
      return { send: toHost, sendAndClose: toHost, close: jest.fn() }
    })
    const guest = new LanSession()
    await guest.join({ name: host.getState().serviceName } as Parameters<LanSession["join"]>[0])
    guests.push(guest)
  }
  jest.advanceTimersByTime(500)
  host.start()
  jest.advanceTimersByTime(500)
  return { host, guests }
}

const lives = (session: LanSession) =>
  Object.fromEntries(
    session.getState().projection?.players.map((player) => [player.playerId, player.currentLife]) ??
      [],
  )

it.each([1, 2, 3])(
  "ends every device on the same totals after the whole table taps at once (seed %i)",
  async (seed) => {
    const random = seeded(seed)
    const { host, guests } = await table(random)
    const devices = [host, ...guests]
    const expected = new Map<string, number>()
    const writes: Promise<unknown>[] = []

    for (let index = 0; index < 60; index += 1) {
      const device = devices[Math.floor(random() * devices.length)]
      const { seatKey = "", projection } = device.getState()
      const delta = random() < 0.5 ? -1 : 1
      expected.set(seatKey, (expected.get(seatKey) ?? 0) + delta)
      writes.push(
        device.writes.send({
          event: {
            type: "life.changed",
            operationId: `life-operation-${String(seed * 100 + index).padStart(4, "0")}`,
            gameId: projection?.publicId ?? "",
            actorId: "actor",
            deviceId: "device-0001",
            clientCreatedAt: 1_700_000_000_000,
            playerId: seatKey,
            delta,
          },
        } as PendingLifeAction),
      )
      jest.advanceTimersByTime(Math.floor(random() * 20))
    }
    jest.advanceTimersByTime(1_000)

    await expect(Promise.all(writes)).resolves.toHaveLength(60)
    const totals = lives(host)
    expect(expected.size).toBe(3)
    for (const [seat, delta] of expected) expect(totals[seat]).toBe(40 + delta)
    for (const guest of guests) {
      expect(lives(guest)).toEqual(totals)
      expect(guest.getState().projection?.eventSequence).toBe(
        host.getState().projection?.eventSequence,
      )
    }
  },
)
