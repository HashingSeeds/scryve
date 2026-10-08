import { asGameId, asPlayerId } from "./domain"
import { applyClaimDecisions, claimableLocalGames, localGameVisibleTo } from "./localGameClaims"
import type { LocalGameSummary } from "./types"

const ada = asPlayerId("p-ada")
const grace = asPlayerId("p-grace")

function game(id: string, overrides: Partial<LocalGameSummary> = {}): LocalGameSummary {
  return {
    schemaVersion: 1,
    id: asGameId(id),
    status: "finished",
    startingLife: 20,
    players: [
      { id: ada, name: "Ada", color: "#000", life: 5, seat: 1 },
      { id: grace, name: "Grace", color: "#111", life: 0, seat: 2 },
    ],
    eventCount: 3,
    createdAt: 1,
    finishedAt: 2,
    result: { kind: "win", winnerPlayerIds: [ada] },
    ...overrides,
  }
}

describe("claimableLocalGames", () => {
  it("offers finished untagged games the account has not declined", () => {
    const history = [
      game("fresh"),
      game("abandoned", { status: "abandoned" }),
      game("owned", { account: { ownerId: "a" }, publish: "published" }),
      game("skipped-by-a", { skippedBy: ["a"] }),
      game("skipped-by-b", { skippedBy: ["b"] }),
    ]
    expect(claimableLocalGames(history, "a").map(({ id }) => id)).toEqual(["fresh", "skipped-by-b"])
    expect(claimableLocalGames(history, "b").map(({ id }) => id)).toEqual(["fresh", "skipped-by-a"])
  })
})

describe("applyClaimDecisions", () => {
  it("claims selected games with an optional me seat and records who skipped the rest", () => {
    const next = applyClaimDecisions([game("one"), game("two"), game("three")], "a", [
      { id: "one", claim: true, mePlayerId: grace },
      { id: "two", claim: true },
      { id: "three", claim: false },
    ])
    expect(next[0]).toMatchObject({
      account: { ownerId: "a", mePlayerId: grace },
      publish: "pending",
    })
    expect(next[1]).toMatchObject({ account: { ownerId: "a" }, publish: "pending" })
    expect(next[1].account?.mePlayerId).toBeUndefined()
    expect(next[2]).toMatchObject({ skippedBy: ["a"] })
    expect(next[2].account).toBeUndefined()
  })

  it("lets a second account claim a game the first skipped, after which neither account is asked again", () => {
    const afterA = applyClaimDecisions([game("one")], "a", [{ id: "one", claim: false }])
    expect(claimableLocalGames(afterA, "a")).toEqual([])
    expect(claimableLocalGames(afterA, "b")).toHaveLength(1)

    const afterB = applyClaimDecisions(afterA, "b", [{ id: "one", claim: true }])
    expect(afterB[0]).toMatchObject({ account: { ownerId: "b" }, publish: "pending" })
    expect(claimableLocalGames(afterB, "a")).toEqual([])
    expect(claimableLocalGames(afterB, "b")).toEqual([])
  })

  it("does not skip twice, and leaves games another account already claimed alone", () => {
    const skipped = applyClaimDecisions([game("one", { skippedBy: ["a"] })], "a", [
      { id: "one", claim: false },
    ])
    expect(skipped[0].skippedBy).toEqual(["a"])
    const owned = game("one", { account: { ownerId: "b" }, publish: "published" })
    expect(applyClaimDecisions([owned], "a", [{ id: "one", claim: true }])[0]).toBe(owned)
  })
})

describe("localGameVisibleTo", () => {
  it("hides claimed games from other viewers and skipped games from the account that skipped them", () => {
    const owned = game("owned", { account: { ownerId: "a" } })
    const skipped = game("skipped", { skippedBy: ["a"] })
    expect(localGameVisibleTo(owned, "a")).toBe(true)
    expect(localGameVisibleTo(owned, "b")).toBe(false)
    expect(localGameVisibleTo(owned)).toBe(false)
    expect(localGameVisibleTo(skipped, "a")).toBe(false)
    expect(localGameVisibleTo(skipped, "b")).toBe(true)
    expect(localGameVisibleTo(skipped)).toBe(true)
  })
})
