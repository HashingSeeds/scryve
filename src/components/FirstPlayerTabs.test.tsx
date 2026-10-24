import { fireEvent, render } from "@testing-library/react-native"

import { firstPlayerTabs } from "@/features/game/GameBoardStage"
import { ThemeProvider } from "@/theme/context"

import { FirstPlayerTabs } from "./FirstPlayerTabs"
import { getPlayerGridFacings, getPlayerGridLayout } from "./playerGridGeometry"

describe("FirstPlayerTabs", () => {
  it("puts one tab on each side edge and lets assistive tech find only one", () => {
    const onPress = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <FirstPlayerTabs
          offer={{ glyph: { tool: "d20" }, accessibilityLabel: "Roll for who goes first", onPress }}
          tabs={firstPlayerTabs({ x: 0.5, y: 0.5 }, [90, -90])}
        />
      </ThemeProvider>,
    )

    expect(view.getAllByLabelText("Roll for who goes first")).toHaveLength(1)
    fireEvent.press(view.getByTestId("first-player-tab"))
    fireEvent.press(view.getByTestId("first-player-tab-mirror", { includeHiddenElements: true }))
    expect(onPress).toHaveBeenCalledTimes(2)
  })

  it.each([
    [
      [90, -90],
      0,
      [
        { edge: "left", at: 0.4, facing: 90 },
        { edge: "right", at: 0.4, facing: -90 },
      ],
    ],
    [
      [180, 0],
      0,
      [
        { edge: "left", at: 0.4, facing: 180 },
        { edge: "right", at: 0.4, facing: 0 },
      ],
    ],
    [
      [180, 0],
      90,
      [
        { edge: "top", at: 0.6, facing: 270 },
        { edge: "bottom", at: 0.6, facing: 90 },
      ],
    ],
  ] as const)(
    "meets the side edges on the menu's row for facings %j turned %i°",
    (facings, rotation, tabs) => {
      expect(firstPlayerTabs({ x: 0.5, y: 0.4 }, facings, rotation)).toEqual(tabs)
    },
  )

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
    "faces %i seats in the %s layout (%i×%i) in at most two lined-up directions",
    (playerCount, layoutVariant, width, height, facings) => {
      const layout = getPlayerGridLayout({ playerCount, width, height, layoutVariant })
      expect(getPlayerGridFacings(playerCount, layout)).toEqual(facings)
    },
  )
})
