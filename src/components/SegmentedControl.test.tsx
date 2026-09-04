import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { SegmentedControl } from "./SegmentedControl"

const SEGMENTS = [
  { id: "none", label: "None" },
  { id: "mtg", label: "Magic", accentColor: "#B85636" },
  { id: "ygo", label: "Yu-Gi-Oh!", accentColor: "#77558A" },
]

function renderControl(selectedId: string, onSelect = jest.fn()) {
  return {
    onSelect,
    view: render(
      <ThemeProvider initialContext="dark">
        <SegmentedControl
          testID="system"
          accessibilityLabel="Default game system"
          segments={SEGMENTS}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </ThemeProvider>,
    ),
  }
}

describe("SegmentedControl", () => {
  it("marks only the selected segment for assistive technology", () => {
    const { view } = renderControl("mtg")
    expect(view.getByTestId("system-mtg").props.accessibilityState.selected).toBe(true)
    expect(view.getByTestId("system-none").props.accessibilityState.selected).toBe(false)
  })

  it("reports a new selection but stays quiet when the segment is already active", () => {
    const { view, onSelect } = renderControl("none")
    fireEvent.press(view.getByTestId("system-none"))
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.press(view.getByTestId("system-ygo"))
    expect(onSelect).toHaveBeenCalledWith("ygo")
  })

  it("shows every segment at once so the choices need no discovery", () => {
    const { view } = renderControl("mtg")
    for (const { label } of SEGMENTS) expect(view.getByText(label)).toBeTruthy()
  })
})
