import { asGameId, asPlayerId } from "@/features/game/domain"
import type { LocalGameSummary } from "@/features/game/types"

import {
  connectedHistoryEntry,
  filterHistory,
  groupMatchGames,
  localHistoryEntry,
  NO_FILTERS,
  type HistoryEntry,
  type ScryveMatchSummary,
} from "./historyEntries"

const ada = asPlayerId("p1")
const grace = asPlayerId("p2")

function game(overrides: Partial<LocalGameSummary> = {}): LocalGameSummary {
  return {
    schemaVersion: 1,
    id: "game_1",
    status: "finished",
    system: "mtg",
    format: "commander",
    startingLife: 40,
    eventCount: 4,
    createdAt: 1,
    finishedAt: 2,
    players: [
      { id: ada, name: "Ada", color: "#7C3AED", life: 3, seat: 0 },
      { id: grace, name: "Grace", color: "#2563EB", life: 0, seat: 1 },
    ],
    result: { kind: "win", winnerPlayerIds: [ada] },
    ...overrides,
  } as LocalGameSummary
}

describe("localHistoryEntry", () => {
  it("reads the outcome from the account's seat and labels its deck", () => {
    const loss = localHistoryEntry(
      game({
        account: { ownerId: "owner", mePlayerId: grace, deckVersionId: "v1", deckName: "Atraxa" },
      }),
    )
    expect(loss.outcome).toBe("loss")
    expect(loss.players.map((player) => player.deckName)).toEqual([undefined, "Atraxa"])
    expect(
      localHistoryEntry(game({ account: { ownerId: "owner", mePlayerId: ada } })).outcome,
    ).toBe("win")
  })

  it("keeps the table-level outcome for signed-out games only", () => {
    expect(localHistoryEntry(game()).outcome).toBe("win")
    expect(localHistoryEntry(game({ result: undefined })).outcome).toBe("unrecorded")
    const owned = localHistoryEntry(game({ account: { ownerId: "owner" } }))
    expect(owned.outcome).toBe("unrecorded")
    expect(owned.winnerNames).toEqual(["Ada"])
    expect(
      localHistoryEntry(game({ account: { ownerId: "owner" }, result: { kind: "draw" } })).outcome,
    ).toBe("unrecorded")
  })
})

describe("connectedHistoryEntry", () => {
  it("keys a published local game like the device's copy so History shows it once", () => {
    const entry = connectedHistoryEntry({
      publicId: "game_1",
      source: "local",
      eventCount: 4,
      finishedAt: 2,
      players: [],
    })
    expect(entry.key).toBe(localHistoryEntry(game()).key)
    expect(entry.source).toBe("local")
    expect(
      connectedHistoryEntry({ publicId: "c1", eventCount: 1, finishedAt: 2, players: [] }).key,
    ).toBe("connected:c1")
  })
})

type LocalMatch = NonNullable<LocalGameSummary["match"]>

/** why: a Bo3 Ada wins 2-1, with the match result on the game that ended it, as the device stores it. */
function deviceMatch(account?: LocalGameSummary["account"]): LocalGameSummary[] {
  const match: LocalMatch = { id: "match_1", bestOf: 3, gameNumber: 1, wins: [0, 0], draws: 0 }
  return [
    game({
      id: asGameId("g1"),
      finishedAt: 10,
      match,
      result: { kind: "win", winnerPlayerIds: [ada] },
    }),
    game({
      id: asGameId("g2"),
      finishedAt: 20,
      match: { ...match, gameNumber: 2, wins: [1, 0] },
      result: { kind: "win", winnerPlayerIds: [grace] },
    }),
    game({
      id: asGameId("g3"),
      finishedAt: 30,
      match: { ...match, gameNumber: 3, wins: [1, 1], result: { outcomes: ["win", "loss"] } },
      result: { kind: "win", winnerPlayerIds: [ada] },
    }),
  ].map((summary) => (account ? { ...summary, account } : summary)) as LocalGameSummary[]
}

function serverMatchGame(publicId: string, finishedAt: number, outcome: "win" | "loss") {
  const match: ScryveMatchSummary = {
    publicId: "match_1",
    bestOf: 3,
    status: "finished",
    outcome: "win",
    seats: [
      { seat: 1, gamesWon: 2, gamesDrawn: 0, outcome: "win", mine: true },
      { seat: 2, gamesWon: 1, gamesDrawn: 0, outcome: "loss", mine: false },
    ],
  }
  return {
    publicId,
    source: "local" as const,
    outcome,
    eventCount: 1,
    finishedAt,
    match,
    players: [],
  }
}

function keys(entries: HistoryEntry[]) {
  return entries.map((entry) => entry.key)
}

describe("groupMatchGames", () => {
  it("folds a device match into one entry at its latest game, with its games newest first", () => {
    const [match] = groupMatchGames(deviceMatch().map(localHistoryEntry))

    expect(match.key).toBe("scryve-match:match_1")
    expect(match.source).toBe("local")
    expect(match.finishedAt).toBe(30)
    expect(match.outcome).toBe("win")
    expect(match.match).toMatchObject({ bestOf: 3, score: "2-1" })
    expect(match.match?.inProgress).toBeUndefined()
    expect(keys(match.match!.games!)).toEqual(["local:g3", "local:g2", "local:g1"])
    expect(match.match!.games!.map((entry) => entry.scryveMatch?.gameNumber)).toEqual([3, 2, 1])
  })

  it("scores a signed-in match from the account's seat", () => {
    const [match] = groupMatchGames(
      deviceMatch({ ownerId: "owner", mePlayerId: grace }).map(localHistoryEntry),
    )

    expect(match.outcome).toBe("loss")
    expect(match.match?.score).toBe("1-2")
    expect(match.match?.games?.map((entry) => entry.outcome)).toEqual(["loss", "win", "loss"])
  })

  it("shows an unfinished match in progress with the standing so far", () => {
    const [match] = groupMatchGames(deviceMatch().slice(0, 2).map(localHistoryEntry))

    expect(match.outcome).toBe("unrecorded")
    expect(match.match).toMatchObject({ inProgress: true, score: "1-1" })
    expect(match.match?.games).toHaveLength(2)
  })

  it("groups server rows by the match summary and counts loaded games while it is active", () => {
    const finished = groupMatchGames([
      connectedHistoryEntry(serverMatchGame("g3", 30, "win")),
      connectedHistoryEntry(serverMatchGame("g1", 10, "win")),
      connectedHistoryEntry({ publicId: "casual", eventCount: 1, finishedAt: 5, players: [] }),
    ])
    expect(keys(finished)).toEqual(["connected:casual", "scryve-match:match_1"])
    expect(finished[1]).toMatchObject({ outcome: "win", match: { score: "2-1" } })
    expect(keys(finished[1].match!.games!)).toEqual(["local:g3", "local:g1"])

    const active = groupMatchGames(
      [serverMatchGame("g1", 10, "win"), serverMatchGame("g2", 20, "loss")].map((row) =>
        connectedHistoryEntry({
          ...row,
          match: { ...row.match, status: "active", outcome: undefined, seats: [] },
        }),
      ),
    )
    expect(active[0]).toMatchObject({
      outcome: "unrecorded",
      match: { inProgress: true, score: "1-1" },
    })
  })

  it("keeps one group when a device copy and the server row describe the same game", () => {
    const device = deviceMatch({ ownerId: "owner", mePlayerId: ada }).map(localHistoryEntry)
    const server = [serverMatchGame("g1", 10, "win"), serverMatchGame("g2", 20, "loss")].map(
      connectedHistoryEntry,
    )
    const unique = new Map([...server, ...device].map((entry) => [entry.key, entry]))

    const grouped = groupMatchGames([...unique.values()])

    expect(keys(grouped)).toEqual(["scryve-match:match_1"])
    expect(grouped[0].match?.games).toHaveLength(3)
  })

  it("filters a match by its own outcome, source, and pod size", () => {
    const entries = groupMatchGames(
      deviceMatch({ ownerId: "owner", mePlayerId: grace }).map(localHistoryEntry),
    )

    expect(filterHistory(entries, { ...NO_FILTERS, outcomes: ["loss"] }, 100)).toHaveLength(1)
    expect(filterHistory(entries, { ...NO_FILTERS, outcomes: ["win"] }, 100)).toHaveLength(0)
    expect(filterHistory(entries, { ...NO_FILTERS, source: "local" }, 100)).toHaveLength(1)
    expect(filterHistory(entries, { ...NO_FILTERS, source: "connected" }, 100)).toHaveLength(0)
    expect(filterHistory(entries, { ...NO_FILTERS, podSizes: [2] }, 100)).toHaveLength(1)
    expect(filterHistory(entries, { ...NO_FILTERS, podSizes: [4] }, 100)).toHaveLength(0)
  })
})
