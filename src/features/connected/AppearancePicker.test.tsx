import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AppearancePicker } from "./AppearancePicker"
import { CONNECTED_PLAYER_MARK_SHAPES } from "../../../convex/lib/appearance"

describe("AppearancePicker", () => {
  it("keeps occupied colors and shapes unavailable after changing the other choice", () => {
    const onChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppearancePicker
          value={{ color: "#B85636", shape: "heart" }}
          taken={[{ color: "#39755c", shape: "square" }]}
          onChange={onChange}
        />
      </ThemeProvider>,
    )
    expect(view.getAllByRole("radio")).toHaveLength(16)
    expect(view.getByTestId("appearance-color-39755c")).toBeDisabled()
    expect(view.getByTestId("appearance-shape-square")).toBeDisabled()
    fireEvent.press(view.getByTestId("appearance-color-117b9c"))
    expect(onChange).toHaveBeenLastCalledWith({ color: "#117B9C", shape: "heart" })
    fireEvent.press(view.getByTestId("appearance-shape-shield"))
    expect(onChange).toHaveBeenLastCalledWith({ color: "#B85636", shape: "shield" })
    fireEvent.press(view.getByTestId("appearance-color-39755c"))
    fireEvent.press(view.getByTestId("appearance-shape-square"))
    expect(onChange).toHaveBeenCalledTimes(2)
  })
  it("offers heart locally while preserving the compatible hosted catalog", () => {
    const onChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppearancePicker value={{ color: "#B85636", shape: "heart" }} onChange={onChange} />
      </ThemeProvider>,
    )
    expect(view.queryByTestId("appearance-shape-circle")).toBeNull()
    fireEvent.press(view.getByTestId("appearance-shape-heart"))
    expect(onChange).toHaveBeenLastCalledWith({ color: "#B85636", shape: "heart" })
    view.rerender(
      <ThemeProvider initialContext="dark">
        <AppearancePicker
          value={{ color: "#B85636", shape: "circle" }}
          shapes={CONNECTED_PLAYER_MARK_SHAPES}
          onChange={onChange}
        />
      </ThemeProvider>,
    )
    expect(view.getAllByRole("radio")).toHaveLength(14)
    expect(view.getByTestId("appearance-shape-circle")).toBeEnabled()
    expect(view.queryByTestId("appearance-shape-heart")).toBeNull()
  })
})
