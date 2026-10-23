import type { EventPlayerState, EventSettings, EventTableState, RoundPairings } from "./model"
import { pairSwissRound, suggestedSwissRounds } from "./pairing"

const settings: EventSettings = {
  structure: "swiss",
  bestOf: 3,
  points: { win: 3, draw: 1, loss: 0 },
}

function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const roster = (count: number): EventPlayerState[] =>
  Array.from({ length: count }, (_, index) => ({ id: `p${index}`, dropped: false }))

function played(round: number, pairings: RoundPairings, random?: () => number): EventTableState[] {
  return pairings.map((playerIds, index) => ({
    round,
    table: index + 1,
    playerIds,
    result:
      playerIds.length === 1
        ? { kind: "bye" }
        : { kind: "match", gamesWon: random && random() < 0.5 ? [0, 2] : [2, 0], gamesDrawn: 0 },
  }))
}

function runSwiss(players: EventPlayerState[], rounds: number, random: () => number) {
  const tables: EventTableState[] = []
  for (let round = 1; round <= rounds; round++)
    tables.push(...played(round, pairSwissRound({ players, tables, settings, random }), random))
  return tables
}

const pairKey = (playerIds: readonly string[]) => [...playerIds].sort().join("|")

describe("swiss pairing", () => {
  it("suggests rounds from the player count", () => {
    expect([2, 8, 9, 16, 17, 32, 33, 64, 65, 128].map(suggestedSwissRounds)).toEqual([
      3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
    ])
  })

  it("never repeats a pairing while another is possible", () => {
    const tables = runSwiss(roster(8), 4, seeded(1))
    const pairs = tables
      .filter((table) => table.playerIds.length === 2)
      .map((table) => pairKey(table.playerIds))

    expect(pairs).toHaveLength(16)
    expect(new Set(pairs).size).toBe(16)
  })

  it("pairs 128 players for 7 rounds quickly and without rematches", () => {
    const started = performance.now()
    const tables = runSwiss(roster(128), 7, seeded(2))
    const elapsed = performance.now() - started
    const pairs = tables.map((table) => pairKey(table.playerIds))

    expect(new Set(pairs).size).toBe(64 * 7)
    expect(elapsed).toBeLessThan(200)
  })

  it("pairs within point groups and floats the odd player down", () => {
    const players = roster(6)
    const tables = played(1, [
      ["p0", "p1"],
      ["p2", "p3"],
      ["p4", "p5"],
    ])
    const [top, middle, bottom] = pairSwissRound({ players, tables, settings, random: seeded(3) })

    expect(new Set([...top, middle[0]])).toEqual(new Set(["p0", "p2", "p4"]))
    expect(new Set([middle[1], ...bottom])).toEqual(new Set(["p1", "p3", "p5"]))
  })

  it("gives the bye to the lowest-ranked player who has not had one", () => {
    const players = roster(5)
    const tables = [
      ...played(1, [["p0", "p1"], ["p2", "p3"], ["p4"]]),
      ...played(2, [["p0", "p4"], ["p1", "p2"], ["p3"]]),
      ...played(3, [["p2", "p4"], ["p0", "p3"], ["p1"]]),
    ]
    const pairings = pairSwissRound({ players, tables, settings, random: seeded(4) })

    expect(pairings.at(-1)).toEqual(["p2"])
  })

  it("never gives anyone a second bye when another player has none", () => {
    const tables = runSwiss(roster(5), 5, seeded(5))
    const byes = tables
      .filter((table) => table.playerIds.length === 1)
      .map((table) => table.playerIds[0])

    expect(byes.toSorted()).toEqual(["p0", "p1", "p2", "p3", "p4"])
  })

  it("leaves dropped players out and still pairs when a rematch is unavoidable", () => {
    const players = [...roster(4), { id: "gone", dropped: true }]
    const tables = runSwiss(players, 3, seeded(6))
    const pairings = pairSwissRound({ players, tables, settings, random: seeded(7) })

    expect(tables.some((table) => table.playerIds.includes("gone"))).toBe(false)
    expect(pairings.flat().toSorted()).toEqual(["p0", "p1", "p2", "p3"])
  })

  it("pairs the same way for the same seed", () => {
    const pair = (seed: number) =>
      runSwiss(roster(9), 4, seeded(seed)).map((table) => table.playerIds)

    expect(pair(8)).toEqual(pair(8))
    expect(pair(8)).not.toEqual(pair(9))
  })
})
