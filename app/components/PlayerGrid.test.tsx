import { AccessibilityInfo, StyleSheet } from "react-native"
import { render } from "@testing-library/react-native"

import { asPlayerId } from "@/features/game/domain"
import { ThemeProvider } from "@/theme/context"
import { accessibleForeground } from "@/utils/colorContrast"

import { getPlayerGridLayout, PlayerGrid } from "./PlayerGrid"

function players(count: number) {
  return Array.from({ length: count }, (_, seat) => ({
    id: asPlayerId(`player-${seat}`),
    name: `Player ${seat + 1}`,
    color: "#41476E",
    life: 20,
    seat,
  }))
}

describe("PlayerGrid", () => {
  it.each([2, 3, 4, 5, 6])(
    "renders every card and four controls in a %i-player layout",
    (count) => {
      const view = render(
        <ThemeProvider initialContext="light">
          <PlayerGrid players={players(count)} onChange={jest.fn()} />
        </ThemeProvider>,
      )
      expect(view.getAllByText("20")).toHaveLength(count)
      expect(
        Array.from({ length: count }, (_, index) => view.getByTestId(`life-seat-${index + 1}-1`)),
      ).toHaveLength(count)
      expect(view.getByTestId("player-grid").props.accessibilityLabel).toBe(
        `${count} player life grid`,
      )
    },
  )

  it.each([
    [2, 390, 844, 1, 2, "two-stacked"],
    [2, 844, 390, 2, 1, "two-side-by-side"],
    [3, 390, 844, 2, 2, "three-featured"],
    [3, 844, 390, 3, 1, "three-tabletop"],
    [4, 390, 844, 2, 2, "four-grid"],
    [5, 768, 1024, 2, 3, "dense-portrait"],
    [5, 1024, 768, 3, 2, "dense-landscape"],
    [6, 390, 844, 2, 3, "dense-portrait"],
    [6, 844, 390, 3, 2, "dense-landscape"],
  ])(
    "lays out %i players at %ix%i as %i columns by %i rows",
    (playerCount, width, height, columns, rows, layout) => {
      expect(getPlayerGridLayout({ playerCount, width, height })).toMatchObject({
        columnCount: columns,
        rowCount: rows,
        layout,
      })
    },
  )

  it("increases reachability height at large text sizes without reducing touch targets", () => {
    const normal = getPlayerGridLayout({ playerCount: 4, width: 390, height: 844, fontScale: 1 })
    const large = getPlayerGridLayout({
      playerCount: 4,
      width: 390,
      height: 844,
      fontScale: 1.6,
    })
    expect(large.largeText).toBe(true)
    expect(large.minCellHeight).toBeGreaterThan(normal.minCellHeight)
  })

  it("bounds dense board typography while retaining full accessible labels", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <PlayerGrid players={players(6)} onChange={jest.fn()} />
      </ThemeProvider>,
    )

    expect(view.getByText("Player 6").props.maxFontSizeMultiplier).toBe(1.4)
    expect(view.getAllByText("20")[5].props.maxFontSizeMultiplier).toBe(1.3)
    expect(view.getByTestId("life-total-seat-6").props.accessibilityLabel).toBe(
      "Seat 6, Player 6, 20 life",
    )
  })

  it("uses stable seat identity when names are duplicate or empty", () => {
    const duplicatePlayers = players(3).map((player, index) => ({
      ...player,
      name: index === 2 ? "" : "Ada",
    }))
    const view = render(
      <ThemeProvider initialContext="light">
        <PlayerGrid players={duplicatePlayers} onChange={jest.fn()} />
      </ThemeProvider>,
    )
    expect(view.getByTestId("life-card-seat-1")).toBeTruthy()
    expect(view.getByTestId("life-card-seat-2")).toBeTruthy()
    expect(view.getByTestId("life-card-seat-3")).toBeTruthy()
    expect(view.getByTestId("life-total-seat-1").props.accessibilityLabel).toBe(
      "Seat 1, Ada, 20 life",
    )
    expect(view.getByTestId("life-total-seat-2").props.accessibilityLabel).toBe(
      "Seat 2, Ada, 20 life",
    )
    expect(view.getByTestId("life-total-seat-3").props.accessibilityLabel).toBe(
      "Seat 3, unnamed player, 20 life",
    )
  })

  it("uses contrasting ownership borders across player colors", () => {
    const colorfulPlayers = players(2).map((player, index) => ({
      ...player,
      color: index === 0 ? "#F9E547" : "#2D195C",
    }))
    const view = render(
      <ThemeProvider initialContext="light">
        <PlayerGrid
          players={colorfulPlayers}
          isPlayerDisabled={(player) => player.id === colorfulPlayers[1].id}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )
    const owned = StyleSheet.flatten(view.getByTestId("life-card-seat-1").props.style)
    const unowned = StyleSheet.flatten(view.getByTestId("life-card-seat-2").props.style)
    expect(owned).toMatchObject({
      borderStyle: "solid",
      borderColor: accessibleForeground(colorfulPlayers[0].color),
    })
    expect(unowned).toMatchObject({
      borderStyle: "dashed",
      borderColor: accessibleForeground(colorfulPlayers[1].color),
    })
  })

  it("announces a changed life total after initial render", () => {
    const initial = players(2)
    const view = render(
      <ThemeProvider initialContext="light">
        <PlayerGrid players={initial} onChange={jest.fn()} />
      </ThemeProvider>,
    )
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
    view.rerender(
      <ThemeProvider initialContext="light">
        <PlayerGrid
          players={initial.map((player, index) => (index === 0 ? { ...player, life: 21 } : player))}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      "Seat 1, Player 1, now 21 life",
    )
  })
})
