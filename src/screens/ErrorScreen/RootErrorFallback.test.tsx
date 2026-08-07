import { fireEvent, render } from "@testing-library/react-native"

import { RootErrorFallback } from "./RootErrorFallback"

describe("RootErrorFallback", () => {
  it("offers a provider-independent retry action", () => {
    const onRetry = jest.fn(() => Promise.resolve())
    const view = render(
      <RootErrorFallback
        error={new Error("render failed")}
        onRetry={onRetry}
        showDetails={false}
      />,
    )

    expect(view.getByText("Something went wrong")).toBeTruthy()
    expect(view.queryByText("render failed")).toBeNull()

    fireEvent.press(view.getByText("Try again"))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("shows diagnostic details only when explicitly enabled", () => {
    const view = render(
      <RootErrorFallback
        error={new Error("development-only detail")}
        onRetry={() => Promise.resolve()}
        showDetails
      />,
    )

    expect(view.getByText("Error: development-only detail")).toBeTruthy()
  })
})
