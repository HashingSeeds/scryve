import { hostLan, type LanConnection, type LanPeerHandlers } from "@/features/lan/lanTransport"

import { createHubEvent, hubStandings, hubView, joinHub, type HubEvent } from "./hubEvent"
import { applyHostMessage } from "./nearbyEventFeed"
import { nearbyEventHost } from "./nearbyEventHost"
import type { NearbyGuestMessage, NearbyHostMessage } from "./nearbyEventProtocol"
import { standingsThroughRound } from "../eventLogic"

jest.mock("@/features/lan/lanTransport", () => ({ hostLan: jest.fn() }))

type Accept = (peer: LanConnection<NearbyHostMessage>) => LanPeerHandlers<NearbyGuestMessage>
type GuestCommand = Extract<NearbyGuestMessage, { t: "do" }>["command"]

const CODE = "ABC123"
const token = (seat: number) => `token-${seat}-000000000`
let accept: Accept

beforeEach(() => {
  jest.mocked(hostLan).mockImplementation(async (name, _parse, onPeer) => {
    accept = onPeer as Accept
    return { name, stop: async () => {} }
  })
})

afterEach(() => nearbyEventHost.discard())

async function host(players: number) {
  let event = createHubEvent(
    {
      id: "e1",
      code: CODE,
      name: "Friday Modern",
      format: "modern",
      structure: "swiss",
      bestOf: 3,
      plannedRounds: 15,
      roundMinutes: 50,
    },
    1,
  )
  for (let seat = 1; seat <= players; seat++)
    event = joinHub(event, { name: `Player ${seat}`, token: token(seat) }, `p${seat}`).event
  await nearbyEventHost.create(event, null)
}

function guest(seat: number, patches: boolean) {
  const received: NearbyHostMessage[] = []
  const wire = (message: NearbyHostMessage) =>
    received.push(JSON.parse(JSON.stringify(message)) as NearbyHostMessage)
  const peer: LanConnection<NearbyHostMessage> = {
    send: (...messages) => messages.forEach(wire),
    sendAndClose: wire,
    close: () => undefined,
  }
  const { onMessage } = accept(peer)
  onMessage({ t: "hello", v: 1, code: CODE, name: `Player ${seat}`, token: token(seat), patches })
  const welcome = received.find((message) => message.t === "welcome")
  const updates = () => received.filter((message) => message.t === "view" || message.t === "patch")
  let id = 0
  return {
    received,
    updates,
    playerId: welcome!.playerId,
    run: (command: GuestCommand) => onMessage({ t: "do", id: ++id, command }),
    feed: () => updates().reduce<ReturnType<typeof applyHostMessage>>(applyHostMessage, undefined),
  }
}

const hosted = () => nearbyEventHost.getState().event as HubEvent

function expected(playerId: string) {
  const view = hubView(hosted(), { organizer: false, playerId })
  return { view, standings: hubStandings(hosted(), standingsThroughRound(view)) }
}

const currentTables = () => hosted().tables.filter(({ round }) => round === hosted().round)

const match = (gamesWon: number[]) => ({ kind: "match" as const, gamesWon, gamesDrawn: 0 })

describe("nearby event host", () => {
  it("sends 128 guests small patches that rebuild the host's view", async () => {
    await host(127)
    const guests = Array.from({ length: 128 }, (_, index) => guest(index + 1, true))
    const bySeat = new Map(guests.map((joined) => [joined.playerId, joined]))
    const sent: number[] = []
    const change = (act: () => void) => {
      const before = guests.map(({ received }) => received.length)
      act()
      sent.push(
        guests
          .flatMap(({ received }, index) => received.slice(before[index]))
          .reduce((sum, line) => sum + JSON.stringify(line).length, 0),
      )
    }

    for (let round = 1; round <= 3; round++) {
      nearbyEventHost.run({ kind: "startRound" })
      for (const table of currentTables()) {
        const [first, second] = table.playerIds.map((playerId) => bySeat.get(playerId)!)
        change(() => first!.run({ kind: "report", tableId: table.id, result: match([2, 1]) }))
        change(() => second!.run({ kind: "confirm", tableId: table.id }))
      }
    }
    nearbyEventHost.run({ kind: "report", tableId: hosted().tables[0]!.id, result: match([0, 2]) })
    guests[5]!.run({ kind: "drop", playerId: guests[5]!.playerId })
    nearbyEventHost.run({ kind: "finish" })

    expect(sent.reduce((sum, bytes) => sum + bytes) / sent.length).toBeLessThan(128 * 1024)
    for (const { playerId, feed } of guests)
      expect(feed()).toEqual({ seq: expect.any(Number), ...expected(playerId) })
  })

  it("drops a guest's view when it skips a patch, so a reconnect starts it over", async () => {
    await host(4)
    const ada = guest(1, true)
    nearbyEventHost.run({ kind: "startRound" })
    nearbyEventHost.run({ kind: "clock", action: { kind: "pause" } })
    const [view, , skipped] = ada.updates()

    expect(applyHostMessage(applyHostMessage(undefined, view!), skipped!)).toBeUndefined()
  })

  it("keeps sending whole views to guests that predate patches", async () => {
    await host(4)
    const old = guest(1, false)
    nearbyEventHost.run({ kind: "startRound" })
    const table = currentTables().find(({ playerIds }) => playerIds.includes(old.playerId))!
    old.run({ kind: "report", tableId: table.id, result: match([2, 0]) })

    expect(old.received.some(({ t }) => t === "patch")).toBe(false)
    expect(old.received.at(-1)).toEqual({
      t: "view",
      seq: expect.any(Number),
      ...expected(old.playerId),
    })
  })
})
