import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { menuPlacement, SelectField } from "./SelectField"

const OPTIONS = [
  { id: "commander", label: "Commander", detail: "100 cards, singleton" },
  { id: "standard", label: "Standard" },
]

function renderField(onSelect = jest.fn(), value?: string) {
  return {
    onSelect,
    view: render(
      <ThemeProvider initialContext="dark">
        <SelectField
          testID="format"
          label="Format"
          placeholder="No default"
          clearLabel="No default"
          value={value}
          options={OPTIONS}
          onSelect={onSelect}
        />
      </ThemeProvider>,
    ),
  }
}

function scrim(view: ReturnType<typeof render>) {
  return view.getByTestId("format-backdrop", { includeHiddenElements: true })
}

describe("menuPlacement", () => {
  const anchor = { x: 24, y: 200, width: 300, height: 56 }

  it("drops below the trigger when there is room", () => {
    const { dropsDown, style } = menuPlacement(anchor, 800)
    expect(dropsDown).toBe(true)
    expect(style.top).toBe(262)
    expect(style.bottom).toBeUndefined()
    expect(style.left).toBe(24)
    expect(style.width).toBe(300)
  })

  it("flips above the trigger when the bottom edge is close", () => {
    const { dropsDown, style } = menuPlacement(anchor, 300)
    expect(dropsDown).toBe(false)
    expect(style.bottom).toBe(106)
    expect(style.top).toBeUndefined()
  })

  it("keeps the menu on screen when neither side is roomy", () => {
    const { style } = menuPlacement({ ...anchor, y: 120 }, 320)
    expect(style.maxHeight).toBe(126)
    expect((style.top as number) + (style.maxHeight as number)).toBeLessThanOrEqual(308)
  })
})

describe("SelectField", () => {
  it("keeps the menu closed until the trigger is pressed", () => {
    const { view } = renderField()
    expect(view.queryByTestId("format-option-commander")).toBeNull()

    fireEvent.press(view.getByTestId("format"))
    expect(view.getByTestId("format-option-commander")).toBeTruthy()
    expect(view.getByTestId("format-option-none")).toBeTruthy()
  })

  it("reports a choice once and closes", () => {
    const { view, onSelect } = renderField()
    fireEvent.press(view.getByTestId("format"))
    fireEvent.press(view.getByTestId("format-option-commander"))

    expect(onSelect).toHaveBeenCalledWith("commander")
    expect(view.queryByTestId("format-option-commander")).toBeNull()
  })

  it("clears without reporting a change when the value is already empty", () => {
    const { view, onSelect } = renderField()
    fireEvent.press(view.getByTestId("format"))
    fireEvent.press(view.getByTestId("format-option-none"))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it("dismisses on the scrim without changing the value", () => {
    const { view, onSelect } = renderField(jest.fn(), "standard")
    expect(view.getByLabelText("Format, Standard")).toBeTruthy()

    fireEvent.press(view.getByTestId("format"))
    fireEvent.press(scrim(view))

    expect(onSelect).not.toHaveBeenCalled()
    expect(view.queryByTestId("format-option-standard")).toBeNull()
  })

  it("marks only the selected menu row", () => {
    const { view } = renderField(jest.fn(), "standard")

    fireEvent.press(view.getByTestId("format"))

    expect(view.getAllByText("✓")).toHaveLength(1)
    expect(view.getByTestId("format-option-standard").props.accessibilityState.selected).toBe(true)
    expect(view.getByTestId("format-option-commander").props.accessibilityState.selected).toBe(
      false,
    )
  })
})
