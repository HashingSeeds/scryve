import { attackerLayout } from "./CommanderDamageCardControls"

describe("attackerLayout", () => {
  it("narrows partner power boxes so both fit a short seat with their margins", () => {
    const { width, height } = attackerLayout({ space: { width: 180, height: 120 }, count: 2 })
    expect(width * 2 + 16 * 3).toBeLessThanOrEqual(180)
    expect(height).toBeGreaterThanOrEqual(44)
  })
})
