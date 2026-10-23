import {
  applyHubCommand,
  createHubEvent,
  hubStandings,
  hubView,
  joinHub,
  type HubEvent,
} from "./hubEvent"
import { parseGuestMessage } from "./nearbyEventProtocol"

const NOW = 1_000_000
const organizer = { kind: "organizer" } as const

function swiss(): HubEvent {
  return createHubEvent(
    {
      id: "e1",
      code: "ABC123",
      name: "Friday Modern",
      format: "modern",
      structure: "swiss",
      bestOf: 3,
      plannedRounds: 3,
      roundMinutes: 50,
    },
    NOW,
  )
}

function withPlayers(event: HubEvent, names: string[]) {
  return names.reduce(
    (next, name) => joinHub(next, { name, token: `token-for-${name}-0000` }, `p-${name}`).event,
    event,
  )
}

describe("nearby hub event", () => {
  it("gives a reconnecting device its own player back", () => {
    const first = joinHub(swiss(), { name: "Ada", token: "token-ada-00000000" }, "p1")
    const again = joinHub(first.event, { name: "Ada", token: "token-ada-00000000" }, "p2")

    expect(again.playerId).toBe("p1")
    expect(again.event.players).toHaveLength(1)
  })

  it("keeps organizer commands from players", () => {
    const event = withPlayers(swiss(), ["Ada", "Grace"])

    expect(() =>
      applyHubCommand(event, { kind: "player", playerId: "p-Ada" }, { kind: "startRound" }, NOW),
    ).toThrow("Only the organizer")
  })

  it("plays a round the way Convex does: report, confirm, standings", () => {
    let event = applyHubCommand(
      withPlayers(swiss(), ["Ada", "Grace"]),
      organizer,
      { kind: "startRound" },
      NOW,
      () => 0,
    )
    const [table] = hubView(event, { organizer: true, playerId: null }).tables
    const [first, second] = table!.playerIds
    event = applyHubCommand(
      event,
      { kind: "player", playerId: first! },
      {
        kind: "report",
        tableId: table!.id,
        result: { kind: "match", gamesWon: [2, 1], gamesDrawn: 0 },
      },
      NOW,
    )
    expect(() =>
      applyHubCommand(
        event,
        { kind: "player", playerId: first! },
        { kind: "confirm", tableId: table!.id },
        NOW,
      ),
    ).toThrow()
    event = applyHubCommand(
      event,
      { kind: "player", playerId: second! },
      { kind: "confirm", tableId: table!.id },
      NOW,
    )

    expect(hubView(event, { organizer: false, playerId: second! }).tables[0]?.status).toBe(
      "confirmed",
    )
    expect(hubStandings(event, 1)[0]).toMatchObject({ playerId: first, points: 3 })
  })

  it("refuses a result the engine doesn't know", () => {
    const event = applyHubCommand(
      withPlayers(swiss(), ["Ada", "Grace"]),
      organizer,
      { kind: "startRound" },
      NOW,
    )
    const table = event.tables[0]!
    const forged = { kind: "forfeit" } as unknown as null

    expect(() =>
      applyHubCommand(event, organizer, { kind: "report", tableId: table.id, result: forged }, NOW),
    ).toThrow("Enter a valid result")
  })

  it("removes a player who drops before round 1 and keeps one who drops later", () => {
    const registered = withPlayers(swiss(), ["Ada", "Grace", "Lin"])
    const left = applyHubCommand(
      registered,
      { kind: "player", playerId: "p-Ada" },
      { kind: "drop", playerId: "p-Ada" },
      NOW,
    )
    expect(left.players.map(({ name }) => name)).toEqual(["Grace", "Lin"])

    const started = applyHubCommand(registered, organizer, { kind: "startRound" }, NOW)
    const dropped = applyHubCommand(started, organizer, { kind: "drop", playerId: "p-Ada" }, NOW)
    expect(hubView(dropped, { organizer: true, playerId: null }).players[0]).toMatchObject({
      name: "Ada",
      dropped: true,
    })
  })

  it("stops the clock when the event finishes", () => {
    const started = applyHubCommand(
      withPlayers(swiss(), ["Ada", "Grace"]),
      organizer,
      { kind: "startRound" },
      NOW,
    )
    const finished = applyHubCommand(started, organizer, { kind: "finish" }, NOW + 1)

    expect(finished).toMatchObject({ status: "finished", finishedAt: NOW + 1 })
    expect(finished.clock).toBeUndefined()
  })
})

describe("nearby guest messages", () => {
  it("drops a hello without a real token and commands it doesn't know", () => {
    expect(
      parseGuestMessage(
        JSON.stringify({ t: "hello", v: 1, code: "ABC123", name: "Ada", token: "x" }),
      ),
    ).toBeNull()
    expect(
      parseGuestMessage(JSON.stringify({ t: "do", id: 1, command: { kind: "wipe" } })),
    ).toBeNull()
    expect(
      parseGuestMessage(
        JSON.stringify({ t: "do", id: 1, command: { kind: "confirm", tableId: "1-1" } }),
      ),
    ).toEqual({ t: "do", id: 1, command: { kind: "confirm", tableId: "1-1" } })
  })
})
