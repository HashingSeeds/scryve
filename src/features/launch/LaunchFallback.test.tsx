import { render } from "@testing-library/react-native"

import { LaunchFallback } from "./LaunchFallback"

describe("LaunchFallback", () => {
  it("renders a stable branded progress state", () => {
    const view = render(<LaunchFallback />)

    expect(view.getByTestId("launch-fallback")).toBeTruthy()
    expect(view.getByText("Starting Scryve…")).toBeTruthy()
    expect(view.getByLabelText("Starting Scryve")).toBeTruthy()
  })
})
