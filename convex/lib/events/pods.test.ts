import type { EventPlayerState, EventSettings, EventTableState } from "./model"
import { pairPodRound, podSizes } from "./pods"

const settings: EventSettings = {
  structure: "pods",
  bestOf: 1,
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

describe("pods", () => {
  it("seats as many pods of four as fit and the rest in threes, with five only as one pod of five", () => {
    expect(
      Object.fromEntries(
        [3, 4, 5, 6, 7, 8, 9, 10, 11, 13].map((count) => [count, podSizes(count)]),
      ),
    ).toEqual({
      3: [3],
      4: [4],
      5: [5],
      6: [3, 3],
      7: [4, 3],
      8: [4, 4],
      9: [3, 3, 3],
      10: [4, 3, 3],
      11: [4, 4, 3],
      13: [4, 3, 3, 3],
    })
    expect(() => podSizes(2)).toThrow()
  })

  it("seats every active player once, in pods of the planned sizes", () => {
    const players = [...roster(11), { id: "gone", dropped: true }]
    const pods = pairPodRound({ players, tables: [], settings, random: seeded(1) })

    expect(pods.map((pod) => pod.length)).toEqual([4, 4, 3])
    expect(pods.flat().toSorted()).toEqual(
      roster(11)
        .map((player) => player.id)
        .toSorted(),
    )
  })

  it("seats winners together in the top pod", () => {
    const tables: EventTableState[] = [
      {
        round: 1,
        table: 1,
        playerIds: ["p0", "p1", "p2", "p3"],
        result: { kind: "pod", winnerSeat: 2 },
      },
      {
        round: 1,
        table: 2,
        playerIds: ["p4", "p5", "p6", "p7"],
        result: { kind: "pod", winnerSeat: 0 },
      },
    ]
    const [top] = pairPodRound({ players: roster(8), tables, settings, random: seeded(2) })

    expect(top).toEqual(expect.arrayContaining(["p2", "p4"]))
  })

  it("seats the same way for the same seed", () => {
    const seat = (seed: number) =>
      pairPodRound({ players: roster(13), tables: [], settings, random: seeded(seed) })

    expect(seat(3)).toEqual(seat(3))
    expect(seat(3)).not.toEqual(seat(4))
  })
})
