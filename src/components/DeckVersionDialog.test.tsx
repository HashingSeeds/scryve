import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { DeckVersionDialog } from "./DeckVersionDialog"

describe("DeckVersionDialog", () => {
  it("creates an empty version when Start empty is picked", () => {
    const onSubmit = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <DeckVersionDialog
          title="New version"
          submitLabel="Create version"
          copyFromLabel="Current"
          onSubmit={onSubmit}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.changeText(view.getByTestId("version-name-input"), "Budget")
    fireEvent.press(view.getByTestId("version-cards-empty"))
    expect(view.getByText("Build this version from scratch")).toBeTruthy()
    fireEvent.press(view.getByTestId("version-submit"))

    expect(onSubmit).toHaveBeenCalledWith({ name: "Budget", note: "", copyCards: false })
  })
})
