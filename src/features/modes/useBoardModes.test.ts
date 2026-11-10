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
      turnsOn: true,
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

  it("lets every seat roll with Turns off in Archenemy, and only the active side with Turns on", () => {
    const seats = ["ada", "bo", "cy", "dee"]
    const started = startModes({ archenemy: { seat: 1 }, planechase: {} }, seats)
    const input = { modes: started.modes, groups: started.turnGroups }
    const off = boardModes({ ...input, turnsOn: false })
    act(() => off.result.current.openDialog("planar", "cy"))
    expect(off.result.current.dialogSeat).toBe("cy")
    expect(seats.map((seat) => off.result.current.planar?.dieFor(seat).canRoll)).toEqual([
      true,
      true,
      true,
      true,
    ])

    const on = boardModes({ ...input, turnsOn: true })
    act(() => on.result.current.openDialog("planar", "cy"))
    expect(on.result.current.dialogSeat).toBe("ada")
    expect(seats.map((seat) => on.result.current.planar?.dieFor(seat).canRoll)).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  it("offers Reset cost whenever Turns are off, even in a game that holds a turn", () => {
    expect(boardModes().result.current.planar?.manualReset).toBe(false)
    expect(boardModes({ turnsOn: false }).result.current.planar?.manualReset).toBe(true)
    expect(boardModes({ turn: undefined }).result.current.planar?.manualReset).toBe(true)
  })
})
