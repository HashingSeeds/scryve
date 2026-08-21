import { ScrollView } from "react-native"
import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AppearancePicker } from "./AppearancePicker"

describe("AppearancePicker", () => {
  it("keeps colors and marks in single horizontal rows", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <AppearancePicker value={{ color: "#B85636", shape: "circle" }} onChange={jest.fn()} />
      </ThemeProvider>,
    )

    const rows = view.UNSAFE_getAllByType(ScrollView)
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.props.accessibilityRole === "radiogroup")).toBe(true)
    expect(rows.every((row) => row.props.horizontal)).toBe(true)
    expect(rows.every((row) => row.props.showsHorizontalScrollIndicator === false)).toBe(true)
  })
})
