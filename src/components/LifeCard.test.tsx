import { StyleSheet } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { getPlayerMarkPlacement, LifeCard } from "./LifeCard"

function card(life: number) {
  return (
    <ThemeProvider initialContext="light">
      <LifeCard playerName="Ada" seatNumber={1} life={life} color="#41476E" onChange={jest.fn()} />
    </ThemeProvider>
  )
}

function interactiveCard(life: number, onChange: jest.Mock) {
  return (
    <ThemeProvider initialContext="light">
      <LifeCard playerName="Ada" seatNumber={1} life={life} color="#41476E" onChange={onChange} />
    </ThemeProvider>
  )
}

const renderCard = (life: number) => render(card(life))

function deltaOpacity(view: ReturnType<typeof renderCard>) {
  return StyleSheet.flatten(view.getByTestId("life-delta-seat-1").props.style).opacity
}

describe("LifeCard", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("hides the delta chip until a life change happens", () => {
    const view = renderCard(20)
    expect(deltaOpacity(view)).toBe(0)
  })

  it("uses a visual player mark while keeping the name available to assistive technology", () => {
    const view = renderCard(20)

    expect(view.queryByText("Ada")).toBeNull()
    const marker = view.getByTestId("player-mark-seat-1", { includeHiddenElements: true })
    expect(marker).toBeTruthy()
    expect(StyleSheet.flatten(marker.props.style)).toMatchObject({
      left: "50%",
      marginLeft: -14,
      bottom: "50%",
      marginBottom: 74,
    })
    expect(view.getByTestId("life-card-seat-1").props.accessibilityLabel).toBe("Seat 1, Ada")
  })

  it("places each rotated player marker above its life total", () => {
    expect(getPlayerMarkPlacement(0, 44, 66, 8)).toMatchObject({
      bottom: "50%",
      marginBottom: 74,
      marginLeft: -14,
    })
    expect(getPlayerMarkPlacement(180, 44, 66, 8)).toMatchObject({
      top: "50%",
      marginTop: 74,
      marginLeft: -14,
    })
    expect(getPlayerMarkPlacement(90, 44, 66, 8)).toMatchObject({
      left: "50%",
      marginLeft: 74,
      marginTop: -14,
    })
    expect(getPlayerMarkPlacement(-90, 44, 66, 8)).toMatchObject({
      right: "50%",
      marginRight: 74,
      marginTop: -14,
    })
  })

  it("keeps a player marker inside a cramped card edge", () => {
    expect(getPlayerMarkPlacement(90, 44, 66, 8, 181)).toMatchObject({
      left: "50%",
      marginLeft: 38.5,
      marginTop: -14,
    })
    expect(getPlayerMarkPlacement(180, 44, 66, 8, 170)).toMatchObject({
      top: "50%",
      marginTop: 33,
      marginLeft: -14,
    })
  })

  it("repositions the marker after measuring a cramped sideways card", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={20}
          color="#41476E"
          contentRotation={90}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent(view.getByTestId("life-card-seat-1"), "layout", {
      nativeEvent: { layout: { width: 181, height: 400, x: 0, y: 0 } },
    })

    const marker = view.getByTestId("player-mark-seat-1", { includeHiddenElements: true })
    expect(StyleSheet.flatten(marker.props.style)).toMatchObject({
      left: "50%",
      marginLeft: 38.5,
    })
  })

  it("sums a run of changes into one signed delta chip", () => {
    const view = renderCard(20)
    view.rerender(card(21))
    view.rerender(card(22))
    expect(view.getByTestId("life-delta-seat-1").props.children).toBe("+2")
    expect(deltaOpacity(view)).toBe(1)
  })

  it("shows losses as a negative delta and clears the chip after the window", () => {
    const view = renderCard(20)
    view.rerender(card(15))
    expect(view.getByTestId("life-delta-seat-1").props.children).toBe("-5")
    act(() => jest.advanceTimersByTime(2000))
    expect(deltaOpacity(view)).toBe(0)
  })

  it("uses a circular life target to set a new total", () => {
    const onChange = jest.fn()
    const view = render(interactiveCard(20, onChange))
    const target = view.getByTestId("life-total-button-seat-1")

    expect(StyleSheet.flatten(target.props.style)).toMatchObject({
      width: 116,
      height: 116,
      borderRadius: 58,
    })
    expect(StyleSheet.flatten(target.props.style).borderWidth).toBeUndefined()
    expect(StyleSheet.flatten(view.getByTestId("life-readout-seat-1").props.style)).toMatchObject({
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      justifyContent: "center",
    })
    expect(view.getByTestId("life-total-seat-1").props.adjustsFontSizeToFit).toBe(true)
    expect(StyleSheet.flatten(view.getByTestId("life-delta-seat-1").props.style).position).toBe(
      "absolute",
    )
    fireEvent(target, "longPress")
    fireEvent.changeText(view.getByTestId("life-editor-input-seat-1"), "37")
    fireEvent.press(view.getByTestId("life-editor-apply-seat-1"))

    expect(onChange).toHaveBeenCalledWith(17)
    expect(view.queryByTestId("life-editor-dialog-seat-1")).toBeNull()
  })

  it.each([
    ["life-seat-1-1", "8", 8, "Add life"],
    ["life-seat-1--1", "6", -6, "Subtract life"],
  ])("opens custom amount editing from a long press on %s", (testID, value, delta, title) => {
    const onChange = jest.fn()
    const view = render(interactiveCard(20, onChange))

    fireEvent(view.getByTestId(testID), "longPress")
    expect(view.getAllByText(title)).toHaveLength(2)
    fireEvent.changeText(view.getByTestId("life-editor-input-seat-1"), value)
    fireEvent.press(view.getByTestId("life-editor-apply-seat-1"))

    expect(onChange).toHaveBeenCalledWith(delta)
  })

  it("rejects zero for add and subtract amounts", () => {
    const view = render(interactiveCard(20, jest.fn()))

    fireEvent(view.getByTestId("life-seat-1-1"), "longPress")
    fireEvent.changeText(view.getByTestId("life-editor-input-seat-1"), "0")

    expect(view.getByTestId("life-editor-apply-seat-1").props.accessibilityState.disabled).toBe(
      true,
    )
    expect(view.getByText("Enter a whole number from 1 to 999999.")).toBeTruthy()
  })
})
