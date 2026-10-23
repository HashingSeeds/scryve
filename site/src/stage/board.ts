import {
  getPlayerContentRotation,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  getPlayerGridRowFlex,
  getPlayerGridRows,
} from "@/components/playerGridGeometry"
import type { PlayerGridLayoutVariant } from "@/features/game/playerLayouts"
import { playSystemRules, playTableRules, type PlaySystemId } from "@/features/game/playSystems"
import { accessibleForeground } from "@/utils/colorContrast"

import {
  PLAYER_COLOR_CHOICES,
  PLAYER_MARK_SHAPES,
  type PlayerMarkShape,
  type ProMarkShape,
} from "../../../convex/lib/appearance"
import {
  applyTableAction,
  EMPTY_TABLE,
  findPokemon,
  pokemonBoardOf,
  type TableAction,
} from "../../../convex/lib/table"
import { HINT_PRESS_MS, showTapHint } from "./hint"
import { createDemoScript } from "./script"
import {
  createPokemonSeats,
  demoId,
  menuSpotAt,
  playerIdOf,
  sampleTable,
  seatOf,
  type MenuSpot,
  type PokemonTableEvent,
} from "./pokemon"
import { createCalculators, hasCalculator } from "./yugioh"

// The game menu button, ported from the app's dark keystone shape
// (src/components/GameMenuButtonShape.tsx) and three-bar glyph (GameRadialMenu.tsx).
// Keep the geometry in sync with those files.
const PENTAGON_VIEWBOX = 100
const PENTAGON_RADIUS = 46
const PENTAGON_STROKE_WIDTH = 7
const PENTAGON_BORDER = "#000000"
const PENTAGON_FACE = { top: "#46434E", bottom: "#26242C" } as const
const PENTAGON_GLYPH = "#FFFFFF"

// The app's softened corners (buildSoftCorners): each corner is a quadratic curve that starts and
// ends `cornerRadius` along its two sides, so the pentagon is rounded, not pointy.
const PENTAGON_CORNER_RADIUS = 9
const FACE_CORNER_RADIUS = PENTAGON_CORNER_RADIUS * 0.9

function softPentagonPath(radius: number, cornerRadius: number): string {
  const center = PENTAGON_VIEWBOX / 2
  const tips = Array.from({ length: 5 }, (_, corner) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * corner) / 5
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) }
  })
  const share = Math.min(cornerRadius / (2 * radius * Math.sin(Math.PI / 5)), 0.45)
  type Point = (typeof tips)[number]
  const towards = (from: Point, to: Point) => ({
    x: from.x + (to.x - from.x) * share,
    y: from.y + (to.y - from.y) * share,
  })
  const point = ({ x, y }: Point) => `${x.toFixed(2)},${y.toFixed(2)}`
  const corners = tips.map((tip, corner) => {
    const enter = towards(tip, tips[(corner + 4) % 5] ?? tip)
    const exit = towards(tip, tips[(corner + 1) % 5] ?? tip)
    return `${corner === 0 ? "M" : "L"}${point(enter)} Q${point(tip)} ${point(exit)}`
  })
  return `${corners.join(" ")} Z`
}

const PENTAGON_PATH = softPentagonPath(PENTAGON_RADIUS, PENTAGON_CORNER_RADIUS)
const FACE_PATH = softPentagonPath(PENTAGON_RADIUS - PENTAGON_STROKE_WIDTH / 2, FACE_CORNER_RADIUS)

// The app's glyph keeps splash-ios-source.svg's bars (GameRadialMenu SPLASH_MENU_GLYPH), scaled
// from the splash pentagon's radius to this one.
const SPLASH_MENU_GLYPH = { pentagonRadius: 92, barWidth: 70, barHeight: 10, pitch: 26 } as const
const GLYPH_BARS = [-1, 0, 1]
  .map((row) => {
    const unit = (splash: number) => (splash * PENTAGON_RADIUS) / SPLASH_MENU_GLYPH.pentagonRadius
    const { barWidth, barHeight, pitch } = SPLASH_MENU_GLYPH
    const center = PENTAGON_VIEWBOX / 2
    return `<rect x="${center - unit(barWidth / 2)}" y="${center + unit(row * pitch - barHeight / 2)}" width="${unit(barWidth)}" height="${unit(barHeight)}" rx="${unit(barHeight / 2)}" fill="${PENTAGON_GLYPH}"/>`
  })
  .join("")

// Several boards share a page, so each pentagon's gradient gets its own id.
let pentagonCount = 0

function pentagonSvg(): string {
  const gradient = `pentagon-fill-${pentagonCount++}`
  return `<svg viewBox="0 0 ${PENTAGON_VIEWBOX} ${PENTAGON_VIEWBOX}" aria-hidden="true"><defs><linearGradient id="${gradient}" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="${PENTAGON_FACE.top}"/><stop offset="1" stop-color="${PENTAGON_FACE.bottom}"/></linearGradient></defs><path d="${PENTAGON_PATH}" fill="url(#${gradient})" stroke="${PENTAGON_BORDER}" stroke-width="${PENTAGON_STROKE_WIDTH}" stroke-linejoin="round"/><path d="${FACE_PATH}" fill="none" stroke="${PENTAGON_BORDER}" stroke-opacity="0.22" stroke-width="1.4" stroke-linejoin="round"/>${GLYPH_BARS}</svg>`
}

// Matches the app (LifeCard DELTA_VISIBLE_MS): how long the running change shows in a glyph.
const DELTA_VISIBLE_MS = 1800
// The smallest a running change shrinks, and the gap it keeps from the total. The demo's seats run
// smaller than the app's, so its floor sits below the app's 12.
const DELTA_FONT_MIN_PX = 9
const DELTA_LIFE_GAP_PX = 4

// A running change keeps its glyph's spot, shrinking to the room between the total and the edge.
// Offsets ignore the seat's rotation, so this measures along the seat's own reading direction.
function fitDeltas(root: Element) {
  for (const glyph of root.querySelectorAll<HTMLElement>(".glyph")) {
    glyph.style.fontSize = ""
    const parent = glyph.parentElement
    const total = parent?.querySelector<HTMLElement>(".life, .pk-hp")
    if (!glyph.classList.contains("delta") || !parent || !total) continue
    const inset = glyph.classList.contains("plus")
      ? parent.clientWidth - glyph.offsetLeft - glyph.offsetWidth
      : glyph.offsetLeft
    const room = (parent.clientWidth - total.offsetWidth) / 2 - inset - DELTA_LIFE_GAP_PX
    if (glyph.offsetWidth <= room) continue
    const size = parseFloat(getComputedStyle(glyph).fontSize)
    glyph.style.fontSize = `${Math.max(DELTA_FONT_MIN_PX, (size * room) / glyph.offsetWidth)}px`
  }
}

type SiteMarkShape = Exclude<PlayerMarkShape, ProMarkShape>

export function seatColor(seat: number): string {
  return PLAYER_COLOR_CHOICES[seat % PLAYER_COLOR_CHOICES.length] ?? PLAYER_COLOR_CHOICES[0]
}

export function seatShape(seat: number): SiteMarkShape {
  return PLAYER_MARK_SHAPES[seat % PLAYER_MARK_SHAPES.length] ?? PLAYER_MARK_SHAPES[0]
}

export function markSvg(shape: SiteMarkShape, fill = "currentColor"): string {
  // The app marks, cropped so their 8-36 box fills 2-22 of a 24 unit icon.
  return `<svg viewBox="5.2 5.2 33.6 33.6" fill="${fill}" aria-hidden="true">${APP_MARK_SHAPES[shape]}</svg>`
}

type GameEvent =
  | { type: "change"; seat: number; delta: number }
  | ({ type: "table" } & PokemonTableEvent)
  | { type: "reset" }

export interface DemoGameSetup {
  system: PlaySystemId
  startingLife: number
  names: readonly string[]
  layout: PlayerGridLayoutVariant
  // Starting values per seat; seats beyond this list start at `startingLife`.
  values?: readonly number[]
}

export type DemoGame = ReturnType<typeof createDemoGame>

// A local, in-memory game. Several boards can mount the same game and stay in sync.
export function createDemoGame(initial: DemoGameSetup) {
  const listeners = new Set<(event: GameEvent) => void>()
  const history: { seat: number; delta: number }[] = []
  let setup = initial
  let life = startingValues(setup)
  let table = startingTable(setup)

  function startingValues(next: DemoGameSetup) {
    return next.names.map((_, seat) => next.values?.[seat] ?? next.startingLife)
  }
  function startingTable(next: DemoGameSetup) {
    return next.system === "pokemon" ? sampleTable(next.names.length) : EMPTY_TABLE
  }

  function emit(event: GameEvent) {
    listeners.forEach((listener) => listener(event))
  }
  // Changes a total by any amount, floored at zero.
  function adjust(seat: number, delta: number) {
    const current = life[seat] ?? 0
    const next = Math.max(0, current + delta)
    if (next === current) return
    life = life.map((value, index) => (index === seat ? next : value))
    history.push({ seat, delta: next - current })
    emit({ type: "change", seat, delta: next - current })
  }

  return {
    get setup() {
      return setup
    },
    get life(): readonly number[] {
      return life
    },
    get table() {
      return table
    },
    subscribe(listener: (event: GameEvent) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    change(seat: number, direction: 1 | -1) {
      adjust(seat, direction * playSystemRules(setup.system).counter.tapStep)
    },
    adjust,
    // A seat's changes since the game last reset, oldest first, for the calculator's trail.
    lifeChanges(seat: number) {
      return history.flatMap((change) => (change.seat === seat ? change.delta : []))
    },
    undo() {
      const last = history.pop()
      if (!last) return
      life = life.map((value, index) => (index === last.seat ? value - last.delta : value))
      emit({ type: "change", seat: last.seat, delta: -last.delta })
    },
    // Runs a table action through the app's reducer, so Pokémon damage, knockouts, and the
    // prizes they take work as they do in the app. False when the table rejects the action.
    act(action: TableAction) {
      const seat = seatOf(action.playerId)
      const damaged = action.kind === "pokemon.damaged" ? action.pokemonId : undefined
      const before = findPokemon(pokemonBoardOf(table, action.playerId), damaged ?? "")?.pokemon
      const operationId = demoId("operation")
      const change = applyTableAction(table, action, {
        rules: playTableRules(setup.system),
        operationId,
        lifeOf: (playerId) => life[seatOf(playerId)],
      })
      if (!change || change.table === table) return false
      table = change.table
      const board = pokemonBoardOf(table, action.playerId)
      const knockout =
        board.lastKnockout?.operationId === operationId ? board.lastKnockout : undefined
      const after = findPokemon(board, damaged ?? "")?.pokemon
      emit({
        type: "table",
        seat,
        ...(before && after
          ? { damage: { pokemonId: after.id, delta: after.damage - before.damage } }
          : {}),
        ...(knockout ? { knockout } : {}),
      })
      for (const { playerId, delta } of change.life) {
        const taker = seatOf(playerId)
        life = life.map((value, index) => (index === taker ? Math.max(0, value + delta) : value))
        emit({ type: "change", seat: taker, delta })
      }
      return true
    },
    reset(next: Partial<DemoGameSetup> = {}) {
      setup = { ...setup, ...next }
      life = startingValues(setup)
      table = startingTable(setup)
      history.length = 0
      emit({ type: "reset" })
    },
    // The whole game as it stands, for `restore` to put back after a demo borrows the board.
    snapshot() {
      return { setup, life, table, history: [...history] }
    },
    restore(saved: {
      setup: typeof setup
      life: typeof life
      table: typeof table
      history: typeof history
    }) {
      ;({ setup, life, table } = saved)
      history.splice(0, history.length, ...saved.history)
      emit({ type: "reset" })
    },
  }
}

type SeatPlacement = { seat: number; rotation: number; rowLength: number; menu?: MenuSpot }

// Seats follow the app's portrait grid exactly.
function phoneRows(game: DemoGame) {
  const count = game.setup.names.length
  const layout = getPlayerGridLayout({
    playerCount: count,
    width: 390,
    height: 844,
    layoutVariant: game.setup.layout,
  })
  const rows = getPlayerGridRows(count, layout)
  return {
    menu: getPlayerGridMenuAnchor(count, layout),
    rows: rows.map((row, rowIndex) => ({
      flex: getPlayerGridRowFlex(row, layout),
      seats: row.map((seat, columnIndex): SeatPlacement | null =>
        seat === null
          ? null
          : {
              seat,
              rotation: getPlayerContentRotation({
                playerCount: count,
                layout,
                row,
                rowIndex,
                columnIndex,
                slot: seat,
              }),
              rowLength: row.length,
              menu: menuSpotAt(rows, layout, rowIndex, columnIndex),
            },
      ),
    })),
  }
}

// ---------- commander damage demo ----------
// Mirrors the app: one player enters assign mode (CommanderDamageCardControls), taps damage
// onto opponents, and taps Done. Afterwards each seat that took damage shows its CommanderStrip,
// a mini map of the board with one cell per player at that player's seat position.

// The app's mark shapes (src/components/PlayerMark.tsx), drawn on a 44 unit box.
const APP_MARK_SHAPES: Record<SiteMarkShape, string> = {
  circle: '<circle cx="22" cy="22" r="12"/>',
  triangle:
    '<path d="M19.83 9.82a2.5 2.5 0 0 1 4.34 0l11.91 20.94a2.5 2.5 0 0 1-2.18 3.74H10.1a2.5 2.5 0 0 1-2.18-3.74Z"/>',
  square: '<rect x="11" y="11" width="22" height="22" rx="3"/>',
  diamond:
    '<path d="M20.23 9.77a2.5 2.5 0 0 1 3.54 0l10.46 10.46a2.5 2.5 0 0 1 0 3.54L23.77 34.23a2.5 2.5 0 0 1-3.54 0L9.77 23.77a2.5 2.5 0 0 1 0-3.54Z"/>',
  star: '<path d="M20.61 9.37a1.5 1.5 0 0 1 2.78 0l2.84 6.91a1 1 0 0 0 .85.62l7.45.57a1.5 1.5 0 0 1 .86 2.64l-5.69 4.84a1 1 0 0 0-.33 1l1.76 7.26a1.5 1.5 0 0 1-2.24 1.63l-6.37-3.92a1 1 0 0 0-1.04 0l-6.37 3.92a1.5 1.5 0 0 1-2.24-1.63l1.76-7.26a1 1 0 0 0-.33-1l-5.69-4.84a1.5 1.5 0 0 1 .86-2.64l7.45-.57a1 1 0 0 0 .85-.62Z"/>',
  hexagon:
    '<path d="M20.75 8.72a2.5 2.5 0 0 1 2.5 0l9.62 5.56a2.5 2.5 0 0 1 1.25 2.16v11.12a2.5 2.5 0 0 1-1.25 2.16l-9.62 5.56a2.5 2.5 0 0 1-2.5 0l-9.62-5.56a2.5 2.5 0 0 1-1.25-2.16V16.44a2.5 2.5 0 0 1 1.25-2.16Z"/>',
  plus: '<path d="M17 10.5A2.5 2.5 0 0 1 19.5 8h5a2.5 2.5 0 0 1 2.5 2.5V16a1 1 0 0 0 1 1h5.5a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H28a1 1 0 0 0-1 1v5.5a2.5 2.5 0 0 1-2.5 2.5h-5a2.5 2.5 0 0 1-2.5-2.5V28a1 1 0 0 0-1-1h-5.5A2.5 2.5 0 0 1 8 24.5v-5a2.5 2.5 0 0 1 2.5-2.5H16a1 1 0 0 0 1-1Z"/>',
  shield:
    '<path d="M21.04 8.4a2.5 2.5 0 0 1 1.92 0l9.5 3.96A2.5 2.5 0 0 1 34 14.67V23c0 6-5 10-12 14-7-4-12-8-12-14v-8.33a2.5 2.5 0 0 1 1.54-2.31Z"/>',
  heart:
    '<path d="M22 34.84 19.97 32.99C12.76 26.45 8 22.14 8 16.85 8 12.54 11.39 9.15 15.7 9.15c2.44 0 4.77 1.13 6.3 2.93 1.53-1.8 3.86-2.93 6.3-2.93 4.31 0 7.7 3.39 7.7 7.7 0 5.29-4.76 9.6-11.97 16.14Z"/>',
}

// Each shape's drawn edges on its 44 unit box (PlayerMark's MARK_ART_BOUNDS).
const MARK_ART_BOUNDS: Record<
  SiteMarkShape,
  { top: number; bottom: number; left: number; right: number }
> = {
  circle: { top: 10, bottom: 34, left: 10, right: 34 },
  triangle: { top: 8.56, bottom: 34.5, left: 7.59, right: 36.41 },
  square: { top: 11, bottom: 33, left: 11, right: 33 },
  diamond: { top: 9.04, bottom: 34.96, left: 9.04, right: 34.96 },
  star: { top: 8.43, bottom: 35.06, left: 8.08, right: 35.92 },
  hexagon: { top: 8.39, bottom: 35.61, left: 9.88, right: 34.12 },
  plus: { top: 8, bottom: 36, left: 8, right: 36 },
  shield: { top: 8.21, bottom: 37, left: 10, right: 34 },
  heart: { top: 9.15, bottom: 34.84, left: 8, right: 36 },
}

// A mark cropped to its drawn edges, so the shape itself, not its box, lines up with what sits
// beside it (SeatIdentity's seatMarkArt). Its width follows the shape.
export function croppedMarkSvg(shape: SiteMarkShape, fill: string): string {
  const { top, bottom, left, right } = MARK_ART_BOUNDS[shape]
  const width = (right - left).toFixed(2)
  const height = (bottom - top).toFixed(2)
  return `<svg viewBox="${left} ${top} ${width} ${height}" width="${width}" height="${height}" fill="${fill}" aria-hidden="true">${APP_MARK_SHAPES[shape]}</svg>`
}

// Where the sword sits inside each shape (PlayerMark's SWORD_INSET_THAT_FITS_SHAPE).
const SWORD_INSETS: Record<SiteMarkShape, { centerY: number; size: number }> = {
  circle: { centerY: 22, size: 14 },
  square: { centerY: 22, size: 15 },
  diamond: { centerY: 22, size: 14 },
  hexagon: { centerY: 22, size: 16 },
  triangle: { centerY: 25, size: 14 },
  star: { centerY: 23, size: 12 },
  plus: { centerY: 22, size: 12 },
  shield: { centerY: 21.5, size: 15 },
  heart: { centerY: 22.5, size: 13 },
}

// The sword glyph from src/components/Sword.tsx, on a 24 unit box.
const SWORD_PATHS =
  '<path d="M12 2.5 14.1 6.4V14.4H9.9V6.4z"/><rect x="6.8" y="14.6" width="10.4" height="1.9" rx="0.9"/><rect x="11.05" y="16.9" width="1.9" height="4.6" rx="0.9"/>'

// A player's mark. `sword` cuts the sword into the shape, as the app does for the attacker.
function appMarkSvg(shape: SiteMarkShape, color: string, sword?: string): string {
  const { centerY, size } = SWORD_INSETS[shape]
  const inset = sword
    ? `<g fill="${sword}" transform="translate(${22 - size / 2} ${centerY - size / 2}) scale(${size / 24})">${SWORD_PATHS}</g>`
    : ""
  return `<svg viewBox="0 0 44 44" aria-hidden="true"><g fill="${color}">${APP_MARK_SHAPES[shape]}</g>${inset}</svg>`
}

// The board's seats row by row, empty cells dropped (the app's strip centers each row).
function seatRows(game: DemoGame): SeatPlacement[][] {
  return phoneRows(game).rows.map((row) => row.seats.flatMap((placement) => placement ?? []))
}

// `taken[source]` is the damage this seat has taken from each player's commander.
function commanderStrip(
  game: DemoGame,
  rows: readonly (readonly SeatPlacement[])[],
  owner: SeatPlacement,
  taken: readonly number[],
): string {
  const cells = rows
    .map((row) => {
      const discs = row.map(({ seat }) => {
        const shape = seatShape(seat)
        if (seat === owner.seat)
          return `<span class="cmd-cell own">${appMarkSvg(shape, "#fff")}</span>`
        const total = taken[seat] ?? 0
        const color = seatColor(seat)
        const ink = accessibleForeground(color)
        const content = total > 0 ? `<b>${total}</b>` : appMarkSvg(shape, ink)
        return `<span class="cmd-cell${total > 0 ? "" : " idle"}" style="--cell:${color};--ink:${ink}">${content}</span>`
      })
      return `<span class="cmd-row">${discs.join("")}</span>`
    })
    .join("")
  const from = taken
    .flatMap((total, seat) => (total > 0 ? `${total} from ${game.setup.names[seat]}` : []))
    .join(", ")
  const span = Math.max(rows.length, ...rows.map((row) => row.length))
  return `<span class="cmd-strip" role="img" aria-label="Commander damage taken: ${from}" data-rotation="${owner.rotation}" style="--rot:${owner.rotation}deg;--span:${span}">${cells}</span>`
}

// Assign mode on the player who is dealing damage: a black card with their mark and "Done".
function commanderSource(source: SeatPlacement): string {
  const mark = appMarkSvg(seatShape(source.seat), seatColor(source.seat), "#000")
  return `<div class="cmd-overlay cmd-source" aria-hidden="true"><span class="cmd-done">${mark}<b>Done</b></span></div>`
}

// Assign mode on an opponent: minus and plus zones, the attacker's mark beside the running
// total, and the seat's life under it.
function commanderTarget(game: DemoGame, source: SeatPlacement, target: SeatPlacement): string {
  const mark = appMarkSvg(
    seatShape(source.seat),
    accessibleForeground(seatColor(source.seat)),
    seatColor(source.seat),
  )
  return `<div class="cmd-overlay cmd-target" aria-hidden="true">
    <span class="cmd-zone">−</span><span class="cmd-zone" data-plus><span class="cmd-plus">+</span></span>
    <span class="cmd-summary"><span class="cmd-count">
      <span class="cmd-attacker" style="--attacker:${seatColor(source.seat)}">${mark}</span>
      <b class="cmd-total">0</b>
      <span class="cmd-life">${game.life[target.seat] ?? 0} life</span>
    </span></span>
  </div>`
}

const COMMANDER_DEMO_START_MS = 700
const COMMANDER_DEMO_TAP_MS = 300
const COMMANDER_DEMO_PAUSE_MS = 650
const COMMANDER_DEMO_FADE_MS = 450

export interface CommanderDemoOptions {
  // Damage dealt to each successive opponent, in the order the demo deals it.
  damage: readonly number[]
  reducedMotion: MediaQueryList
}

// Plays the commander damage sequence on `board` while armed with `start()`, and puts the
// board back with `stop()`. It layers markup over the board's seats instead of re-rendering,
// so everything can fade. It replays whenever the game resets (the pickers change the board),
// and hands back the life it took so replaying always starts from the same board. The visitor's
// own tap ends assign mode where it stands, with the damage dealt so far on each seat's strip.
export function createCommanderDemo(
  board: HTMLElement,
  game: DemoGame,
  { damage, reducedMotion }: CommanderDemoOptions,
) {
  let active = false
  const owed = new Map<number, number>()
  // Leaves assign mode with the damage dealt so far, while a run is still in it.
  let finish: (() => void) | undefined
  const script = createDemoScript(board, {
    onHalt() {
      finish?.()
      finish = undefined
    },
  })
  const later = script.later
  const layers = () => board.querySelectorAll<HTMLElement>(".cmd-overlay, .cmd-strip")
  const seatEl = (seat: number) => board.querySelector<HTMLElement>(`.seat[data-player="${seat}"]`)

  // Mounts markup hidden, then fades it in on the next style flush.
  function mount(seat: number, html: string, parent: "seat" | "inner") {
    const seatNode = seatEl(seat)
    const host = parent === "seat" ? seatNode : seatNode?.querySelector<HTMLElement>(".seat-in")
    host?.insertAdjacentHTML("beforeend", html)
    const el = host?.lastElementChild
    if (!(el instanceof HTMLElement)) return null
    void el.offsetWidth
    return el
  }
  function fadeOut(el: Element) {
    el.classList.remove("on")
    later(COMMANDER_DEMO_FADE_MS, () => el.remove())
  }

  // Hands one point of the demo's damage back, so a replay starts from the same board.
  function giveBack(): boolean {
    for (const [seat, count] of owed) {
      game.change(seat, 1)
      if (count > 1) owed.set(seat, count - 1)
      else owed.delete(seat)
      break
    }
    return owed.size > 0
  }
  function play() {
    script.start()
    finish = undefined
    layers().forEach((el) => el.remove())
    while (owed.size > 0) giveBack()
    const rows = seatRows(game)
    const seats = rows.flat()
    const count = game.setup.names.length
    const source = seats.filter(({ rotation }) => rotation === 0).at(-1) ?? seats.at(-1)
    if (!active || game.setup.system !== "mtg" || !source) return script.end()

    // Opponents in seat order starting after the source, so the damage lands across the board.
    const targets = Array.from(
      { length: count - 1 },
      (_, offset) => (source.seat + 1 + offset) % count,
    )
      .slice(0, damage.length)
      .flatMap((seat) => seats.find((placement) => placement.seat === seat) ?? [])
    const taken = new Map(targets.map(({ seat }) => [seat, 0]))

    function deal(seat: number) {
      const before = game.life[seat] ?? 0
      game.change(seat, -1)
      if ((game.life[seat] ?? 0) === before) return false
      owed.set(seat, (owed.get(seat) ?? 0) + 1)
      taken.set(seat, (taken.get(seat) ?? 0) + 1)
      return true
    }
    function showStrips() {
      targets.forEach((target) => {
        const total = taken.get(target.seat) ?? 0
        if (total === 0) return
        const received = Array.from({ length: count }, (_, from) =>
          from === source?.seat ? total : 0,
        )
        mount(target.seat, commanderStrip(game, rows, target, received), "seat")?.classList.add(
          "on",
        )
      })
    }

    if (reducedMotion.matches) {
      targets.forEach(({ seat }, index) => {
        for (let tap = 0; tap < (damage[index] ?? 0); tap++) deal(seat)
      })
      showStrips()
      return script.end()
    }

    const overlays = [
      mount(source.seat, commanderSource(source), "inner"),
      ...targets.map((target) =>
        mount(target.seat, commanderTarget(game, source, target), "inner"),
      ),
    ]
    finish = () => {
      overlays.forEach((el) => el && fadeOut(el))
      showStrips()
    }
    // The hand taps the attacker's mark to start assigning, as in the app, taps + on each
    // opponent for their damage, then taps Done. Each step lands on one of its presses.
    const hint = (at: number, target: Element | null | undefined, presses = 1) =>
      later(at - HINT_PRESS_MS, () => {
        if (target) showTapHint(target, { presses, every: COMMANDER_DEMO_TAP_MS })
      })
    let at = COMMANDER_DEMO_START_MS
    hint(at, seatEl(source.seat)?.querySelector(".who svg"))
    later(at, () => overlays.forEach((el) => el?.classList.add("on")))
    // Let viewers read assignment mode before the first damage tap.
    at += COMMANDER_DEMO_FADE_MS + COMMANDER_DEMO_PAUSE_MS
    targets.forEach((target, index) => {
      const overlay = overlays[index + 1]
      const total = overlay?.querySelector<HTMLElement>(".cmd-total")
      const life = overlay?.querySelector<HTMLElement>(".cmd-life")
      const plus = overlay?.querySelector<HTMLElement>("[data-plus]")
      hint(at, plus?.querySelector(".cmd-plus"), damage[index])
      for (let tap = 0; tap < (damage[index] ?? 0); tap++) {
        later(at, () => {
          if (!deal(target.seat)) return
          if (total) total.textContent = String(taken.get(target.seat))
          if (life) life.textContent = `${game.life[target.seat] ?? 0} life`
          plus?.classList.add("pressed")
          later(COMMANDER_DEMO_TAP_MS * 0.7, () => plus?.classList.remove("pressed"))
        })
        at += COMMANDER_DEMO_TAP_MS
      }
      at += COMMANDER_DEMO_PAUSE_MS
    })
    hint(at, overlays[0]?.querySelector(".cmd-done svg"))
    later(at, () => overlays[0]?.classList.add("pressed"))
    at += COMMANDER_DEMO_TAP_MS * 1.5
    later(at, () => {
      script.end()
      finish?.()
      finish = undefined
    })
  }

  // A reset re-renders the board, which drops the layers and returns the life.
  game.subscribe((event) => {
    if (event.type !== "reset") return
    script.cancel()
    finish = undefined
    owed.clear()
    if (active) later(0, play)
  })

  return {
    start() {
      active = true
      play()
    },
    stop() {
      active = false
      script.cancel()
      finish = undefined
      layers().forEach(fadeOut)
    },
  }
}

function seatName(game: DemoGame, seat: number) {
  return game.setup.names[seat] ?? `Player ${seat + 1}`
}

function seatInnerHtml(game: DemoGame, seat: number, interactive: boolean) {
  const value = game.life[seat] ?? 0
  const name = seatName(game, seat)
  const controls = interactive
    ? `<button class="hit minus" data-seat="${seat}" data-dir="-1" aria-label="${name}, minus"></button><button class="hit plus" data-seat="${seat}" data-dir="1" aria-label="${name}, plus"></button>`
    : ""
  return `<span class="glyph minus" data-glyph="${seat}:-1">−</span>
      <span class="center"><span class="life" data-life="${seat}" data-digits="${String(value).length}">${value}</span></span>
      <span class="glyph plus" data-glyph="${seat}:1">+</span>
      <span class="who">${markSvg(seatShape(seat), "#fff")}<span>${name}</span></span>
      ${controls}`
}

export function mountBoard(el: HTMLElement, game: DemoGame, { interactive = true } = {}) {
  const recent = new Map<number, { total: number; timer: number }>()
  const placements = new Map<number, SeatPlacement>()
  const pokemon = createPokemonSeats(game, (seat) => renderSeat(seat))
  const calculators = createCalculators(el, game)
  const isPokemon = () => game.setup.system === "pokemon"
  // The board is the app's 390 point wide screen, scaled, so the calculator can size in points.
  new ResizeObserver(() => el.style.setProperty("--app-pt", `${el.offsetWidth / 390}px`)).observe(
    el,
  )

  function pokemonHtml(placement: SeatPlacement) {
    return pokemon.html({
      ...placement,
      name: seatName(game, placement.seat),
      mark: croppedMarkSvg(seatShape(placement.seat), "#fff"),
    })
  }

  function seatHtml(placement: SeatPlacement) {
    const { seat, rotation } = placement
    const inner = isPokemon() ? pokemonHtml(placement) : seatInnerHtml(game, seat, interactive)
    const calculator =
      interactive && !isPokemon() && hasCalculator(game.setup.system)
        ? calculators.html({ ...placement, name: seatName(game, seat), color: seatColor(seat) })
        : ""
    return `<div class="seat${isPokemon() ? " pk-seat" : ""}" data-player="${seat}" data-rotation="${rotation}" style="--seat:${seatColor(seat)}"${interactive ? "" : " inert"}>
    <div class="seat-in">${inner}${calculator}</div>
  </div>`
  }

  function render() {
    const { rows, menu } = phoneRows(game)
    placements.clear()
    rows.forEach((row) =>
      row.seats.forEach((placement) => placement && placements.set(placement.seat, placement)),
    )
    el.classList.add("board")
    el.innerHTML =
      rows
        .map(
          (row) =>
            `<div class="board-row" style="flex:${row.flex}">${row.seats
              .map((placement) =>
                placement ? seatHtml(placement) : '<div class="seat empty"></div>',
              )
              .join("")}</div>`,
        )
        .join("") +
      `<span class="pentagon" style="left:${menu.x * 100}%;top:${menu.y * 100}%" aria-hidden="true">${pentagonSvg()}</span>`
  }

  // Redraws one Pokémon seat, keeping keyboard focus on the same control.
  function renderSeat(seat: number) {
    const placement = placements.get(seat)
    const inner = el.querySelector<HTMLElement>(`.seat[data-player="${seat}"] .seat-in`)
    if (!placement || !inner || !isPokemon()) return
    const focused = inner.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset
      : undefined
    inner.innerHTML = pokemonHtml(placement)
    fitDeltas(inner)
    if (!focused?.pk) return
    const id = focused.id ? `[data-id="${focused.id}"]` : ""
    const dir = focused.dir ? `[data-dir="${focused.dir}"]` : ""
    inner
      .querySelector<HTMLElement>(`[data-pk="${focused.pk}"]${id}${dir}`)
      ?.focus({ preventScroll: true })
  }

  // Like the app's LifeControls: the running change replaces the glyph on its side.
  function showGlyphs(seat: number, total: number) {
    for (const direction of [-1, 1] as const) {
      const glyph = el.querySelector<HTMLElement>(`[data-glyph="${seat}:${direction}"]`)
      if (!glyph) continue
      const showing = direction * total > 0
      glyph.textContent = showing
        ? `${total > 0 ? "+" : "−"}${Math.abs(total)}`
        : direction > 0
          ? "+"
          : "−"
      glyph.classList.toggle("delta", showing)
    }
    const inner = el.querySelector(`.seat[data-player="${seat}"] .seat-in`)
    if (inner) fitDeltas(inner)
  }

  function showChange(seat: number, delta: number) {
    if (isPokemon()) return renderSeat(seat)
    calculators.onChange(seat)
    const life = el.querySelector<HTMLElement>(`[data-life="${seat}"]`)
    if (!life) return
    const value = String(game.life[seat] ?? 0)
    life.textContent = value
    life.dataset.digits = String(value.length)
    const pending = recent.get(seat)
    if (pending) window.clearTimeout(pending.timer)
    const total = (pending?.total ?? 0) + delta
    showGlyphs(seat, total)
    recent.set(seat, {
      total,
      timer: window.setTimeout(() => {
        recent.delete(seat)
        showGlyphs(seat, 0)
      }, DELTA_VISIBLE_MS),
    })
  }

  el.addEventListener("click", (event) => {
    const target = event.target as Element
    const control = target.closest<HTMLElement>("[data-pk]")
    if (control) return pokemon.click(control)
    const calculator = target.closest<HTMLElement>("[data-calc]")
    if (calculator) return calculators.click(calculator, event.isTrusted && event.detail === 0)
    const hit = target.closest<HTMLElement>(".hit")
    if (!hit) return
    game.change(Number(hit.dataset.seat), hit.dataset.dir === "1" ? 1 : -1)
  })
  // Escape closes a calculator before the page's own Escape handling sees it.
  el.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      event.target instanceof Element &&
      calculators.escape(event.target)
    )
      event.stopPropagation()
  })
  game.subscribe((event) => {
    if (event.type === "change") return showChange(event.seat, event.delta)
    if (event.type === "table") return pokemon.onTable(event)
    recent.forEach(({ timer }) => window.clearTimeout(timer))
    recent.clear()
    pokemon.reset()
    calculators.reset()
    render()
  })
  render()
}
