import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { CheckboxRow } from "./CheckboxRow"

describe("CheckboxRow", () => {
  it.each([true, false])("reports checked=%s and toggles on press", (checked) => {
    const onToggle = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <CheckboxRow testID="row" label="Atraxa" checked={checked} onToggle={onToggle} />
      </ThemeProvider>,
    )

    expect(view.getByTestId("row").props.accessibilityState).toMatchObject({ checked })
    fireEvent.press(view.getByTestId("row"))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
