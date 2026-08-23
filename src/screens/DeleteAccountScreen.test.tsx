import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { DeleteAccountScreen } from "./DeleteAccountScreen"

describe("DeleteAccountScreen", () => {
  it("keeps deletion controls hidden while the request status is unresolved", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <DeleteAccountScreen
          deletionStatus={undefined}
          isSubmitting={false}
          onBack={jest.fn()}
          onRequestDeletion={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.getByText("Checking deletion status…")).toBeTruthy()
    expect(view.queryByTestId("delete-confirmation-input")).toBeNull()
    expect(view.queryByTestId("confirm-account-deletion-button")).toBeNull()
  })

  it("requires the explicit DELETE confirmation", () => {
    const onRequestDeletion = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <DeleteAccountScreen
          email="alice@example.com"
          deletionStatus={null}
          isSubmitting={false}
          onBack={jest.fn()}
          onRequestDeletion={onRequestDeletion}
        />
      </ThemeProvider>,
    )
    const button = view.getByTestId("confirm-account-deletion-button")
    expect(button.props.accessibilityState.disabled).toBe(true)
    fireEvent.changeText(view.getByTestId("delete-confirmation-input"), "DELETE")
    expect(
      view.getByTestId("confirm-account-deletion-button").props.accessibilityState.disabled,
    ).toBe(false)
    fireEvent.press(view.getByTestId("confirm-account-deletion-button"))
    expect(onRequestDeletion).toHaveBeenCalledTimes(1)
  })

  it("offers a retry after a failed deletion", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <DeleteAccountScreen
          deletionStatus="failed"
          isSubmitting={false}
          onBack={jest.fn()}
          onRequestDeletion={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.getByText("Deletion needs attention")).toBeTruthy()
    expect(view.getByText("Retry account deletion")).toBeTruthy()
    expect(view.getByTestId("delete-confirmation-input")).toBeTruthy()
  })

  it.each([
    ["processing", "Scryve is anonymizing connected history"],
    ["identity_pending", "Scryve is now removing your sign-in identity"],
  ] as const)("shows %s progress without deletion controls", (deletionStatus, description) => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <DeleteAccountScreen
          deletionStatus={deletionStatus}
          isSubmitting={false}
          onBack={jest.fn()}
          onRequestDeletion={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.getByText(new RegExp(description))).toBeTruthy()
    expect(view.queryByTestId("delete-confirmation-input")).toBeNull()
    expect(view.queryByTestId("confirm-account-deletion-button")).toBeNull()
  })
})
