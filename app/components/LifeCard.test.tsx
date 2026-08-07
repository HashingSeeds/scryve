import { StyleSheet } from "react-native"
import { act, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { LifeCard } from "./LifeCard"

function card(life: number) {
  return (
    <ThemeProvider initialContext="light">
      <LifeCard playerName="Ada" seatNumber={1} life={life} color="#41476E" onChange={jest.fn()} />
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
    expect(view.getByTestId("player-mark-seat-1", { includeHiddenElements: true })).toBeTruthy()
    expect(view.getByTestId("life-card-seat-1").props.accessibilityLabel).toBe("Seat 1, Ada")
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
})
