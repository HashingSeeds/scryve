import type { ReactNode } from "react"
import { renderHook } from "@testing-library/react-native"

import { TurnSpotlightContext, useSeatDimmed } from "./TurnSpotlight"

function dimmed(playerId: string, active: readonly string[] | undefined) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TurnSpotlightContext.Provider value={active ? { active } : undefined}>
      {children}
    </TurnSpotlightContext.Provider>
  )
  return renderHook(() => useSeatDimmed(playerId), { wrapper }).result.current
}

describe("useSeatDimmed", () => {
  it("dims only the seats outside the turn, so both teammates stay lit on their team's turn", () => {
    expect(dimmed("ada", ["ada", "bo"])).toBe(false)
    expect(dimmed("bo", ["ada", "bo"])).toBe(false)
    expect(dimmed("cy", ["ada", "bo"])).toBe(true)
  })

  it("leaves every seat lit until someone has the turn", () => {
    expect(dimmed("ada", undefined)).toBe(false)
    expect(dimmed("ada", [])).toBe(false)
  })
})
