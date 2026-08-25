import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { ListItem } from "./ListItem"

describe("ListItem", () => {
  it("describes a pressable text row as a button", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <ListItem text="Privacy policy" onPress={jest.fn()} />
      </ThemeProvider>,
    )

    const row = view.getByRole("button", { name: "Privacy policy" })
    expect(row.props.accessibilityRole).toBe("button")
  })

  it("keeps caller-supplied accessibility semantics", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <ListItem
          text="Privacy policy"
          onPress={jest.fn()}
          accessibilityRole="link"
          accessibilityLabel="Read our privacy policy"
        />
      </ThemeProvider>,
    )

    expect(view.getByRole("link", { name: "Read our privacy policy" })).toBeTruthy()
  })
})
