import { useState } from "react"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { TextField } from "./TextField"

function SearchField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return <TextField testID="search" value={value} onChangeText={setValue} clearable />
}

function renderField(initial: string) {
  return render(
    <ThemeProvider initialContext="dark">
      <SearchField initial={initial} />
    </ThemeProvider>,
  )
}

describe("TextField", () => {
  it("clears its text from the x", () => {
    const view = renderField("bolt")

    fireEvent.press(view.getByTestId("search-clear"))

    expect(view.getByTestId("search").props.value).toBe("")
    expect(view.queryByTestId("search-clear")).toBeNull()
  })

  it("hides the x while empty", () => {
    const view = renderField("")

    expect(view.queryByTestId("search-clear")).toBeNull()
  })
})
