import {
  getPlayerContentRotation,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  getPlayerGridRowFlex,
  getPlayerGridRows,
} from "@/components/playerGridGeometry"
import type { PlayerGridLayoutVariant } from "@/features/game/playerLayouts"
import { playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import { accessibleForeground } from "@/utils/colorContrast"

import {
  PLAYER_COLOR_CHOICES,
  PLAYER_MARK_SHAPES,
  type PlayerMarkShape,
} from "../../../convex/lib/appearance"

const SHAPE_PATHS: Record<PlayerMarkShape, string> = {
  circle: '<circle cx="12" cy="12" r="10"/>',
  triangle: '<path d="M12 2 22.5 21h-21z"/>',
  square: '<rect x="2.5" y="2.5" width="19" height="19" rx="2"/>',
  diamond: '<path d="M12 .8 23.2 12 12 23.2.8 12z"/>',
  star: '<path d="m12 1.5 3.1 6.9 7.4.7-5.6 5 1.7 7.4L12 17.6l-6.6 3.9 1.7-7.4-5.6-5 7.4-.7z"/>',
  hexagon: '<path d="M6.5 2h11l5.5 10-5.5 10h-11L1 12z"/>',
  plus: '<path d="M8.4 2h7.2v6.4H22v7.2h-6.4V22H8.4v-6.4H2V8.4h6.4z"/>',
  shield: '<path d="M12 2l8.6 3.6v7.1c0 4.3-3.6 7.1-8.6 10-5-2.9-8.6-5.7-8.6-10V5.6z"/>',
  heart:
    '<path transform="translate(-3.7 -3.7) scale(.714)" d="M22 36 10 24C2 16 8 6 16 10c3 1 5 4 6 6 1-2 3-5 6-6 8-4 14 6 6 14Z"/>',
}

// The game menu button, ported from the app's dark keystoneIIFlat shape
// (src/components/GameMenuButtonShape.tsx) and three-bar glyph (GameRadialMenu.tsx),
// which the app draws at 80px. Keep the geometry in sync with those files.
const PENTAGON_VIEWBOX = 100
const PENTAGON_RADIUS = 46
const PENTAGON_STROKE_WIDTH = 7
const PENTAGON_BORDER = "#000000"
const PENTAGON_FACE = { top: "#46434E", bottom: "#26242C" } as const
const PENTAGON_GLYPH = "#FFFFFF"
const PENTAGON_GLYPH_PX_PER_UNIT = 0.8

function regularPolygonPoints(radius: number): string {
  const center = PENTAGON_VIEWBOX / 2
  return Array.from({ length: 5 }, (_, corner) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * corner) / 5
    return `${(center + radius * Math.cos(angle)).toFixed(2)},${(center + radius * Math.sin(angle)).toFixed(2)}`
  }).join(" ")
}

const PENTAGON_POINTS = regularPolygonPoints(PENTAGON_RADIUS)
const PENTAGON_FACE_POINTS = regularPolygonPoints(PENTAGON_RADIUS - PENTAGON_STROKE_WIDTH / 2)

// The app's glyph is 16x2px bars spaced 5px apart; convert to viewBox units.
const GLYPH_BARS = [-5, 0, 5]
  .map((offsetPx) => {
    const unit = (px: number) => px / PENTAGON_GLYPH_PX_PER_UNIT
    const center = PENTAGON_VIEWBOX / 2
    return `<rect x="${center - unit(8)}" y="${center + unit(offsetPx) - unit(1)}" width="${unit(16)}" height="${unit(2)}" rx="${unit(1)}" fill="${PENTAGON_GLYPH}"/>`
  })
  .join("")

// Several boards share a page, so each pentagon's gradient gets its own id.
let pentagonCount = 0

function pentagonSvg(): string {
  const gradient = `pentagon-fill-${pentagonCount++}`
  return `<svg viewBox="0 0 ${PENTAGON_VIEWBOX} ${PENTAGON_VIEWBOX}" aria-hidden="true"><defs><linearGradient id="${gradient}" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="${PENTAGON_FACE.top}"/><stop offset="1" stop-color="${PENTAGON_FACE.bottom}"/></linearGradient></defs><polygon points="${PENTAGON_POINTS}" fill="url(#${gradient})" stroke="${PENTAGON_BORDER}" stroke-width="${PENTAGON_STROKE_WIDTH}" stroke-linejoin="round"/><polygon points="${PENTAGON_FACE_POINTS}" fill="none" stroke="${PENTAGON_BORDER}" stroke-opacity="0.22" stroke-width="1.4" stroke-linejoin="round"/>${GLYPH_BARS}</svg>`
}

// Matches the app (LifeCard DELTA_VISIBLE_MS): how long the running change shows in a glyph.
const DELTA_VISIBLE_MS = 1800

export function seatColor(seat: number): string {
  return PLAYER_COLOR_CHOICES[seat % PLAYER_COLOR_CHOICES.length] ?? PLAYER_COLOR_CHOICES[0]
}

export function seatShape(seat: number): PlayerMarkShape {
  return PLAYER_MARK_SHAPES[seat % PLAYER_MARK_SHAPES.length] ?? PLAYER_MARK_SHAPES[0]
}

export function markSvg(shape: PlayerMarkShape, fill = "currentColor"): string {
  return `<svg viewBox="0 0 24 24" fill="${fill}" aria-hidden="true">${SHAPE_PATHS[shape]}</svg>`
}

type GameEvent = { type: "change"; seat: number; delta: number } | { type: "reset" }

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

  function startingValues(next: DemoGameSetup) {
    return next.names.map((_, seat) => next.values?.[seat] ?? next.startingLife)
  }

  function emit(event: GameEvent) {
    listeners.forEach((listener) => listener(event))
  }

  return {
    get setup() {
      return setup
    },
    get life(): readonly number[] {
      return life
    },
    subscribe(listener: (event: GameEvent) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    change(seat: number, direction: 1 | -1) {
      const delta = direction * playSystemRules(setup.system).counter.tapStep
      const current = life[seat] ?? 0
      const next = Math.max(0, current + delta)
      if (next === current) return
      life = life.map((value, index) => (index === seat ? next : value))
      history.push({ seat, delta: next - current })
      emit({ type: "change", seat, delta: next - current })
    },
    undo() {
      const last = history.pop()
      if (!last) return
      life = life.map((value, index) => (index === last.seat ? value - last.delta : value))
      emit({ type: "change", seat: last.seat, delta: -last.delta })
    },
    reset(next: Partial<DemoGameSetup> = {}) {
      setup = { ...setup, ...next }
      life = startingValues(setup)
      history.length = 0
      emit({ type: "reset" })
    },
  }
}

type SeatPlacement = { seat: number; rotation: number; flex?: number }

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
                playerIndex: seat,
              }),
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
const APP_MARK_SHAPES: Record<PlayerMarkShape, string> = {
  circle: '<circle cx="22" cy="22" r="10"/>',
  triangle: '<polygon points="22,9 35,33 9,33"/>',
  square: '<rect x="12" y="12" width="20" height="20" rx="2"/>',
  diamond: '<polygon points="22,9 35,22 22,35 9,22"/>',
  star: '<path d="M22 8l4.2 8.5 9.4 1.4-6.8 6.6 1.6 9.3-8.4-4.4-8.4 4.4 1.6-9.3-6.8-6.6 9.4-1.4z"/>',
  hexagon: '<polygon points="22,8 34,15 34,29 22,36 10,29 10,15"/>',
  plus: '<path d="M17 8h10v9h9v10h-9v9H17v-9H8V17h9z"/>',
  shield: '<path d="M22 8l12 5v10c0 6-5 10-12 14-7-4-12-8-12-14V13z"/>',
  heart: '<path d="M22 36 10 24C2 16 8 6 16 10c3 1 5 4 6 6 1-2 3-5 6-6 8-4 14 6 6 14Z"/>',
}

// Where the sword sits inside each shape (PlayerMark's SWORD_INSET_THAT_FITS_SHAPE).
const SWORD_INSETS: Record<PlayerMarkShape, { centerY: number; size: number }> = {
  circle: { centerY: 22, size: 14 },
  square: { centerY: 22, size: 15 },
  diamond: { centerY: 22, size: 14 },
  hexagon: { centerY: 22, size: 16 },
  triangle: { centerY: 25, size: 13 },
  star: { centerY: 22, size: 12 },
  plus: { centerY: 22, size: 12 },
  shield: { centerY: 21, size: 15 },
  heart: { centerY: 22, size: 14 },
}

// The sword glyph from src/components/Sword.tsx, on a 24 unit box.
const SWORD_PATHS =
  '<path d="M12 2.5 14.1 6.4V14.4H9.9V6.4z"/><rect x="6.8" y="14.6" width="10.4" height="1.9" rx="0.9"/><rect x="11.05" y="16.9" width="1.9" height="4.6" rx="0.9"/>'

// A player's mark. `sword` cuts the sword into the shape, as the app does for the attacker.
function appMarkSvg(shape: PlayerMarkShape, color: string, sword?: string): string {
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
    <span class="cmd-zone">−</span><span class="cmd-zone" data-plus>+</span>
    <span class="cmd-summary"><span class="cmd-count">
      <span class="cmd-attacker" style="--attacker:${seatColor(source.seat)}">${mark}</span>
      <b class="cmd-total">0</b>
      <span class="cmd-life">${game.life[target.seat] ?? 0} life</span>
    </span></span>
  </div>`
}

const COMMANDER_DEMO_START_MS = 700
const COMMANDER_DEMO_TAP_MS = 240
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
// and hands back the life it took so replaying always starts from the same board.
export function createCommanderDemo(
  board: HTMLElement,
  game: DemoGame,
  { damage, reducedMotion }: CommanderDemoOptions,
) {
  let active = false
  const timers = new Set<number>()
  const owed = new Map<number, number>()

  const later = (ms: number, run: () => void) => {
    const id = window.setTimeout(() => {
      timers.delete(id)
      run()
    }, ms)
    timers.add(id)
  }
  const clearTimers = () => {
    timers.forEach((id) => window.clearTimeout(id))
    timers.clear()
  }
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

  // Hands the demo's damage back, one point at a time so the life counts up.
  function giveBack(): boolean {
    for (const [seat, count] of owed) {
      game.change(seat, 1)
      if (count > 1) owed.set(seat, count - 1)
      else owed.delete(seat)
      break
    }
    return owed.size > 0
  }
  function drain() {
    if (giveBack()) later(45, drain)
  }

  function play() {
    clearTimers()
    layers().forEach((el) => el.remove())
    while (owed.size > 0) giveBack()
    const rows = seatRows(game)
    const seats = rows.flat()
    const count = game.setup.names.length
    const source = seats.filter(({ rotation }) => rotation === 0).at(-1) ?? seats.at(-1)
    if (!active || game.setup.system !== "mtg" || !source) return

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
      return
    }

    const overlays = [
      mount(source.seat, commanderSource(source), "inner"),
      ...targets.map((target) =>
        mount(target.seat, commanderTarget(game, source, target), "inner"),
      ),
    ]
    let at = COMMANDER_DEMO_START_MS
    later(at, () => overlays.forEach((el) => el?.classList.add("on")))
    // Let viewers read assignment mode before the first damage tap.
    at += COMMANDER_DEMO_FADE_MS + COMMANDER_DEMO_PAUSE_MS
    targets.forEach((target, index) => {
      const overlay = overlays[index + 1]
      const total = overlay?.querySelector<HTMLElement>(".cmd-total")
      const life = overlay?.querySelector<HTMLElement>(".cmd-life")
      const plus = overlay?.querySelector<HTMLElement>("[data-plus]")
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
    later(at, () => overlays[0]?.classList.add("pressed"))
    at += COMMANDER_DEMO_TAP_MS * 1.5
    later(at, () => {
      overlays.forEach((el) => el && fadeOut(el))
      showStrips()
    })
  }

  // A reset re-renders the board, which drops the layers and returns the life.
  game.subscribe((event) => {
    if (event.type !== "reset") return
    clearTimers()
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
      clearTimers()
      layers().forEach(fadeOut)
      drain()
    },
  }
}

function seatHtml(game: DemoGame, placement: SeatPlacement, interactive: boolean) {
  const { seat, rotation } = placement
  const value = game.life[seat] ?? 0
  const name = game.setup.names[seat] ?? `Player ${seat + 1}`
  const controls = interactive
    ? `<button class="hit minus" data-seat="${seat}" data-dir="-1" aria-label="${name}, minus"></button><button class="hit plus" data-seat="${seat}" data-dir="1" aria-label="${name}, plus"></button>`
    : ""
  return `<div class="seat" data-player="${seat}" data-rotation="${rotation}" style="--seat:${seatColor(seat)}">
    <div class="seat-in">
      <span class="glyph minus" data-glyph="${seat}:-1">−</span>
      <span class="center"><span class="life" data-life="${seat}" data-digits="${String(value).length}">${value}</span></span>
      <span class="glyph plus" data-glyph="${seat}:1">+</span>
      <span class="who">${markSvg(seatShape(seat), "#fff")}<span>${name}</span></span>
      ${controls}
    </div>
  </div>`
}

export function mountBoard(el: HTMLElement, game: DemoGame, { interactive = true } = {}) {
  const recent = new Map<number, { total: number; timer: number }>()

  function render() {
    const { rows, menu } = phoneRows(game)
    el.classList.add("board")
    el.innerHTML =
      rows
        .map(
          (row) =>
            `<div class="board-row" style="flex:${row.flex}">${row.seats
              .map((placement) =>
                placement
                  ? seatHtml(game, placement, interactive)
                  : '<div class="seat empty"></div>',
              )
              .join("")}</div>`,
        )
        .join("") +
      `<span class="pentagon" style="left:${menu.x * 100}%;top:${menu.y * 100}%" aria-hidden="true">${pentagonSvg()}</span>`
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
  }

  function showChange(seat: number, delta: number) {
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
    const hit = (event.target as Element).closest<HTMLElement>(".hit")
    if (!hit) return
    game.change(Number(hit.dataset.seat), hit.dataset.dir === "1" ? 1 : -1)
  })
  game.subscribe((event) => {
    if (event.type === "change") return showChange(event.seat, event.delta)
    recent.forEach(({ timer }) => window.clearTimeout(timer))
    recent.clear()
    render()
  })
  render()
}
