import { fireEvent, render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { EmptyState } from "./EmptyState"

function renderEmptyState(props: Parameters<typeof EmptyState>[0]) {
  return render(
    <ThemeProvider initialContext="light">
      <EmptyState heading="Nothing" {...props} />
    </ThemeProvider>,
  )
}

describe("EmptyState", () => {
  it("renders a button only when it has an action", () => {
    renderEmptyState({ button: "Retry" })
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("presses the button it renders", () => {
    const onPress = jest.fn()
    renderEmptyState({ button: "Retry", buttonOnPress: onPress })
    fireEvent.press(screen.getByRole("button", { name: "Retry" }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
