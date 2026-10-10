import { StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"
import { darkTheme } from "@/theme/theme"

import { SegmentedControl } from "./SegmentedControl"

const SEGMENTS = [
  { id: "none", label: "None" },
  { id: "mtg", label: "Magic", accentColor: "#B85636" },
  { id: "ygo", label: "Yu-Gi-Oh!", accentColor: "#77558A" },
]

function renderControl(selectedId: string, onSelect = jest.fn(), segments = SEGMENTS) {
  return {
    onSelect,
    view: render(
      <ThemeProvider initialContext="dark">
        <SegmentedControl
          testID="system"
          accessibilityLabel="Default game system"
          segments={segments}
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

  it("marks the selected segment with the accent even without the sliding thumb", () => {
    const { view } = renderControl("mtg")
    expect(StyleSheet.flatten(view.getByTestId("system-mtg").props.style)).toMatchObject({
      backgroundColor: darkTheme.colors.tint,
    })
    expect(
      StyleSheet.flatten(view.getByTestId("system-none").props.style).backgroundColor,
    ).toBeUndefined()
  })

  it("splits into rows instead of truncating labels that outgrow one row", () => {
    const { view } = renderControl("mtg")
    const layout = layoutOf(view)
    const basis = () => StyleSheet.flatten(view.getByTestId("system-mtg").props.style).flexBasis

    layout("system", 308)
    layout("system-ruler", 90)
    expect(basis()).toBeUndefined()

    layout("system-ruler", 120)
    expect(basis()).toBe("50%")

    layout("system-ruler", 200)
    expect(basis()).toBe("100%")
  })

  it("falls back to two columns before one, whatever the segment count", () => {
    const five = ["a", "b", "c", "d", "e"].map((id) => ({ id, label: id }))
    const { view } = renderControl("a", jest.fn(), five)
    const layout = layoutOf(view)
    layout("system", 308)
    layout("system-ruler", 120)
    expect(StyleSheet.flatten(view.getByTestId("system-a").props.style).flexBasis).toBe("50%")
  })
})

function layoutOf(view: ReturnType<typeof render>) {
  return (testID: string, width: number) =>
    fireEvent(view.getByTestId(testID, { includeHiddenElements: true }), "layout", {
      nativeEvent: { layout: { width } },
    })
}
