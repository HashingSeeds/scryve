import type { EventSettings, EventTableState, TableResult } from "./model"
import { eventRules } from "./rules"
import { computeStandings, tableOutcomes } from "./standings"

const bo3: EventSettings = { structure: "swiss", bestOf: 3, points: { win: 3, draw: 1, loss: 0 } }
const bo1: EventSettings = { ...bo3, bestOf: 1 }

const match = (gamesWon: [number, number], gamesDrawn = 0): TableResult => ({
  kind: "match",
  gamesWon,
  gamesDrawn,
})
const table = (round: number, playerIds: string[], result: TableResult): EventTableState => ({
  round,
  table: 1,
  playerIds,
  result,
})
const bye = (round: number, id: string) => table(round, [id], { kind: "bye" })
const players = (ids: string, dropped = "") =>
  [...ids].map((id) => ({ id, dropped: dropped.includes(id) }))
const byId = (standings: ReturnType<typeof computeStandings>) =>
  Object.fromEntries(standings.map((standing) => [standing.playerId, standing]))

describe("event standings", () => {
  it("scores tables from the organizer's points", () => {
    const points = { win: 2, draw: 1, loss: 0 }

    expect(tableOutcomes(table(1, ["a", "b"], match([1, 2])), points)).toEqual([
      { playerId: "a", outcome: "loss", points: 0 },
      { playerId: "b", outcome: "win", points: 2 },
    ])
    expect(
      tableOutcomes(table(1, ["a", "b"], match([1, 1], 1)), points).map((seat) => seat.outcome),
    ).toEqual(["draw", "draw"])
    expect(
      tableOutcomes(table(1, ["a", "b", "c"], { kind: "pod", winnerSeat: null }), points).map(
        (seat) => seat.points,
      ),
    ).toEqual([1, 1, 1])
    expect(tableOutcomes({ round: 1, table: 1, playerIds: ["a", "b"] }, points)).toEqual([])
  })

  it("follows the MTR: floors each percentage at 33%, counts a bye as a 2-0 win, and leaves byes out of opponents' figures", () => {
    const tables = [
      table(1, ["a", "b"], match([2, 0])),
      table(1, ["c", "d"], match([2, 1])),
      bye(1, "e"),
      table(2, ["a", "c"], match([2, 1])),
      table(2, ["b", "e"], match([0, 2])),
      bye(2, "d"),
      table(3, ["a", "e"], match([1, 2])),
      table(3, ["b", "d"], match([1, 1], 1)),
      bye(3, "c"),
    ]
    const standings = computeStandings({
      players: players("abcde"),
      tables,
      settings: bo3,
      rules: eventRules("mtg"),
    })

    expect(
      standings.map((standing) => [standing.playerId, standing.rank, standing.points]),
    ).toEqual([
      ["e", 1, 9],
      ["a", 2, 6],
      ["c", 3, 6],
      ["d", 4, 4],
      ["b", 5, 1],
    ])
    const expected = {
      a: [(1 / 3 + 2 / 3 + 1) / 3, 15 / 24, (1 / 3 + 15 / 24 + 18 / 21) / 3],
      b: [(2 / 3 + 1 + 4 / 9) / 3, 1 / 3, (15 / 24 + 18 / 21 + 13 / 24) / 3],
      c: [(4 / 9 + 2 / 3) / 2, 15 / 24, (13 / 24 + 15 / 24) / 2],
      d: [(2 / 3 + 1 / 3) / 2, 13 / 24, (15 / 24 + 1 / 3) / 2],
      e: [(1 / 3 + 2 / 3) / 2, 18 / 21, (1 / 3 + 15 / 24) / 2],
    }
    for (const [id, values] of Object.entries(expected))
      values.forEach((value, index) =>
        expect(byId(standings)[id].tiebreakers[index]).toBeCloseTo(value, 9),
      )
    expect(byId(standings).d).toMatchObject({ wins: 1, losses: 1, draws: 1 })
  })

  it("shares a rank between players with identical points and tiebreakers", () => {
    const standings = computeStandings({
      players: players("abcd"),
      tables: [table(1, ["a", "b"], match([2, 0])), table(1, ["c", "d"], match([2, 0]))],
      settings: bo3,
      rules: eventRules("mtg"),
    })

    expect(standings.map((standing) => standing.rank)).toEqual([1, 1, 3, 3])
  })

  it("treats a pod as one game the winner takes, with a pod draw for everyone when no one wins", () => {
    const standings = byId(
      computeStandings({
        players: players("abcdefg"),
        tables: [
          table(1, ["a", "b", "c", "d"], { kind: "pod", winnerSeat: 0 }),
          table(1, ["e", "f", "g"], { kind: "pod", winnerSeat: null }),
        ],
        settings: { ...bo1, structure: "pods" },
        rules: eventRules("mtg"),
      }),
    )

    expect(standings.a).toMatchObject({ rank: 1, points: 3, tiebreakers: [1 / 3, 1, 1 / 3] })
    expect(standings.e).toMatchObject({ rank: 2, points: 1, draws: 1 })
    expect(standings.b).toMatchObject({
      rank: 5,
      points: 0,
      tiebreakers: [(1 + 1 / 3 + 1 / 3) / 3, 1 / 3, (1 + 1 / 3 + 1 / 3) / 3],
    })
  })

  it("follows Play! Pokémon: wins over rounds without the bye, a 25% floor, and a dropped opponent capped at 75%", () => {
    const standings = computeStandings({
      players: players("abcd", "c"),
      tables: [
        table(1, ["a", "b"], match([1, 0])),
        table(1, ["c", "d"], match([1, 0])),
        table(2, ["a", "d"], match([1, 0])),
        bye(2, "b"),
      ],
      settings: bo1,
      rules: eventRules("pokemon"),
    })

    expect(
      standings.map(({ playerId, rank, tiebreakers }) => [playerId, rank, tiebreakers]),
    ).toEqual([
      ["a", 1, [0.25, (1 + 0.875) / 2]],
      ["b", 2, [1, 0.25]],
      ["c", 3, [0.25, 0.875]],
      ["d", 4, [0.875, (0.25 + 0.25) / 2]],
    ])
  })

  it("follows Yu-Gi-Oh!: a double loss is a loss for both, and fewer late losses break the last tie", () => {
    const standings = computeStandings({
      players: players("abcd"),
      tables: [
        table(1, ["a", "b"], { kind: "doubleLoss" }),
        table(1, ["c", "d"], match([2, 0])),
        table(2, ["a", "c"], match([2, 1])),
        table(2, ["b", "d"], match([2, 0])),
      ],
      settings: { ...bo3, points: eventRules("ygo").defaultPoints },
      rules: eventRules("ygo"),
    })

    expect(byId(standings).b).toMatchObject({ points: 3, wins: 1, losses: 1 })
    expect(
      standings.map(({ playerId, rank, tiebreakers }) => [playerId, rank, tiebreakers]),
    ).toEqual([
      ["a", 1, [0.5, 0.25, 1 / 2]],
      ["b", 2, [0.25, 0.5, 1 / 2]],
      ["c", 3, [0.25, 0.5, 1 / 5]],
      ["d", 4, [0.5, 0.25, 1 / 6]],
    ])
  })
})
