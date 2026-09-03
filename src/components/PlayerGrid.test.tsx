import { AccessibilityInfo, StyleSheet } from "react-native"
import { render } from "@testing-library/react-native"

import { asPlayerId } from "@/features/game/domain"
import { ThemeProvider } from "@/theme/context"

import { COMPACT_LIFE_TARGET_SIZE, LIFE_TARGET_SIZE } from "./playerCardTypes"
import {
  getCellSize,
  getLifeFontSize,
  getPlayerGridLayout,
  getPlayerGridLayoutOptions,
  getPlayerGridMenuAnchor,
  getPlayerGridRows,
  PlayerGrid,
} from "./PlayerGrid"

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

  it("lets the player surface reach every screen edge", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <PlayerGrid players={players(4)} onChange={jest.fn()} />
      </ThemeProvider>,
    )

    expect(StyleSheet.flatten(view.getByTestId("player-grid").props.style)).toMatchObject({
      paddingHorizontal: 0,
      paddingBottom: 0,
    })
  })

  it("squares only the corners that meet the device's rounded screen corners", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <PlayerGrid players={players(4)} onChange={jest.fn()} />
      </ThemeProvider>,
    )

    const cardStyle = (seat: number) =>
      StyleSheet.flatten(view.getByTestId(`life-card-seat-${seat}`).props.style)
    expect(cardStyle(1)).toMatchObject({ borderTopLeftRadius: 0 })
    expect(cardStyle(1).borderTopRightRadius).toBeUndefined()
    expect(cardStyle(2)).toMatchObject({ borderTopRightRadius: 0 })
    expect(cardStyle(3)).toMatchObject({ borderBottomLeftRadius: 0 })
    expect(cardStyle(4)).toMatchObject({ borderBottomRightRadius: 0 })
    expect(cardStyle(4).borderTopLeftRadius).toBeUndefined()
  })

  it("squares both top corners of a full-width featured card", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <PlayerGrid players={players(3)} onChange={jest.fn()} />
      </ThemeProvider>,
    )

    const featuredStyle = StyleSheet.flatten(view.getByTestId("life-card-seat-1").props.style)
    expect(featuredStyle).toMatchObject({ borderTopLeftRadius: 0, borderTopRightRadius: 0 })
    expect(featuredStyle.borderBottomLeftRadius).toBeUndefined()
  })

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

  it("supports featured and even arrangements without dropping a player", () => {
    const inputs = [
      ["featured-first", [[0], [1, 2], [3, 4]]],
      ["featured-last", [[0, 1], [2, 3], [4]]],
      [
        "even-grid",
        [
          [0, 1],
          [2, 3],
          [4, null],
        ],
      ],
    ] as const

    for (const [layoutVariant, expectedRows] of inputs) {
      const layout = getPlayerGridLayout({
        playerCount: 5,
        width: 390,
        height: 844,
        layoutVariant,
      })
      expect(getPlayerGridRows(5, layout)).toEqual(expectedRows)
    }
  })

  it("gives a full-width odd player less height than paired player rows", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <PlayerGrid players={players(5)} onChange={jest.fn()} />
      </ThemeProvider>,
    )

    expect(StyleSheet.flatten(view.getByTestId("player-grid-row-0").props.style).flex).toBe(1)
    expect(StyleSheet.flatten(view.getByTestId("player-grid-row-1").props.style).flex).toBe(1)
    expect(StyleSheet.flatten(view.getByTestId("player-grid-row-2").props.style).flex).toBe(0.8)
  })

  it("anchors the game menu to weighted row intersections", () => {
    const threePlayerLayout = getPlayerGridLayout({ playerCount: 3, width: 390, height: 844 })
    const fivePlayerLayout = getPlayerGridLayout({ playerCount: 5, width: 390, height: 844 })
    const fourPlayerLayout = getPlayerGridLayout({ playerCount: 4, width: 390, height: 844 })

    expect(getPlayerGridMenuAnchor(3, threePlayerLayout)).toEqual({
      x: 0.5,
      y: expect.closeTo(4 / 9),
    })
    expect(getPlayerGridMenuAnchor(5, fivePlayerLayout)).toEqual({
      x: 0.5,
      y: expect.closeTo(5 / 14),
    })
    expect(getPlayerGridMenuAnchor(4, fourPlayerLayout)).toEqual({ x: 0.5, y: 0.5 })
  })

  it("does not offer a forced wide layout at any player count", () => {
    for (const playerCount of [2, 3, 4, 5, 6]) {
      expect(getPlayerGridLayoutOptions(playerCount).map(({ variant }) => variant)).not.toContain(
        "wide-grid",
      )
    }
  })

  it("orients tabletop players toward their nearest outside edge", () => {
    const sixPlayerView = render(
      <ThemeProvider initialContext="light">
        <PlayerGrid players={players(6)} onChange={jest.fn()} />
      </ThemeProvider>,
    )
    expect(
      StyleSheet.flatten(sixPlayerView.getByTestId("life-total-seat-1").props.style),
    ).toMatchObject({ transform: [{ rotate: "90deg" }] })
    expect(
      StyleSheet.flatten(sixPlayerView.getByTestId("life-total-seat-2").props.style),
    ).toMatchObject({ transform: [{ rotate: "-90deg" }] })

    const twoPlayerView = render(
      <ThemeProvider initialContext="light">
        <PlayerGrid players={players(2)} onChange={jest.fn()} />
      </ThemeProvider>,
    )
    expect(
      StyleSheet.flatten(twoPlayerView.getByTestId("life-total-seat-1").props.style),
    ).toMatchObject({ transform: [{ rotate: "180deg" }] })
    expect(
      StyleSheet.flatten(twoPlayerView.getByTestId("life-total-seat-2").props.style).transform,
    ).toBe(undefined)
  })

  describe("life total sizing", () => {
    const board = { width: 390, height: 690 }

    function sizeFor(playerCount: number, digits = 2, fontScale = 1) {
      const layout = getPlayerGridLayout({ playerCount, width: 390, height: 844 })
      return getLifeFontSize({
        ...getCellSize({ board, layout, gap: 4 }),
        digits,
        fontScale,
        targetSize: layout.compact ? COMPACT_LIFE_TARGET_SIZE : LIFE_TARGET_SIZE,
      })
    }

    it("stays unset until the board has been measured", () => {
      const layout = getPlayerGridLayout({ playerCount: 6, width: 390, height: 844 })
      expect(
        getLifeFontSize({
          ...getCellSize({ board: { width: 0, height: 0 }, layout, gap: 4 }),
          digits: 2,
          fontScale: 1,
          targetSize: COMPACT_LIFE_TARGET_SIZE,
        }),
      ).toBeUndefined()
    })

    it("never grows as seats are added, and shrinks once rows get tight", () => {
      const [two, four, six] = [2, 4, 6].map((count) => sizeFor(count)!)
      expect(two).toBeGreaterThanOrEqual(four)
      expect(six).toBeLessThan(four)
      expect(six).toBeGreaterThanOrEqual(22)
      expect(two).toBeLessThanOrEqual(160)
    })

    it("shrinks for longer totals once width rather than height binds", () => {
      expect(sizeFor(4, 3)!).toBeLessThan(sizeFor(4, 2)!)
      expect(sizeFor(6, 4)!).toBeLessThan(sizeFor(6, 2)!)
    })

    it("fits compact two-digit totals inside the readout at large Android text sizes", () => {
      const layout = getPlayerGridLayout({ playerCount: 6, width: 390, height: 844 })
      const size = getLifeFontSize({
        ...getCellSize({ board, layout, gap: 4 }),
        digits: 2,
        fontScale: 1.3,
        targetSize: COMPACT_LIFE_TARGET_SIZE,
      })!

      expect(size * 1.3 * 2 * 0.62).toBeLessThanOrEqual(COMPACT_LIFE_TARGET_SIZE - 16)
    })

    it("keeps every seat on one shared size so the board reads as a scoreboard", () => {
      const layout = getPlayerGridLayout({ playerCount: 3, width: 390, height: 844 })
      const { cellWidth } = getCellSize({ board, layout, gap: 4 })
      expect(layout.layout).toBe("three-featured")
      expect(cellWidth).toBe((board.width - 4) / 2)
    })

    it("never drops below the readable floor on an extreme board", () => {
      const layout = getPlayerGridLayout({ playerCount: 6, width: 390, height: 844 })
      expect(
        getLifeFontSize({
          ...getCellSize({ board: { width: 60, height: 60 }, layout, gap: 4 }),
          digits: 9,
          fontScale: 1,
          targetSize: COMPACT_LIFE_TARGET_SIZE,
        }),
      ).toBe(12)
    })
  })

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

    expect(view.getByTestId("player-mark-seat-6", { includeHiddenElements: true })).toBeTruthy()
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

  it("marks only the owned player with a spinning icon", () => {
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
    expect(
      view.getAllByTestId("player-mark-spin-line", { includeHiddenElements: true }),
    ).toHaveLength(1)
    expect(StyleSheet.flatten(view.getByTestId("life-card-seat-1").props.style).borderStyle).toBe(
      undefined,
    )
    expect(StyleSheet.flatten(view.getByTestId("life-card-seat-2").props.style).borderStyle).toBe(
      undefined,
    )
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
