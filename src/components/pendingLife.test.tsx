import type { ReactNode } from "react"
import { act, renderHook } from "@testing-library/react-native"

import { PendingLifeProvider, usePendingLife } from "./pendingLife"

const teams = [["ada", "bo"], ["cy"]]

describe("usePendingLife", () => {
  it("adds teammates' held changes instead of letting one replace or clear the other's", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PendingLifeProvider teams={teams}>{children}</PendingLifeProvider>
    )
    const { result } = renderHook(
      () => ({ ada: usePendingLife("ada"), bo: usePendingLife("bo"), cy: usePendingLife("cy") }),
      { wrapper },
    )
    const shown = () => [result.current.ada[0], result.current.bo[0], result.current.cy[0]]

    act(() => result.current.ada[1](3))
    act(() => result.current.bo[1](-1))
    expect(shown()).toEqual([2, 2, 0])
    act(() => result.current.bo[1](0))
    expect(shown()).toEqual([3, 3, 0])
    act(() => result.current.ada[1](0))
    expect(shown()).toEqual([0, 0, 0])
  })
})
