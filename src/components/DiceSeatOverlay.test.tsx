import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"
import * as reducedMotion from "@/utils/useReducedMotion"

import { DiceSeatOverlay } from "./DiceSeatOverlay"

describe("DiceSeatOverlay", () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it("lands the die on the decided result at once when motion is turned off mid-tumble", () => {
    jest.useFakeTimers()
    const motion = jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(false)
    const dice = {
      view: { kind: "rolloff", value: 9, attempt: 1, status: "won" } as const,
      onPress: jest.fn(),
    }
    const seat = () => (
      <ThemeProvider initialContext="dark">
        <DiceSeatOverlay
          seatNumber={1}
          playerName="Ada"
          color="#41476E"
          foreground="#FFFFFF"
          contentRotation={0}
          dice={dice}
        />
      </ThemeProvider>
    )
    const view = render(seat())
    act(() => jest.advanceTimersByTime(100))
    expect(view.getByTestId("dice-seat-1")).not.toHaveTextContent("Goes first")
    expect(view.getByTestId("dice-seat-1")).not.toHaveTextContent("d209")

    motion.mockReturnValue(true)
    view.rerender(seat())
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("d209Goes first")
    act(() => jest.runAllTimers())
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("d209Goes first")
  })

  it("exposes Go first and Go second as separate buttons with no accessible ancestor", () => {
    const onChoose = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <DiceSeatOverlay
          seatNumber={2}
          playerName="Grace"
          color="#39755C"
          foreground="#FFFFFF"
          contentRotation={180}
          dice={{ view: { kind: "choice", reason: "flip" }, onPress: jest.fn(), onChoose }}
        />
      </ThemeProvider>,
    )

    for (const order of ["first", "second"] as const) {
      const button = view.getByTestId(`dice-go-${order}`)
      expect(button.props.accessibilityRole).toBe("button")
      expect(button.props.accessibilityLabel).toBe(`Grace goes ${order}`)
      // why: iOS VoiceOver folds everything under an accessible element into one stop, so the choices need a clear path to the root.
      for (let node = button.parent; node; node = node.parent)
        if (node.props?.testID !== button.props.testID)
          expect(node.props?.accessible).not.toBe(true)
      fireEvent.press(button)
      expect(onChoose).toHaveBeenLastCalledWith(order)
    }
  })
})
