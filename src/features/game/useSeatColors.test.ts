import { renderHook } from "@testing-library/react-native"

import { useSeatColors } from "./useSeatColors"

describe("useSeatColors", () => {
  it("keeps the same array when players are rebuilt with the same colors", () => {
    const { result, rerender } = renderHook(useSeatColors, {
      initialProps: [{ color: "#f00" }, { color: "#00f" }],
    })
    const first = result.current

    rerender([{ color: "#f00" }, { color: "#00f" }])
    expect(result.current).toBe(first)

    rerender([{ color: "#f00" }, { color: "rgb(0, 255, 0)" }])
    expect(result.current).toEqual(["#f00", "rgb(0, 255, 0)"])
  })
})
