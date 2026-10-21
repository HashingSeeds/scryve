import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { FirstPlayerChips } from "./FirstPlayerChips"
import { getPlayerGridFacings, getPlayerGridLayout } from "./playerGridGeometry"

describe("FirstPlayerChips", () => {
  it("turns one chip toward each side of the table and lets assistive tech find only one", () => {
    const onPress = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <FirstPlayerChips
          offer={{
            color: "#55C894",
            glyph: { tool: "d20" },
            label: "Roll for first",
            accessibilityLabel: "Roll for who goes first",
            onPress,
          }}
          anchor={{ x: 0.5, y: 0.5 }}
          facings={[180, 0]}
        />
      </ThemeProvider>,
    )

    expect(view.getAllByText("Roll for first", { includeHiddenElements: true })).toHaveLength(2)
    expect(view.getAllByLabelText("Roll for who goes first")).toHaveLength(1)
    fireEvent.press(view.getByTestId("first-player-badge"))
    fireEvent.press(view.getByTestId("first-player-badge-mirror", { includeHiddenElements: true }))
    expect(onPress).toHaveBeenCalledTimes(2)
  })

  it.each([
    [2, "auto", 390, 844, [180, 0]],
    [3, "auto", 390, 844, [90, -90]],
    [3, "even-grid", 390, 844, [90, -90]],
    [4, "auto", 390, 844, [90, -90]],
    [4, "tabletop", 390, 844, [90, -90]],
    [4, "tabletop", 844, 390, [180, 0]],
    [5, "auto", 390, 844, [90, -90]],
    [6, "tabletop", 390, 844, [90, -90]],
  ] as const)(
    "offers %i seats in the %s layout (%i×%i) at most two lined-up directions",
    (playerCount, layoutVariant, width, height, facings) => {
      const layout = getPlayerGridLayout({ playerCount, width, height, layoutVariant })
      expect(getPlayerGridFacings(playerCount, layout)).toEqual(facings)
    },
  )
})
