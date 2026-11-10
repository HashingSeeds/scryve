import { AccessibilityInfo, Platform, StyleSheet } from "react-native"
import { act, fireEvent, render, within } from "@testing-library/react-native"

import { playTableRules } from "@/features/game/playSystems"
import { ThemeProvider } from "@/theme/context"

import { CounterChips, fitChips, type CounterChipsProps, type SeatTable } from "./CounterChips"
import { LifeCard } from "./LifeCard"
import { customCounterId } from "../../convex/lib/table"

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
        bagAt={{ right: 16, bottom: 16 }}
        {...props}
      />
    </ThemeProvider>
  )
}

const chips = (table: SeatTable, props?: Partial<CounterChipsProps>) =>
  render(chipsElement(table, props))

describe("CounterChips", () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

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

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))
    const tax = view.getByTestId("counter-option-1-commanderTax")
    expect(tax).toHaveProp("accessibilityLabel", "Seat 1, Ada, add 2 Commander tax")
    fireEvent.press(tax)
    expect(table.adjustCounter).toHaveBeenCalledWith("commanderTax", 2)
    expect(view.queryByTestId("counter-sheet-seat-1")).toBeNull()

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))
    fireEvent.press(view.getByTestId("designation-option-1-monarch"))
    expect(table.takeDesignation).toHaveBeenCalledWith("monarch")

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))
    fireEvent.press(view.getByLabelText("Give up Initiative"))
    expect(table.releaseDesignation).toHaveBeenCalledWith("initiative")
  })

  it("shortens Commander tax only when its column is too narrow, and moves its rule to a long press when the column is narrower still", () => {
    const rules = { tableItemRules: { commanderTax: "903.8" }, openRule: jest.fn() }
    const wide = chips(seat(rules), { cardSize: { width: 500, height: 400 } })
    fireEvent.press(wide.getByTestId("seat-bag-seat-1"))
    expect(wide.getByTestId("counter-option-1-commanderTax")).toHaveTextContent("Commander tax")
    expect(wide.getByTestId("counter-rule-1-commanderTax")).toBeTruthy()
    wide.unmount()

    const narrow = chips(seat(rules), { cardSize: { width: 320, height: 400 } })
    fireEvent.press(narrow.getByTestId("seat-bag-seat-1"))
    const tax = narrow.getByTestId("counter-option-1-commanderTax")
    expect(tax).toHaveTextContent("Tax")
    expect(tax).toHaveProp("accessibilityLabel", "Seat 1, Ada, add 2 Commander tax")
    expect(narrow.getByTestId("counter-rule-1-commanderTax")).toBeTruthy()
    narrow.unmount()

    const tight = chips(seat(rules), { cardSize: { width: 240, height: 400 } })
    fireEvent.press(tight.getByTestId("seat-bag-seat-1"))
    expect(tight.queryByTestId("counter-rule-1-commanderTax")).toBeNull()
    fireEvent(tight.getByTestId("counter-option-1-commanderTax"), "longPress")
    expect(rules.openRule).toHaveBeenCalledWith("903.8")
  })

  it("opens the bag from the seat's corner and closes it from the same spot", () => {
    const view = chips(seat())
    const bag = view.getByTestId("seat-bag-seat-1")
    expect(StyleSheet.flatten(bag.props.style)).toMatchObject({ right: 16, bottom: 16 })

    fireEvent.press(bag)
    const close = view.getByTestId("counter-close-1")
    const size = StyleSheet.flatten(close.props.style).minHeight
    expect(StyleSheet.flatten(close.props.style)).toMatchObject({
      left: 320 - 16 - size,
      top: 400 - 16 - size,
    })
    fireEvent.press(close)
    expect(view.queryByTestId("counter-sheet-seat-1")).toBeNull()
  })

  it("keeps a sideways sheet's top-edge side clear of a notch, and its other side in place", () => {
    const insets = { top: 50, bottom: 0, left: 0, right: 0 }
    const view = chips(seat(), { contentRotation: -90, contentInsets: insets })

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))
    expect(StyleSheet.flatten(view.getByTestId("counter-sheet-seat-1").props.style)).toMatchObject({
      paddingRight: 39,
      paddingLeft: 14,
    })
  })

  it("rolls a die for its own seat on a tap, and more shrinks the trackers to icons until one is tapped", () => {
    const dice = {
      tools: ["d4", "d6", "d20", "coin"] as const,
      rollFor: jest.fn(),
    }
    const view = chips(seat(), { dice })

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))
    expect(view.queryByTestId("bag-tool-d4-seat-1")).toBeNull()
    fireEvent.press(view.getByTestId("bag-tool-d20-seat-1"))
    expect(dice.rollFor).toHaveBeenCalledWith("d20")
    expect(view.queryByTestId("counter-sheet-seat-1")).toBeNull()

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))
    fireEvent.press(view.getByRole("button", { name: "More dice" }))
    expect(view.getByTestId("counter-option-1-poison")).not.toHaveTextContent("Poison")
    fireEvent.press(view.getByTestId("counter-option-1-poison"))
    expect(view.queryByTestId("bag-tool-d4-seat-1")).toBeNull()
    expect(dice.rollFor).toHaveBeenCalledTimes(1)

    fireEvent.press(view.getByRole("button", { name: "More dice" }))
    fireEvent.press(view.getByTestId("bag-tool-d4-seat-1"))
    expect(dice.rollFor).toHaveBeenLastCalledWith("d4")
  })

  it("opens the plane from the bag, keeping a narrow bag to two rows", () => {
    const dice = {
      tools: ["d4", "d6", "d20", "coin"] as const,
      rollFor: jest.fn(),
      openPlane: jest.fn(),
    }
    const view = chips(seat(), { dice })

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))
    expect(view.getByTestId("bag-tool-d20-seat-1")).toBeTruthy()
    expect(view.queryByTestId("bag-tool-coin-seat-1")).toBeNull()
    fireEvent.press(view.getByRole("button", { name: "Planechase" }))
    expect(dice.openPlane).toHaveBeenCalledTimes(1)
    expect(dice.rollFor).not.toHaveBeenCalled()
    expect(view.queryByTestId("counter-sheet-seat-1")).toBeNull()
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

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))
    expect(view.getByTestId("counter-option-1-poison")).toHaveTextContent("10Poison")
    fireEvent.press(view.getByLabelText("Edit Poison, 10"))
    expect(table.adjustCounter).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("counter-edit-1-poison-minus"))
    expect(table.adjustCounter).toHaveBeenCalledWith("poison", -1)
  })

  it("opens the rule that governs an edited counter, and shows none for a counter without one", () => {
    const openRule = jest.fn()
    const table = seat({
      counters: { poison: 3, experience: 1 },
      tableItemRules: { poison: "104.3d" },
      openRule,
    })
    const view = chips(table)

    fireEvent(view.getByTestId("counter-chip-1-poison"), "longPress")
    fireEvent.press(view.getByLabelText("Rule 104.3d"))
    expect(openRule).toHaveBeenCalledWith("104.3d")
    fireEvent.press(view.getByTestId("counter-close-1"))
    fireEvent(view.getByTestId("counter-chip-1-experience"), "longPress")
    expect(view.queryByTestId("counter-rule-1")).toBeNull()
  })

  it("opens a counter's rule from the plus sheet without adding to it", () => {
    const openRule = jest.fn()
    const table = seat({ tableItemRules: { poison: "104.3d" }, openRule })
    const view = chips(table, { cardSize: { width: 460, height: 400 } })

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))
    fireEvent.press(view.getByTestId("counter-rule-1-poison"))
    expect(openRule).toHaveBeenCalledWith("104.3d")
    expect(table.adjustCounter).not.toHaveBeenCalled()
  })

  it("opens a designation's rule from the plus sheet without taking it", () => {
    const openRule = jest.fn()
    const table = seat({ tableItemRules: { monarch: "725", initiative: "726" }, openRule })
    const view = chips(table)

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))
    expect(view.getByTestId("designation-rule-1-initiative")).toHaveProp(
      "accessibilityLabel",
      "Rule 726",
    )
    fireEvent.press(view.getByLabelText("Rule 725"))
    expect(openRule).toHaveBeenCalledWith("725")
    expect(table.takeDesignation).not.toHaveBeenCalled()
  })

  it("puts each designation's rule link right after its option", () => {
    const table = seat({ tableItemRules: { monarch: "725" }, openRule: jest.fn() })
    const view = chips(table)

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))
    let optionCell = view.getByTestId("designation-option-1-monarch").parent
    while (optionCell && StyleSheet.flatten(optionCell.props.style)?.width !== "50%") {
      optionCell = optionCell.parent
    }
    expect(optionCell && within(optionCell).getByTestId("designation-rule-1-monarch")).toBeTruthy()
  })

  it("shows another device's chips without letting this one change them", () => {
    const table = seat({ counters: { poison: 10 }, held: ["monarch"], editable: false })
    const view = chips(table)

    expect(view.getByLabelText("Seat 1, Ada, Poison")).toHaveProp("accessibilityValue", {
      text: "10 of 10",
    })
    expect(view.getByTestId("designation-chip-1-monarch")).toBeTruthy()
    expect(view.queryByTestId("seat-bag-seat-1")).toBeNull()
    fireEvent.press(view.getByTestId("counter-chip-1-poison"))
    expect(table.adjustCounter).not.toHaveBeenCalled()
  })

  it("fits chips between the name and the bag, folding the rest into a +N that opens the bag", () => {
    expect(fitChips([30, 30, 30], 94, 2, 24)).toEqual({ shown: 3, overflow: 0 })
    expect(fitChips([30, 30, 30], 60, 2, 24)).toEqual({ shown: 1, overflow: 2 })
    expect(fitChips([30], 20, 2, 24)).toEqual({ shown: 0, overflow: 0 })

    const view = chips(
      seat({ counters: { poison: 5, commanderTax: 4 }, held: ["monarch", "initiative"] }),
      { compact: true, contentRotation: 90, cardSize: { width: 158, height: 154 }, nameEnd: 40 },
    )
    const row = StyleSheet.flatten(view.getByTestId("counter-chips-seat-1").props.style)
    expect(row).toMatchObject({ right: 16 + 32 + 2, bottom: 16, flexDirection: "row-reverse" })
    expect(view.getByTestId("designation-chip-1-monarch")).toBeTruthy()
    expect(view.queryByTestId("counter-chip-1-poison")).toBeNull()
    fireEvent.press(view.getByLabelText("Seat 1, Ada, 3 more counters"))
    expect(view.getByTestId("counter-sheet-seat-1")).toBeTruthy()
  })

  it("names every counter in the bag opened from +N on a six-seat 320pt phone", () => {
    const names = ["Speed", "Rad", "Storm", "Tickets"]
    const values = [2, 3, 1, 5]
    const custom = names.map((name) => ({
      id: customCounterId(name),
      label: name,
      step: 1,
      max: 99,
    }))
    const table = seat({
      rules: { ...commander, counters: [...commander.counters, ...custom], customCounters: true },
      counters: Object.fromEntries(custom.map(({ id }, index) => [id, values[index]!])),
    })
    const view = chips(table, {
      compact: true,
      contentRotation: -90,
      cardSize: { width: 159, height: 230 },
      nameEnd: 120,
      dice: { tools: ["d4", "d6", "d20", "coin"] as const, rollFor: jest.fn() },
    })
    fireEvent.press(view.getByLabelText(/more counters/))
    const sheet = view.getByTestId("counter-sheet-seat-1")
    custom.forEach(({ id }, index) => {
      const option = within(sheet).getByTestId(`counter-option-1-${id}`)
      expect(option).toHaveTextContent(`${values[index]}${names[index]}`)
      let cell = option.parent
      while (cell && StyleSheet.flatten(cell.props.style)?.width === undefined) cell = cell.parent
      expect(StyleSheet.flatten(cell?.props.style)).toMatchObject({ width: "100%" })
    })
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
  })

  it("moves focus into an opened sheet and back to the control that opened it", () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent")
    focus.mockClear()
    const view = chips(seat({ counters: { poison: 2 } }))

    fireEvent(view.getByTestId("counter-chip-1-poison"), "longPress")
    expect(focus).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByTestId("counter-close-1"))
    expect(focus).toHaveBeenCalledTimes(2)
    expect(focus).toHaveBeenLastCalledWith(expect.anything(), "focus")

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))
    fireEvent.press(view.getByLabelText("Edit Poison, 2"))
    expect(focus).toHaveBeenCalledTimes(4)
  })

  it("moves focus to Name a counter when it is a no-system game's only option", () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent")
    const view = chips(seat({ rules: playTableRules(undefined) }))
    focus.mockClear()

    fireEvent.press(view.getByTestId("seat-bag-seat-1"))

    expect(view.getByTestId("counter-option-1-custom")).toBeTruthy()
    expect(focus).toHaveBeenCalledWith(expect.anything(), "focus")
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
  })

  it("takes the card's own controls out of reach while a sheet covers it, and opening one starts play", () => {
    const onPlayStart = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={40}
          color="#41476E"
          seatTable={seat({ counters: { poison: 2 } })}
          onPlayStart={onPlayStart}
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
    expect(onPlayStart).toHaveBeenCalledTimes(1)

    fireEvent.press(view.getByTestId("counter-close-1"))
    expect(view.getByTestId("life-seat-1-1")).toBeTruthy()
  })
})
