import { StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { colors as darkColors } from "@/theme/colorsDark"
import { ThemeProvider } from "@/theme/context"

import { DialogCard } from "./DialogCard"
import { Text } from "./Text"

jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}))

function renderDialog(props: Partial<React.ComponentProps<typeof DialogCard>> = {}) {
  const onClose = jest.fn()
  const view = render(
    <ThemeProvider initialContext="light">
      <DialogCard
        visible
        onClose={onClose}
        backdropTestID="dialog-backdrop"
        backdropAccessibilityLabel="Close the dialog"
        dialogTestID="dialog-card"
        {...props}
      >
        <Text text="Dialog body" />
      </DialogCard>
    </ThemeProvider>,
  )

  return { view, onClose }
}

describe("DialogCard", () => {
  it("renders children behind the labelled backdrop and dialog testIDs", () => {
    const { view } = renderDialog()

    expect(view.getByTestId("dialog-backdrop").props.accessibilityLabel).toBe("Close the dialog")
    expect(view.getByTestId("dialog-card")).toBeTruthy()
    expect(view.getByText("Dialog body")).toBeTruthy()
  })

  it("closes when the backdrop is pressed and swallows dialog taps", () => {
    const { view, onClose } = renderDialog()

    fireEvent.press(view.getByTestId("dialog-card"))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.press(view.getByTestId("dialog-backdrop"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("ignores backdrop presses while closing is disabled", () => {
    const { view, onClose } = renderDialog({ closeDisabled: true })

    fireEvent.press(view.getByTestId("dialog-backdrop"))
    expect(onClose).not.toHaveBeenCalled()
  })

  it("renders nothing when it is not visible", () => {
    const { view } = renderDialog({ visible: false })

    expect(view.queryByTestId("dialog-backdrop")).toBeNull()
    expect(view.queryByText("Dialog body")).toBeNull()
  })

  it("uses the dark theme shadow and overlay rather than inverted palette colors", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <DialogCard
          visible
          onClose={jest.fn()}
          dialogTestID="dark-sheet"
          backdropTestID="dark-backdrop"
        >
          <Text text="Review" />
        </DialogCard>
      </ThemeProvider>,
    )
    expect(StyleSheet.flatten(view.getByTestId("dark-sheet").props.style).shadowColor).toBe(
      darkColors.shadow,
    )
    expect(StyleSheet.flatten(view.getByTestId("dark-backdrop").props.style).backgroundColor).toBe(
      darkColors.overlay,
    )
  })

  it("supports an edge-aligned bottom sheet", () => {
    const { view } = renderDialog({ placement: "bottom" })
    const dialog = view.getByTestId("dialog-card")

    expect(StyleSheet.flatten(dialog.props.style)).toMatchObject({
      maxHeight: "88%",
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      paddingBottom: 58,
    })
    expect(StyleSheet.flatten(view.getByTestId("dialog-card-layout").props.style)).toMatchObject({
      marginTop: 47,
      marginBottom: 0,
    })
  })
})
