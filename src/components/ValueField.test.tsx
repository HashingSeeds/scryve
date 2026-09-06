import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { ValueField } from "./ValueField"

function renderField(value = 20, onChange = jest.fn()) {
  return {
    onChange,
    view: render(
      <ThemeProvider initialContext="dark">
        <ValueField
          testID="life"
          label="life"
          value={value}
          min={1}
          max={999_999}
          step={1}
          longStep={10}
          onChange={onChange}
        />
      </ThemeProvider>,
    ),
  }
}

describe("ValueField", () => {
  it("changes by one when tapped", () => {
    const { view, onChange } = renderField()

    fireEvent.press(view.getByTestId("life-increment"))

    expect(onChange).toHaveBeenCalledWith(21)
  })

  it("does not add a tap after a long press", () => {
    const { view, onChange } = renderField()
    const increment = view.getByTestId("life-increment")

    fireEvent(increment, "pressIn")
    fireEvent(increment, "longPress")
    fireEvent.press(increment)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(30)
  })

  it("does not report a value outside its bounds", () => {
    const { view, onChange } = renderField(1)

    expect(view.getByTestId("life-decrement")).toBeDisabled()
    fireEvent.press(view.getByTestId("life-decrement"))

    expect(onChange).not.toHaveBeenCalled()
  })
})
