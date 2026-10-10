import { fireEvent, render } from "@testing-library/react-native"

import { playTableRules } from "@/features/game/playSystems"
import { ThemeProvider } from "@/theme/context"

import { CounterChips, type SeatTable } from "./CounterChips"

const commander = playTableRules("mtg", "commander")

function seat(overrides: Partial<SeatTable> = {}): SeatTable {
  return {
    rules: commander,
    counters: {},
    held: [],
    editable: true,
    adjustCounter: jest.fn(),
    takeDesignation: jest.fn(),
    releaseDesignation: jest.fn(),
    ...overrides,
  }
}

function chips(table: SeatTable) {
  return render(
    <ThemeProvider initialContext="dark">
      <CounterChips
        seat={table}
        seatNumber={1}
        identity="Seat 1, Ada"
        color="#41476E"
        foreground="#FFFFFF"
        contentRotation={0}
        cardSize={{ width: 320, height: 400 }}
      />
    </ThemeProvider>,
  )
}

describe("CounterChips", () => {
  it("bumps a chip by its counter's step", () => {
    const table = seat({ counters: { poison: 3, commanderTax: 2 } })
    const view = chips(table)

    fireEvent.press(view.getByTestId("counter-chip-1-poison"))
    fireEvent.press(view.getByTestId("counter-chip-1-commanderTax"))

    expect(table.adjustCounter).toHaveBeenNthCalledWith(1, "poison", 1)
    expect(table.adjustCounter).toHaveBeenNthCalledWith(2, "commanderTax", 2)
  })

  it("adds an absent counter or takes a designation from the faint plus", () => {
    const table = seat({ counters: { poison: 3 }, held: ["initiative"] })
    const view = chips(table)

    fireEvent.press(view.getByTestId("counter-add-seat-1"))
    expect(view.queryByTestId("counter-option-1-poison")).toBeNull()
    fireEvent.press(view.getByTestId("counter-option-1-commanderTax"))
    expect(table.adjustCounter).toHaveBeenCalledWith("commanderTax", 2)
    expect(view.queryByTestId("counter-sheet-seat-1")).toBeNull()

    fireEvent.press(view.getByTestId("counter-add-seat-1"))
    fireEvent.press(view.getByTestId("designation-option-1-monarch"))
    expect(table.takeDesignation).toHaveBeenCalledWith("monarch")

    fireEvent.press(view.getByTestId("counter-add-seat-1"))
    fireEvent.press(view.getByLabelText("Give up Initiative"))
    expect(table.releaseDesignation).toHaveBeenCalledWith("initiative")
  })

  it("edits from a held chip: steps never go below zero and remove clears the count", () => {
    const table = seat({ counters: { commanderTax: 1 } })
    const view = chips(table)

    fireEvent(view.getByTestId("counter-chip-1-commanderTax"), "longPress")
    expect(view.getByTestId("counter-edit-value-1")).toHaveTextContent("1")
    fireEvent.press(view.getByTestId("counter-edit-1-commanderTax-minus"))
    expect(table.adjustCounter).toHaveBeenLastCalledWith("commanderTax", -1)

    fireEvent.press(view.getByTestId("counter-remove-1"))
    expect(table.adjustCounter).toHaveBeenLastCalledWith("commanderTax", -1)
    expect(view.queryByTestId("counter-sheet-seat-1")).toBeNull()
  })

  it("shows another device's chips without letting this one change them", () => {
    const table = seat({ counters: { poison: 10 }, held: ["monarch"], editable: false })
    const view = chips(table)

    expect(view.getByLabelText("Seat 1, Ada, Poison")).toHaveProp("accessibilityValue", {
      text: "10 of 10",
    })
    expect(view.getByTestId("designation-chip-1-monarch")).toBeTruthy()
    expect(view.queryByTestId("counter-add-seat-1")).toBeNull()
    fireEvent.press(view.getByTestId("counter-chip-1-poison"))
    expect(table.adjustCounter).not.toHaveBeenCalled()
  })
})
