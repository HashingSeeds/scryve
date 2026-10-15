import { applyLifeChange, controlsSeat, isSameLifeChange } from "./gameRules"

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
    expect(isSameLifeChange({ ...request, delta: -4 }, request)).toBe(false)
    expect(isSameLifeChange({ ...request, clientCreatedAt: undefined }, request)).toBe(false)
  })

  it("floors life at zero only for systems that stop there", () => {
    expect(applyLifeChange("ygo", 500, -800)).toEqual({ delta: -500, currentLife: 0 })
    expect(applyLifeChange("mtg", 5, -8)).toEqual({ delta: -8, currentLife: -3 })
  })
})
