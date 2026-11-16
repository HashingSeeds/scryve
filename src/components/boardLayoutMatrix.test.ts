import { boardLabelPlacements } from "@/features/game/BoardContextLabels"
import { getPlayerGridLayoutOptions } from "@/features/game/playerLayouts"
import { spacing } from "@/theme/spacing"

import { lifeInk } from "./commanderDamageLayout"
import { seatBagSize } from "./CounterChips"
import { COMPACT_MENU_BUTTON_SIZE, MENU_BUTTON_SIZE } from "./GameRadialMenu"
import { CUTOUT_HALF_WIDTH, seatIdentityPlacement } from "./LifeCard"
import {
  clearOfCutout,
  cornerOffset,
  COMPACT_LIFE_GLYPH_LINE_HEIGHT,
  COMPACT_LIFE_TARGET_SIZE,
  CUTOUT_ENDS_INSIDE_INSET,
  LIFE_GLYPH_LINE_HEIGHT,
  LIFE_MAX_FONT_SCALE,
  LIFE_TARGET_SIZE,
  type LifeCardEdge,
} from "./playerCardTypes"
import { getCellSize, getLifeFontSize } from "./PlayerGrid"
import {
  boardInsetsFor,
  CONTENT_EDGES,
  EDGE_TAB,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  getPlayerGridRowFlex,
  getPlayerGridRows,
  seatFrames,
} from "./playerGridGeometry"
import { contentInsetsFor, MENU_CLEARANCE, menuClearance } from "./pokemon/pokemonCardLayout"
import { tallestKeypadHeight } from "./pokemon/PokemonKeypad"
import { keypadBesideForm } from "./pokemon/PokemonSheet"
import { seatIdentityBottomGap, seatIdentityMetrics, seatMarkArt } from "./SeatIdentity"
import { panelBoxes, teamGridLayout, teamPanelCompact } from "./teamGridGeometry"
import { shapeForSeat } from "../../convex/lib/appearance"

type Insets = Record<LifeCardEdge, number>
type Rect = { x: number; y: number; width: number; height: number }
type Seat = NonNullable<ReturnType<typeof seatFrames>["rows"][number][number]>
type BoardCase = (typeof CASES)[number]

const safeArea = (top: number, right: number, bottom: number, left: number): Insets => ({
  top,
  right,
  bottom,
  left,
})

// why: a board keeps its upright size when the device turns, and reads the sideways safe area turned with it, so each device lists both.
const DEVICES = [
  {
    name: "iPhone 12 mini",
    width: 375,
    height: 812,
    upright: safeArea(50, 0, 34, 0),
    sideways: safeArea(0, 50, 21, 50),
  },
  // why: no iPhone 17e simulator exists to measure, so this is the iPhone 16e, which shares its screen.
  {
    name: "iPhone 16e",
    width: 390,
    height: 844,
    upright: safeArea(47, 0, 34, 0),
    sideways: safeArea(0, 47, 21, 47),
  },
  {
    name: "iPad mini 6",
    width: 744,
    height: 1133,
    upright: safeArea(24, 0, 20, 0),
    sideways: safeArea(24, 0, 20, 0),
  },
  // why: measured on the Pixel 6a emulator profile (Android 16): the board hides both system bars, yet its top edge still reads the status bar's 132px at 2.625x, upright and turned.
  {
    name: "Pixel 6a",
    width: 411,
    height: 914,
    upright: safeArea(132 / 2.625, 0, 0, 0),
    sideways: safeArea(0, 132 / 2.625, 0, 0),
  },
  { name: "iPhone Duo closed", width: 466, height: 678, upright: safeArea(0, 84, 34, 0) },
  // why: no fold was measured; this takes the Pixel 6a's board inset on a book fold's open screen.
  {
    name: "book fold",
    width: 829,
    height: 690,
    spansHinge: true,
    upright: safeArea(132 / 2.625, 0, 0, 0),
  },
] as const satisfies readonly {
  name: string
  width: number
  height: number
  spansHinge?: boolean
  upright: Insets
  sideways?: Insets
}[]

// why: a team board lays its cards out as a board of that many seats, so `playerCount` counts cards: two to five teams of two.
const BOARDS = [
  ...[2, 3, 4, 5, 6].map((playerCount) => ({ playerCount, teamBoard: false })),
  ...[2, 3, 4, 5].map((playerCount) => ({ playerCount, teamBoard: true })),
]

const CASES = DEVICES.flatMap((device) =>
  BOARDS.flatMap(({ playerCount, teamBoard }) =>
    getPlayerGridLayoutOptions(playerCount).flatMap(({ variant }) =>
      ([0, 90] as const)
        .filter((boardRotation) => boardRotation === 0 || "sideways" in device)
        .flatMap((boardRotation) =>
          [false, true].map((tabsShown) => ({
            device,
            name: device.name,
            seats: teamBoard ? "teams" : "players",
            playerCount,
            teamBoard,
            variant,
            boardRotation,
            tabsShown,
          })),
        ),
    ),
  ),
)

// why: a one-row board (two or three seats side by side) puts the first-player tabs mid side edge, along a seat's row, which steps past tabs only at a seam. Found by this matrix and left for its own fix; set false to see those cases fail.
const TABS_MID_SIDE_EDGE_KNOWN_GAP = true

// why: rows add up flex shares, so a rect that only touches another can land a hair inside it.
const EPSILON = 0.01

const overlaps = (a: Rect, b: Rect) =>
  a.x + EPSILON < b.x + b.width &&
  b.x + EPSILON < a.x + a.width &&
  a.y + EPSILON < b.y + b.height &&
  b.y + EPSILON < a.y + a.height

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - EPSILON &&
  inner.y >= outer.y - EPSILON &&
  inner.x + inner.width <= outer.x + outer.width + EPSILON &&
  inner.y + inner.height <= outer.y + outer.height + EPSILON

const uprightSize = ({ card, rotation }: Seat) =>
  Math.abs(rotation) === 90
    ? { width: card.height, height: card.width }
    : { width: card.width, height: card.height }

function turnOntoBoard(
  seat: Seat,
  rect: { left: number; bottom: number; width: number; height: number },
) {
  const { card, rotation } = seat
  const upright = uprightSize(seat)
  const turn = (rotation * Math.PI) / 180
  const cos = Math.round(Math.cos(turn))
  const sin = Math.round(Math.sin(turn))
  const [[x1, y1], [x2, y2]] = [
    [rect.left, upright.height - rect.bottom - rect.height],
    [rect.left + rect.width, upright.height - rect.bottom],
  ].map(([x, y]) => {
    const dx = x - upright.width / 2
    const dy = y - upright.height / 2
    return [
      card.x + card.width / 2 + dx * cos - dy * sin,
      card.y + card.height / 2 + dx * sin + dy * cos,
    ]
  })
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

function midEdgeInset(board: Rect, edge: LifeCardEdge, depth: number): Rect {
  const span = CUTOUT_HALF_WIDTH * 2
  if (edge === "top") return { x: board.width / 2 - span / 2, y: 0, width: span, height: depth }
  if (edge === "bottom")
    return { x: board.width / 2 - span / 2, y: board.height - depth, width: span, height: depth }
  const y = board.height / 2 - span / 2
  return { x: edge === "left" ? 0 : board.width - depth, y, width: depth, height: span }
}

function boardObstacles(
  board: Rect,
  grid: ReturnType<typeof seatFrames>,
  menu: { x: number; y: number; size: number },
  tabsAt: number | null,
) {
  const hole = grid.cutout && grid.cutout.size - CUTOUT_ENDS_INSIDE_INSET
  return [
    ...(["top", "right", "bottom", "left"] as const)
      .filter((edge) => grid.insets[edge] > 0)
      .map((edge) => ({
        what: `${edge} inset`,
        rect: midEdgeInset(board, edge, grid.insets[edge]),
      })),
    ...(grid.cutout && hole
      ? [
          {
            what: "corner camera hole",
            rect: {
              x: grid.cutout.edge === "left" ? 0 : board.width - hole,
              y: 0,
              width: hole,
              height: hole,
            },
          },
        ]
      : []),
    ...(tabsAt === null
      ? []
      : [0, board.width - EDGE_TAB.depth].map((x) => ({
          what: "first-player tab",
          rect: {
            x,
            y: tabsAt - EDGE_TAB.length / 2,
            width: EDGE_TAB.depth,
            height: EDGE_TAB.length,
          },
        }))),
    {
      what: "menu",
      rect: {
        x: menu.x - menu.size / 2,
        y: menu.y - menu.size / 2,
        width: menu.size,
        height: menu.size,
      },
    },
  ]
}

function boardGrid({
  device,
  playerCount,
  teamBoard,
  variant,
  boardRotation,
  tabsShown,
}: BoardCase) {
  const board = { x: 0, y: 0, width: device.width, height: device.height }
  const layout = (teamBoard ? teamGridLayout : getPlayerGridLayout)({
    playerCount,
    width: board.width,
    height: board.height,
    layoutVariant: variant,
    spansHinge: "spansHinge" in device,
  })
  const insets =
    boardRotation === 90 && "sideways" in device
      ? boardInsetsFor(device.sideways, boardRotation)
      : device.upright
  const grid = seatFrames({
    playerCount,
    layout,
    boardSize: board,
    measuredGrid: board,
    topEdgeBand: 0,
    gap: spacing.xxs,
    insets,
    tabsShown,
  })
  const anchor = getPlayerGridMenuAnchor(playerCount, layout)
  const menu = {
    x: anchor.x * board.width,
    y: anchor.y * board.height,
    size: playerCount > 2 ? COMPACT_MENU_BUTTON_SIZE : MENU_BUTTON_SIZE,
  }
  const tabsAt =
    tabsShown && !(TABS_MID_SIDE_EDGE_KNOWN_GAP && layout.rowCount === 1) ? menu.y : null
  return { board, layout, insets, grid, obstacles: boardObstacles(board, grid, menu, tabsAt) }
}

function boardSeats(boardCase: BoardCase) {
  const { layout, grid, obstacles } = boardGrid(boardCase)
  const compact = boardCase.teamBoard
    ? teamPanelCompact(layout, boardCase.playerCount)
    : layout.compact
  const metrics = seatIdentityMetrics(compact)
  const buttonSize = seatBagSize(compact)
  return grid.rows.flat().flatMap((seat) => {
    if (!seat) return []
    const markHeight = seatMarkArt(shapeForSeat(seat.slot + 1), compact).height
    const placement = seatIdentityPlacement({
      rotation: seat.rotation,
      cardSize: seat.card,
      gap: metrics.edge,
      insets: seat.contentInsets,
      screenEdges: seat.screenEdges,
      markHeight,
      buttonSize,
    })
    return [{ seat, compact, metrics, buttonSize, markHeight, placement, obstacles }]
  })
}

type BoardSeat = ReturnType<typeof boardSeats>[number]

function expectClear(what: string, rect: Rect, { seat, obstacles }: BoardSeat) {
  const hits = obstacles.filter((obstacle) => overlaps(rect, obstacle.rect)).map((o) => o.what)
  expect({ seat: seat.slot + 1, what, hits }).toEqual({ seat: seat.slot + 1, what, hits: [] })
}

function expectIdentityRowInsideAndClear(boardSeat: BoardSeat) {
  const { seat, placement, markHeight } = boardSeat
  expect(placement.rowMaxWidth).toBeGreaterThanOrEqual(0)
  expect(placement.position.maxWidth).toBeGreaterThanOrEqual(0)
  const longestRow = turnOntoBoard(seat, {
    left: Number(placement.position.left),
    bottom: Number(placement.position.bottom),
    width: Number(placement.rowMaxWidth),
    height: markHeight,
  })
  expect(contains(seat.card, longestRow)).toBe(true)
  expectClear("identity row", longestRow, boardSeat)
}

function expectButtonsCenteredOnMarkOrOwnCornerRow(boardSeat: BoardSeat) {
  const { seat, placement, metrics, buttonSize, markHeight } = boardSeat
  const edges = CONTENT_EDGES[seat.rotation]
  const markBottom = Number(placement.position.bottom)
  const ownCorner = cornerOffset(
    metrics.edge,
    edges.bottom,
    edges.right,
    seat.contentInsets,
    seat.screenEdges,
  )
  expect(placement.trailing.bottom + buttonSize / 2).toBe(
    Math.max(markBottom, ownCorner) + markHeight / 2,
  )
  const bagAndCalculator = turnOntoBoard(seat, {
    left: uprightSize(seat).width - placement.trailing.right - buttonSize * 2 - metrics.gap,
    bottom: placement.trailing.bottom,
    width: buttonSize * 2 + metrics.gap,
    height: buttonSize,
  })
  expectClear("bag and calculator", bagAndCalculator, boardSeat)
}

function expectRaisedMarkBelowLifeGlyphs({ seat, placement, compact, markHeight }: BoardSeat) {
  const edges = CONTENT_EDGES[seat.rotation]
  const inset = contentInsetsFor(seat.rotation, seat.contentInsets).bottom
  const markBottom = Number(placement.position.bottom)
  const raised =
    seat.screenEdges[edges.left] &&
    seat.screenEdges[edges.right] &&
    inset > 0 &&
    markBottom === inset
  if (!raised) return
  const glyphLine = compact ? COMPACT_LIFE_GLYPH_LINE_HEIGHT : LIFE_GLYPH_LINE_HEIGHT
  expect(markBottom + markHeight).toBeLessThanOrEqual(uprightSize(seat).height / 2 - glyphLine / 2)
}

function expectBenchRoomBesideMenu({ seat }: BoardSeat) {
  if (!seat.menuCorner && !seat.menuEdgeCenter) return
  const room = menuClearance(seat.rotation, seat.menuCorner, seat.menuEdgeCenter)
  expect(room.top + room.left + room.right).toBeGreaterThan(0)
}

// why: PokemonSheet pads its content 10 above and below, 6 on a seat under 260 tall, so a change to that padding needs the same change here.
function expectKeypadStacksOnlyWhenItFits({ seat, compact }: BoardSeat) {
  const upright = uprightSize(seat)
  const cramped = compact || upright.height < 260
  const insets = contentInsetsFor(seat.rotation, clearOfCutout(seat.contentInsets))
  const menuRoom = menuClearance(seat.rotation, seat.menuCorner, seat.menuEdgeCenter)
  const sheetHeight =
    upright.height - (cramped ? 12 : 20) - insets.top - insets.bottom - menuRoom.top
  if (!keypadBesideForm(upright, sheetHeight, cramped))
    expect(tallestKeypadHeight(cramped)).toBeLessThanOrEqual(sheetHeight)
}

// why: the boards pass the label only the match line, and its longest translation of "Game 3 · 2-1" measures about this at 12pt.
const LABEL = { width: 110, height: 18 }

// why: PlayerGrid sizes two digits, the largest total it draws, to the grid's cell, or to a team's own panel. LifeControls then centres the line on the card, where the digits' ink sits a little high and grows with the text size; the line box around the ink is empty.
function lifeTotalBox({ seat, compact }: BoardSeat, boardCase: BoardCase, fontScale: number) {
  const { board, layout } = boardGrid(boardCase)
  const slots = getPlayerGridRows(boardCase.playerCount, layout)
  const panel = boardCase.teamBoard
    ? panelBoxes(
        slots,
        slots.map((row) => getPlayerGridRowFlex(row, layout)),
      ).get(seat.slot)
    : undefined
  const glyphLine = compact ? COMPACT_LIFE_GLYPH_LINE_HEIGHT : LIFE_GLYPH_LINE_HEIGHT
  const fontSize =
    getLifeFontSize({
      ...(panel
        ? {
            cellWidth: (panel.x1 - panel.x0) * board.width,
            cellHeight: (panel.y1 - panel.y0) * board.height,
          }
        : getCellSize({ board, layout, gap: spacing.xxs })),
      digits: 2,
      fontScale,
      targetSize: compact ? COMPACT_LIFE_TARGET_SIZE : LIFE_TARGET_SIZE,
      sidewaysGlyphReserve: 2 * (glyphLine + spacing.xs),
    }) ?? 0
  const ink = lifeInk(fontSize, 2)
  const scale = Math.min(fontScale, LIFE_MAX_FONT_SCALE)
  const upright = uprightSize(seat)
  return turnOntoBoard(seat, {
    left: (upright.width - ink.width * scale) / 2,
    bottom: upright.height / 2 - (ink.y + ink.height / 2) * scale,
    width: ink.width * scale,
    height: ink.height * scale,
  })
}

// why: a team card (TeamCorners in TeamZone) draws a name out from each top corner as far as the middle, a bag in each bottom corner, and its shared row between the bags; each is taken at its widest.
function teamContent({ seat, compact, metrics, buttonSize }: BoardSeat) {
  const upright = uprightSize(seat)
  const edges = CONTENT_EDGES[seat.rotation]
  const menuHalf = (compact ? COMPACT_MENU_BUTTON_SIZE : MENU_BUTTON_SIZE) / 2
  const corner = (edge: LifeCardEdge, side: LifeCardEdge) =>
    cornerOffset(metrics.gap, edge, side, seat.contentInsets, seat.screenEdges)
  const along = (side: "left" | "right", end: "top" | "bottom") =>
    corner(edges[side], edges[end]) +
    (seat.menuCorner?.toLowerCase().includes(edges[side]) &&
    seat.menuCorner.toLowerCase().includes(edges[end])
      ? menuHalf
      : 0)
  const topMenu = seat.menuEdgeCenter === edges.top ? menuHalf : 0
  const inset = seat.contentInsets[edges.bottom]
  const rowBottom = seatIdentityBottomGap(metrics.edge, inset) + inset
  const fromLeft = (side: "left" | "right", offset: number, width: number) =>
    side === "left" ? offset : upright.width - offset - width
  const sides = ["left", "right"] as const
  return [
    ...sides.map((side) => {
      const width = Math.max(upright.width / 2 - along(side, "top") - metrics.gap - topMenu, 0)
      return {
        left: fromLeft(side, along(side, "top"), width),
        bottom: upright.height - corner(edges.top, edges[side]) - metrics.icon,
        width,
        height: metrics.icon,
      }
    }),
    ...sides.map((side) => ({
      left: fromLeft(side, along(side, "bottom"), buttonSize),
      bottom: rowBottom + (metrics.icon - buttonSize) / 2,
      width: buttonSize,
      height: buttonSize,
    })),
    {
      left: along("left", "bottom"),
      bottom: rowBottom,
      width: upright.width - along("left", "bottom") - along("right", "bottom"),
      height: metrics.icon,
    },
  ]
}

function soloContent({ seat, placement, markHeight, metrics, buttonSize }: BoardSeat) {
  return [
    {
      left: Number(placement.position.left),
      bottom: Number(placement.position.bottom),
      width: Number(placement.rowMaxWidth),
      height: markHeight,
    },
    {
      left: uprightSize(seat).width - placement.trailing.right - buttonSize * 2 - metrics.gap,
      bottom: placement.trailing.bottom,
      width: buttonSize * 2 + metrics.gap,
      height: buttonSize,
    },
  ]
}

// why: the legacy stage draws a turned board upright and rotates it onto a screen of the turned size, so its copies come back in screen points and are turned back here to meet the seats.
function labelsOnBoard(boardCase: BoardCase, fontScale: number, benchSeats: boolean) {
  const { board, layout, insets } = boardGrid(boardCase)
  const { boardRotation } = boardCase
  const screen =
    boardRotation === 90
      ? { width: board.height, height: board.width }
      : { width: board.width, height: board.height }
  return boardLabelPlacements({
    playerCount: boardCase.playerCount,
    teamBoard: boardCase.teamBoard,
    layout,
    width: board.width,
    height: board.height,
    screen,
    rotation: boardRotation,
    fontScale,
    insets,
    tabsShown: boardCase.tabsShown,
    benchSeats,
  }).map(({ left, top, width, turn }) => {
    const x = left + width / 2 - screen.width / 2
    const y = top + LABEL.height / 2 - screen.height / 2
    const facing = boardRotation === 90 ? (turn === -90 ? 180 : turn - 90) : turn
    const sideways = Math.abs(facing) === 90
    const size = { width: Math.min(width, LABEL.width), height: LABEL.height * fontScale }
    // why: the line's text is anchored at its foot and grows toward the seat's top edge.
    const grown = (size.height - LABEL.height) / 2
    const angle = (facing * Math.PI) / 180
    const center = {
      x: board.width / 2 + (boardRotation === 90 ? y : x) + Math.round(Math.sin(angle)) * grown,
      y: board.height / 2 + (boardRotation === 90 ? -x : y) - Math.round(Math.cos(angle)) * grown,
    }
    return {
      facing,
      rect: {
        x: center.x - (sideways ? size.height : size.width) / 2,
        y: center.y - (sideways ? size.width : size.height) / 2,
        width: sideways ? size.height : size.width,
        height: sideways ? size.width : size.height,
      },
    }
  })
}

function expectMatchLabelsInsideSeatsAndClear(boardCase: BoardCase) {
  const seats = boardSeats(boardCase)
  const facings = new Set(seats.map(({ seat }) => seat.rotation))
  for (const fontScale of [1, 1.3])
    for (const benchSeats of boardCase.teamBoard ? [false] : [false, true]) {
      const labels = labelsOnBoard(boardCase, fontScale, benchSeats)
      const drawn = labels.map(({ facing }) => facing)
      expect(new Set(drawn).size).toBe(drawn.length)
      // why: a seat with no clear strip draws no copy, which only larger text or a team card brings about.
      if (!benchSeats && !boardCase.teamBoard && fontScale === 1)
        expect(new Set(drawn)).toEqual(facings)
      for (const { facing, rect } of labels) {
        const home = seats.filter(({ seat }) => contains(seat.card, rect))
        expect(home.map(({ seat }) => seat.rotation)).toEqual([facing])
        const [boardSeat] = home
        const { seat } = boardSeat
        expectClear("match label", rect, boardSeat)
        if (benchSeats) {
          expect(seat.menuEdgeCenter).toBe(CONTENT_EDGES[seat.rotation].top)
          const upright = uprightSize(seat)
          const menuBand = turnOntoBoard(seat, {
            left: 0,
            bottom: upright.height - MENU_CLEARANCE,
            width: upright.width,
            height: MENU_CLEARANCE,
          })
          expect(contains(menuBand, rect)).toBe(true)
          continue
        }
        const content = (boardCase.teamBoard ? teamContent : soloContent)(boardSeat).map((box) =>
          turnOntoBoard(seat, box),
        )
        for (const box of [...content, lifeTotalBox(boardSeat, boardCase, fontScale)])
          expect({ boardCase, fontScale, facing, hit: overlaps(rect, box) && box }).toEqual({
            boardCase,
            fontScale,
            facing,
            hit: false,
          })
      }
    }
}

describe("board layout matrix", () => {
  it.each(CASES)(
    "$name, $playerCount $seats, $variant, board at $boardRotation°, tabs shown $tabsShown",
    (boardCase) => {
      for (const boardSeat of boardCase.teamBoard ? [] : boardSeats(boardCase)) {
        expectIdentityRowInsideAndClear(boardSeat)
        expectButtonsCenteredOnMarkOrOwnCornerRow(boardSeat)
        expectRaisedMarkBelowLifeGlyphs(boardSeat)
        expectBenchRoomBesideMenu(boardSeat)
        expectKeypadStacksOnlyWhenItFits(boardSeat)
      }
      expectMatchLabelsInsideSeatsAndClear(boardCase)
    },
  )
})
