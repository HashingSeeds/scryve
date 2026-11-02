import {
  applyLifeChange,
  commanderClaimOutcome,
  confirmCommanderClaim,
  controlsSeat,
  isSameCommanderClaim,
  isSameLifeChange,
  lastChangeFor,
  MAX_PENDING_COMMANDER_CLAIMS,
} from "./gameRules"

const player = { userId: "player", deviceId: "phone", isHost: false }
const host = { userId: "host", deviceId: "tablet", isHost: true }

describe("game rules", () => {
  it("lets a claimed seat's player write from their pinned device, and the host only for unclaimed seats", () => {
    const claimed = { userId: "player", deviceId: "phone" }

    expect(controlsSeat(claimed, player)).toBe(true)
    expect(controlsSeat(claimed, { ...player, deviceId: "laptop" })).toBe(false)
    expect(controlsSeat(claimed, host)).toBe(false)
    expect(controlsSeat({}, host)).toBe(true)
    expect(controlsSeat({}, player)).toBe(false)
  })

  it("treats a reused operation as a retry only when every field matches", () => {
    const request = {
      playerId: "seat",
      actorUserId: "player",
      delta: -3,
      deviceId: "phone",
      clientCreatedAt: 10,
    }

    expect(isSameLifeChange({ ...request }, request)).toBe(true)
    for (const nearMiss of [
      { playerId: "other seat" },
      { actorUserId: "someone else" },
      { delta: -4 },
      { deviceId: "laptop" },
      { clientCreatedAt: 11 },
      { clientCreatedAt: undefined },
    ])
      expect(isSameLifeChange({ ...request, ...nearMiss }, request)).toBe(false)
  })

  it("treats a commander claim from the partner as a different claim", () => {
    const request = {
      operationId: "claim",
      fromPlayerId: "attacker",
      toPlayerId: "defender",
      delta: 3,
      actorUserId: "player",
      deviceId: "phone",
      clientCreatedAt: 10,
    }

    expect(isSameCommanderClaim({ ...request }, request)).toBe(true)
    expect(isSameCommanderClaim({ ...request, commander: 1 }, { ...request, commander: 1 })).toBe(
      true,
    )
    expect(isSameCommanderClaim({ ...request, commander: 1 }, request)).toBe(false)
    expect(isSameCommanderClaim(request, { ...request, commander: 1 })).toBe(false)
  })

  it("floors life at zero only for systems that stop there", () => {
    expect(applyLifeChange("ygo", 500, -800)).toEqual({ delta: -500, currentLife: 0 })
    expect(applyLifeChange("mtg", 5, -8)).toEqual({ delta: -8, currentLife: -3 })
  })

  it("declines a commander claim on arrival when it could never be confirmed", () => {
    const open = { total: 10, delta: 5, pendingClaims: 0, pairHasPendingClaim: false }

    expect(commanderClaimOutcome(open)).toBe("pending")
    expect(commanderClaimOutcome({ ...open, delta: 90 })).toBe("declined")
    expect(commanderClaimOutcome({ ...open, delta: -11 })).toBe("declined")
    expect(commanderClaimOutcome({ ...open, pairHasPendingClaim: true })).toBe("declined")
    expect(commanderClaimOutcome({ ...open, pendingClaims: MAX_PENDING_COMMANDER_CLAIMS })).toBe(
      "declined",
    )
  })

  it("moves life one for one when a claim is confirmed, and refuses totals outside 0 to 99", () => {
    expect(confirmCommanderClaim({ total: 18, life: 4, delta: 7 })).toEqual({
      total: 25,
      currentLife: -3,
    })
    expect(confirmCommanderClaim({ total: 95, life: 40, delta: 5 })).toBeNull()
  })
})

describe("lastChangeFor", () => {
  const lastWrite = { actorUserId: "player", deviceId: "phone", tappedAt: 500 }
  const seat = { userId: "player", deviceId: "phone", lastWrite }

  it("times another device's tap, and marks a change to a seat that device doesn't hold", () => {
    expect(lastChangeFor(seat, { userId: "host", deviceId: "tablet" }, "host")).toEqual({
      tappedAt: 500,
      crossSeat: false,
    })
    expect(
      lastChangeFor(
        { ...seat, lastWrite: { ...lastWrite, actorUserId: "host" } },
        { userId: "other" },
        "host",
      ),
    ).toEqual({ tappedAt: 500, crossSeat: true })
    expect(lastChangeFor(seat, { userId: "player", deviceId: "laptop" }, "host")).toMatchObject({
      tappedAt: 500,
    })
  })

  it("leaves out this device's own taps and changes sent without one", () => {
    expect(lastChangeFor(seat, { userId: "player", deviceId: "phone" }, "host")).toBeUndefined()
    expect(lastChangeFor(seat, { userId: "player" }, "host")).toBeUndefined()
    const untimed = { ...seat, lastWrite: { actorUserId: "player", deviceId: "phone" } }
    expect(lastChangeFor(untimed, { userId: "host" }, "host")).toBeUndefined()
  })
})
