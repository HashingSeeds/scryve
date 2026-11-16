import { LIFE_TARGET_SIZE, type LifeCardEdge } from "@/components/playerCardTypes"
import { getCellSize, getLifeFontSize } from "@/components/PlayerGrid"
import { getPlayerGridLayout, seatFrames } from "@/components/playerGridGeometry"
import { spacing } from "@/theme/spacing"

import { contextLabelPlacements } from "./BoardContextLabels"

const phone = { width: 375, height: 812 }
const phoneInsets = { top: 50, right: 0, bottom: 34, left: 0 }
const noInsets = { top: 0, right: 0, bottom: 0, left: 0 }

function place({
  playerCount,
  board,
  insets,
  ...rest
}: {
  playerCount: number
  board: { width: number; height: number }
  insets: Record<LifeCardEdge, number>
} & Pick<Parameters<typeof contextLabelPlacements>[0], "screen" | "rotation" | "benchSeats">) {
  const layout = getPlayerGridLayout({ playerCount, ...board })
  const { rows } = seatFrames({
    playerCount,
    layout,
    boardSize: board,
    measuredGrid: board,
    topEdgeBand: 0,
    gap: spacing.xxs,
    insets,
    tabsShown: false,
  })
  return contextLabelPlacements({
    rows,
    board,
    compact: layout.compact,
    lifeFontSize: getLifeFontSize({
      ...getCellSize({ board, layout, gap: spacing.xxs }),
      digits: 2,
      fontScale: 1,
      targetSize: LIFE_TARGET_SIZE,
      sidewaysGlyphReserve: 116,
    }),
    ...rest,
  })
}

describe("contextLabelPlacements", () => {
  it("puts each copy above its own seat's identity row on a stacked phone board", () => {
    expect(place({ playerCount: 2, board: phone, insets: phoneInsets })).toEqual([
      { left: 0, top: 86, width: 375, turn: 180 },
      { left: 0, top: 724, width: 375, turn: 0 },
    ])
  })

  it("keeps each copy inside one seat when the stacked board is drawn sideways", () => {
    const placements = place({
      playerCount: 2,
      board: { width: 744, height: 1133 },
      screen: { width: 1133, height: 744 },
      rotation: 90,
      insets: noInsets,
    })
    expect(placements).toEqual([
      { left: 700, top: 363, width: 744, turn: -90 },
      { left: -311, top: 363, width: 744, turn: 90 },
    ])
  })

  it("keeps a bench seat's copy in the strip beside the menu, clear of the bench", () => {
    expect(place({ playerCount: 2, board: phone, insets: phoneInsets, benchSeats: true })).toEqual([
      { left: 231.5, top: 373, width: 103.5, turn: 180 },
      { left: 40, top: 421, width: 103.5, turn: 0 },
    ])
  })

  it("turns one copy to each side of a four-seat grid, along the top edge of a seat", () => {
    expect(place({ playerCount: 4, board: phone, insets: phoneInsets })).toEqual([
      { left: -31.5, top: 193, width: 404, turn: 90 },
      { left: 2.5, top: 193, width: 404, turn: -90 },
    ])
  })

  it("gives a featured seat its own copy", () => {
    const turns = place({ playerCount: 3, board: phone, insets: phoneInsets }).map(
      ({ turn }) => turn,
    )
    expect(turns).toEqual([180, 90, -90])
  })
})
