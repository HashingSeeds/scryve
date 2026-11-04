import { attackerLayout, pulseFrame } from "./CommanderDamageCardControls"

describe("attackerLayout", () => {
  it("narrows partner power boxes so both fit a short seat with their margins", () => {
    const { width, height } = attackerLayout({ space: { width: 180, height: 120 }, count: 2 })
    expect(width * 2 + 16 * 3).toBeLessThanOrEqual(180)
    expect(height).toBeGreaterThanOrEqual(44)
  })
})

describe("pulseFrame", () => {
  it("leaves nothing visible between and after pulses, and grows outward", () => {
    expect(pulseFrame(0, 0.6).opacity).toBeCloseTo(0)
    expect(pulseFrame(1, 0.6).opacity).toBeCloseTo(0)
    expect(pulseFrame(0.5, 0.6).opacity).toBeGreaterThan(0)
    expect(pulseFrame(0, 0.6).scale).toBeLessThan(pulseFrame(1, 0.6).scale)
  })
})
