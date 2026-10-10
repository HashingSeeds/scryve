import { AccessibilityInfo, Platform, StyleSheet } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { playTableRules } from "@/features/game/playSystems"
import { ThemeProvider } from "@/theme/context"

import { CounterChips, type CounterChipsProps, type SeatTable } from "./CounterChips"
import { LifeCard } from "./LifeCard"

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

function chipsElement(table: SeatTable, props: Partial<CounterChipsProps> = {}) {
  return (
    <ThemeProvider initialContext="dark">
      <CounterChips
        seat={table}
        seatNumber={1}
        identity="Seat 1, Ada"
        color="#41476E"
        foreground="#FFFFFF"
        contentRotation={0}
        cardSize={{ width: 320, height: 400 }}
        {...props}
      />
    </ThemeProvider>
  )
}

const chips = (table: SeatTable, props?: Partial<CounterChipsProps>) =>
  render(chipsElement(table, props))

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
    const table = seat({ held: ["initiative"] })
    const view = chips(table)

    fireEvent.press(view.getByTestId("counter-add-seat-1"))
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

  it("opens a counter in play from the plus sheet, so it can be corrected without a long press", () => {
    const table = seat({ counters: { poison: 10 } })
    const view = chips(table)

    fireEvent.press(view.getByTestId("counter-add-seat-1"))
    fireEvent.press(view.getByLabelText("Edit Poison, 10"))
    expect(table.adjustCounter).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("counter-edit-1-poison-minus"))
    expect(table.adjustCounter).toHaveBeenCalledWith("poison", -1)
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

  it("wraps a full row inside a narrow sideways six-player card instead of overflowing it", () => {
    // why: 6 players on a 320x568 board leaves sideways cards about 154px along their reading edge.
    const view = chips(
      seat({ counters: { poison: 5, commanderTax: 4 }, held: ["monarch", "initiative"] }),
      { compact: true, contentRotation: 90, cardSize: { width: 158, height: 154 } },
    )
    const row = view.getByTestId("counter-chips-seat-1")
    const rowStyle = StyleSheet.flatten(row.props.style)
    const frameStyle = StyleSheet.flatten(
      view.getByTestId("counter-chips-frame-seat-1").props.style,
    )

    expect(frameStyle.width).toBe(154)
    expect(rowStyle).toMatchObject({ flexWrap: "wrap", left: 4, right: 4 })
  })

  it("speaks every counter change and a newly taken designation, but not a lost one", () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility")
    announce.mockClear()
    const view = render(chipsElement(seat({ counters: { poison: 1 } })))

    view.rerender(chipsElement(seat({ counters: { poison: 2 }, held: ["monarch"] })))
    expect(announce).toHaveBeenLastCalledWith("Seat 1, Ada, Poison 2, now Monarch")

    announce.mockClear()
    view.rerender(chipsElement(seat({ counters: { poison: 2 } })))
    expect(announce).not.toHaveBeenCalled()
    announce.mockRestore()
  })

  it("moves focus into an opened sheet and back to the control that opened it", () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent")
    focus.mockClear()
    const view = chips(seat({ counters: { poison: 2 } }))

    fireEvent(view.getByTestId("counter-chip-1-poison"), "longPress")
    expect(focus).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByTestId("counter-done-1"))
    expect(focus).toHaveBeenCalledTimes(2)
    expect(focus).toHaveBeenLastCalledWith(expect.anything(), "focus")

    fireEvent.press(view.getByTestId("counter-add-seat-1"))
    fireEvent.press(view.getByLabelText("Edit Poison, 2"))
    expect(focus).toHaveBeenCalledTimes(4)
    focus.mockRestore()
  })

  it("re-reads a repeated message on web, such as retaking Monarch", () => {
    jest.useFakeTimers()
    jest.replaceProperty(Platform, "OS", "web")
    const view = render(chipsElement(seat()))
    const spoken = () =>
      view.getByTestId("counter-announcer-seat-1", { includeHiddenElements: true })

    view.rerender(chipsElement(seat({ held: ["monarch"] })))
    act(() => jest.advanceTimersByTime(100))
    expect(spoken()).toHaveTextContent("Seat 1, Ada, now Monarch")

    view.rerender(chipsElement(seat()))
    view.rerender(chipsElement(seat({ held: ["monarch"] })))
    expect(spoken()).toHaveTextContent("")
    act(() => jest.advanceTimersByTime(100))
    expect(spoken()).toHaveTextContent("Seat 1, Ada, now Monarch")
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it("takes the card's own controls out of reach while a sheet covers it", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={40}
          color="#41476E"
          seatTable={seat({ counters: { poison: 2 } })}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent(view.getByTestId("life-card-seat-1"), "layout", {
      nativeEvent: { layout: { width: 320, height: 400, x: 0, y: 0 } },
    })
    expect(view.getByTestId("life-seat-1-1")).toBeTruthy()

    fireEvent(view.getByTestId("counter-chip-1-poison"), "longPress")
    expect(view.queryByTestId("life-seat-1-1")).toBeNull()
    expect(view.queryByTestId("counter-chips-seat-1")).toBeNull()
    expect(view.getByTestId("life-total-seat-1", { includeHiddenElements: true })).not.toBeVisible()

    fireEvent.press(view.getByTestId("counter-done-1"))
    expect(view.getByTestId("life-seat-1-1")).toBeTruthy()
  })
})
