import { fireEvent, render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { ConnectedErrorBoundary } from "./ConnectedErrorBoundary"

function BrokenQuery(): never {
  throw new Error("Game unavailable")
}

describe("ConnectedErrorBoundary", () => {
  it("contains invalid/nonmember query errors with retry and back actions", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
    const onBack = jest.fn()
    render(
      <ThemeProvider initialContext="light">
        <ConnectedErrorBoundary onBack={onBack}>
          <BrokenQuery />
        </ConnectedErrorBoundary>
      </ThemeProvider>,
    )
    expect(screen.getByRole("alert").props.children).toContain("Game unavailable")
    expect(screen.getByTestId("retry-connected-button")).toBeTruthy()
    fireEvent.press(screen.getByTestId("leave-connected-error-button"))
    expect(onBack).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})
