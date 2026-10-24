import { renderHook } from "@testing-library/react-native"

import { useStableCallbacks } from "./useStableCallbacks"

function useSeats({ seats, round }: { seats: string[]; round: number }) {
  const stable = useStableCallbacks()
  return new Map(seats.map((seat) => [seat, stable(`change:${seat}`, () => `${seat}@${round}`)]))
}

describe("useStableCallbacks", () => {
  it("drops keys a render skips and keeps surviving keys on one identity", () => {
    const { result, rerender } = renderHook(useSeats, {
      initialProps: { seats: ["host", "game-0"], round: 0 },
    })
    const host = result.current.get("host")
    const finished = new Map<string, unknown>()
    for (let round = 1; round <= 50; round++) {
      finished.set(`game-${round - 1}`, result.current.get(`game-${round - 1}`))
      rerender({ seats: ["host", `game-${round}`], round })
    }

    expect(result.current.get("host")).toBe(host)
    expect(host?.()).toBe("host@50")

    rerender({ seats: [...finished.keys()], round: 51 })

    for (const [seat, callback] of finished) expect(result.current.get(seat)).not.toBe(callback)
    expect(result.current.get("game-0")?.()).toBe("game-0@51")
  })
})
