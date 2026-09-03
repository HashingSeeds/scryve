import { StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { asPlayerId } from "@/features/game/domain"
import type { PlayerId } from "@/features/game/types"
import { ThemeProvider } from "@/theme/context"

import {
  CommanderDamageBoard,
  commanderCellTestId,
  commanderStageTestId,
  commanderSwordTestId,
} from "./CommanderDamageBoard"
import { COMMANDER_MIN_CELL_SIZE, commanderBoardSeats } from "./commanderDamageLayout"

const ids = Array.from({ length: 4 }, (_, index) => asPlayerId(`player-${index}`))
const { seats, rows, columns } = commanderBoardSeats(
  [
    [0, 1],
    [2, 3],
  ],
  ids,
)

function board(
  overrides: Partial<React.ComponentProps<typeof CommanderDamageBoard>> = {},
  owner = 0,
) {
  return render(
    <ThemeProvider initialContext="light">
      <CommanderDamageBoard
        ownerPlayerId={ids[owner]}
        seats={seats}
        rows={rows}
        columns={columns}
        contentRotation={0}
        incoming={{} as Record<PlayerId, number>}
        foreground="#FFFFFF"
        seatNumber={owner + 1}
        {...overrides}
      />
    </ThemeProvider>,
  )
}

describe("CommanderDamageBoard", () => {
  it("shows a sword for the owner and a cell for everyone else", () => {
    const view = board({}, 1)
    expect(view.getByTestId(commanderSwordTestId(2))).toBeTruthy()
    expect(view.queryByTestId(commanderCellTestId(2, ids[1]))).toBeNull()
    for (const index of [0, 2, 3])
      expect(view.getByTestId(commanderCellTestId(2, ids[index]))).toBeTruthy()
  })

  it("keeps zero totals out of the way and brings real damage forward", () => {
    const view = board({ incoming: { [ids[0]]: 0, [ids[2]]: 6 } as Record<PlayerId, number> }, 1)
    const idle = StyleSheet.flatten(view.getByTestId(commanderCellTestId(2, ids[0])).props.style)
    const active = StyleSheet.flatten(view.getByTestId(commanderCellTestId(2, ids[2])).props.style)
    expect(idle.opacity).toBeLessThan(1)
    expect(active.opacity).toBeUndefined()
  })

  it("fits a two-digit total inside its cell", () => {
    const view = board({ incoming: { [ids[0]]: 11 } as Record<PlayerId, number> }, 1)
    const cell = StyleSheet.flatten(view.getByTestId(commanderCellTestId(2, ids[0])).props.style)
    const total = StyleSheet.flatten(view.getByText("11").props.style)

    expect(total.fontSize * 2 * 0.62).toBeLessThanOrEqual(cell.width)
  })

  it("shows no steppers until someone is armed", () => {
    const view = board({}, 1)
    expect(view.queryByTestId(commanderStageTestId(2, 1))).toBeNull()
    expect(view.queryByTestId(commanderStageTestId(2, -1))).toBeNull()
  })

  it("keeps the compact grid read-only while a commander is armed", () => {
    const view = board({ armedPlayerId: ids[0] }, 1)
    expect(view.queryByTestId(commanderStageTestId(2, 1))).toBeNull()
    expect(view.queryByTestId(commanderStageTestId(2, -1))).toBeNull()
  })

  it("does not put steppers on the attacker's own board", () => {
    const view = board({ armedPlayerId: ids[0] }, 0)
    expect(view.queryByTestId(commanderStageTestId(1, 1))).toBeNull()
  })

  it("keeps showing the recorded total while assignment happens on the card", () => {
    const view = board(
      {
        armedPlayerId: ids[0],
        incoming: { [ids[0]]: 7 } as Record<PlayerId, number>,
      },
      1,
    )
    expect(view.getByText("7")).toBeTruthy()
  })

  it("presses the sword to arm and again to send", () => {
    const onPressSword = jest.fn()
    const view = board({ onPressSword }, 1)
    fireEvent.press(view.getByTestId(commanderSwordTestId(2)))
    expect(onPressSword).toHaveBeenCalledTimes(1)
  })

  it("turns the cell glyphs with the rest of the card's content", () => {
    const view = board(
      { contentRotation: 90, incoming: { [ids[0]]: 3 } as Record<PlayerId, number> },
      1,
    )
    const total = view.getByText("3")
    expect(StyleSheet.flatten(total.props.style).transform).toEqual([{ rotate: "90deg" }])
  })

  it("shrinks cells to fit the space the card reserved", () => {
    const view = board({ maxSize: { width: 40, height: 40 } }, 1)
    const cell = view.getByTestId(commanderCellTestId(2, ids[0]))
    expect(StyleSheet.flatten(cell.props.style).width).toBe(19)
  })

  it("never shrinks a cell past the legibility floor", () => {
    const view = board({ maxSize: { width: 8, height: 8 } }, 1)
    const cell = view.getByTestId(commanderCellTestId(2, ids[0]))
    expect(StyleSheet.flatten(cell.props.style).width).toBe(COMMANDER_MIN_CELL_SIZE)
  })
})
