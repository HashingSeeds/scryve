import { act, renderHook } from "@testing-library/react-native"

import { useBoardModes, type BoardModesInput } from "./useBoardModes"
import { startModes } from "../../../convex/lib/tableModes"

const players = ["ada", "bo", "cy", "dee"].map((id) => ({ id, name: id }))
const groups = [
  ["ada", "bo"],
  ["cy", "dee"],
]
const { modes } = startModes({ planechase: {} }, ["ada", "bo", "cy", "dee"])
const turn = { playerId: "ada", number: 1, startedAt: 0, operationId: "t", waiting: true } as const

const boardModes = (input: Partial<BoardModesInput> = {}) =>
  renderHook(() =>
    useBoardModes({
      modes,
      turn,
      groups,
      players,
      controls: () => true,
      act: () => true,
      ...input,
    }),
  )

describe("useBoardModes", () => {
  it("rolls the dialog's die for the active seat whose bag opened it, else the first one this device holds", () => {
    const local = boardModes()
    act(() => local.result.current.openDialog("planar", "bo"))
    expect(local.result.current.dialogSeat).toBe("bo")
    act(() => local.result.current.openDialog("planar", "cy"))
    expect(local.result.current.dialogSeat).toBe("ada")
    act(() => local.result.current.openDialog("planar"))
    expect(local.result.current.dialogSeat).toBe("ada")

    const connected = boardModes({ controls: (id) => id === "bo" || id === "cy" })
    act(() => connected.result.current.openDialog("planar", "ada"))
    expect(connected.result.current.dialogSeat).toBe("bo")
  })
})
