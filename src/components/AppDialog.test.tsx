import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AppDialog } from "./AppDialog"
import { Text } from "./Text"

function renderDialog(props: Partial<React.ComponentProps<typeof AppDialog>> = {}) {
  const onClose = jest.fn()
  const view = render(
    <ThemeProvider initialContext="light">
      <AppDialog
        visible
        onClose={onClose}
        backdropTestID="dialog-backdrop"
        backdropAccessibilityLabel="Close the dialog"
        dialogTestID="dialog-card"
        {...props}
      >
        <Text text="Dialog body" />
      </AppDialog>
    </ThemeProvider>,
  )

  return { view, onClose }
}

describe("AppDialog", () => {
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
})
