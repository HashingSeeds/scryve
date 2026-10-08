import { renderHook } from "@testing-library/react-native"

import { useStructurallyStable } from "./useStructurallyStable"

describe("useStructurallyStable", () => {
  it("keeps the first value until a rebuilt one differs in content", () => {
    const { result, rerender } = renderHook(useStructurallyStable<{ seats: string[] }>, {
      initialProps: { seats: ["a", "b"] },
    })
    const first = result.current

    rerender({ seats: ["a", "b"] })
    expect(result.current).toBe(first)

    rerender({ seats: ["a", "c"] })
    expect(result.current).toEqual({ seats: ["a", "c"] })
  })
})
