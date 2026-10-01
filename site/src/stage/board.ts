import {
  getPlayerContentRotation,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  getPlayerGridRowFlex,
  getPlayerGridRows,
} from "@/components/playerGridGeometry"
import type { PlayerGridLayoutVariant } from "@/features/game/playerLayouts"
import { playSystemRules, type PlaySystemId } from "@/features/game/playSystems"

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
}

const PENTAGON =
  '<svg viewBox="0 0 100 96" aria-hidden="true"><path d="M50 4 95 37 78 91H22L5 37z" fill="#191015" stroke="#000" stroke-width="7" stroke-linejoin="round"/><path d="M36 44h28M36 55h28M36 66h28" stroke="#F4F2F1" stroke-width="5" stroke-linecap="round"/></svg>'

const DELTA_CHIP_MS = 1400

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
  // commanderDamage[target][source] = damage dealt by source's commander to target.
  commanderDamage?: readonly (readonly number[])[] | undefined
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

// "phone" follows the app's portrait grid exactly; "table" seats half the pod on each long
// edge of a wide screen, facing each other, for the desktop hero.
export type BoardShape = "phone" | "table"

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

function tableRows(game: DemoGame) {
  const seats = game.setup.names.map((_, seat) => seat)
  const facing = Math.ceil(seats.length / 2)
  return {
    menu: { x: 0.5, y: 0.5 },
    rows: [
      { flex: 1, seats: seats.slice(0, facing).map((seat) => ({ seat, rotation: 180 })) },
      { flex: 1, seats: seats.slice(facing).map((seat) => ({ seat, rotation: 0 })) },
    ],
  }
}

function commanderBadges(game: DemoGame, target: number): string {
  const damage = game.setup.commanderDamage?.[target]
  if (!damage) return ""
  const badges = game.setup.names
    .map((_, source) => {
      if (source === target) return ""
      const dealt = damage[source] ?? 0
      const lethal = dealt >= 21 ? " lethal" : ""
      const content = dealt > 0 ? String(dealt) : markSvg(seatShape(source), "#fff")
      return `<span class="badge${dealt > 0 ? " hit" : ""}${lethal}" style="--badge:${seatColor(source)}">${content}</span>`
    })
    .join("")
  return `<span class="badges">${badges}</span>`
}

function seatHtml(game: DemoGame, placement: SeatPlacement, interactive: boolean) {
  const { seat, rotation } = placement
  const value = game.life[seat] ?? 0
  const name = game.setup.names[seat] ?? `Player ${seat + 1}`
  const controls = interactive
    ? `<button class="hit minus" data-seat="${seat}" data-dir="-1" aria-label="${name}, minus"></button><button class="hit plus" data-seat="${seat}" data-dir="1" aria-label="${name}, plus"></button>`
    : ""
  return `<div class="seat" data-rotation="${rotation}" style="--seat:${seatColor(seat)}">
    <div class="seat-in">
      <span class="glyph">−</span>
      <span class="center"><span class="chip" data-chip="${seat}"></span><span class="life" data-life="${seat}" data-digits="${String(value).length}">${value}</span></span>
      <span class="glyph">+</span>
      <span class="who">${markSvg(seatShape(seat), "#fff")}<span>${name}</span></span>
      ${commanderBadges(game, seat)}
      ${controls}
    </div>
  </div>`
}

// Renders a live board into `el` and keeps it in sync with `game`. Returns a function
// that switches between the phone and table shapes.
export function mountBoard(
  el: HTMLElement,
  game: DemoGame,
  { shape: initialShape, interactive = true }: { shape: BoardShape; interactive?: boolean },
) {
  let shape = initialShape
  const chipTimers = new Map<number, { total: number; timer: number }>()

  function render() {
    const { rows, menu } = shape === "phone" ? phoneRows(game) : tableRows(game)
    el.classList.add("board")
    el.dataset.shape = shape
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
      `<button class="pentagon" style="left:${menu.x * 100}%;top:${menu.y * 100}%" aria-label="Game menu"${interactive ? "" : ' tabindex="-1"'}>${PENTAGON}</button>`
  }

  function showChange(seat: number, delta: number) {
    const life = el.querySelector<HTMLElement>(`[data-life="${seat}"]`)
    const chip = el.querySelector<HTMLElement>(`[data-chip="${seat}"]`)
    if (!life || !chip) return
    const value = String(game.life[seat] ?? 0)
    life.textContent = value
    life.dataset.digits = String(value.length)
    const pending = chipTimers.get(seat)
    if (pending) window.clearTimeout(pending.timer)
    const total = (pending?.total ?? 0) + delta
    chip.textContent = total > 0 ? `+${total}` : String(total)
    chip.classList.add("on")
    chipTimers.set(seat, {
      total,
      timer: window.setTimeout(() => {
        chip.classList.remove("on")
        chipTimers.delete(seat)
      }, DELTA_CHIP_MS),
    })
  }

  el.addEventListener("click", (event) => {
    const hit = (event.target as Element).closest<HTMLElement>(".hit")
    if (!hit) return
    game.change(Number(hit.dataset.seat), hit.dataset.dir === "1" ? 1 : -1)
  })
  game.subscribe((event) =>
    event.type === "reset" ? render() : showChange(event.seat, event.delta),
  )
  render()

  return (next: BoardShape) => {
    shape = next
    render()
  }
}
