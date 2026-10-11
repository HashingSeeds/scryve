import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { DiceSeatOverlay } from "./DiceSeatOverlay"

describe("DiceSeatOverlay", () => {
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
