// The demo board's Pokémon seat, ported from the app's PokemonSeatCard
// (src/components/pokemon/PokemonSeatCard.tsx). The table itself runs on the app's own reducer
// (convex/lib/table.ts) through DemoGame.act, so damage, knockouts, and prizes follow the app's
// rules. Keep the seat's layout and copy in sync with that file.

import {
  getCentralMenuBoundary,
  getFourCardMenuJunction,
  type getPlayerGridLayout,
} from "@/components/playerGridGeometry"
import { defaultStartingLife, playTableRules } from "@/features/game/playSystems"

import {
  findPokemon,
  pokemonBoardOf,
  pokemonPrizeValue,
  remainingHp,
  type PokemonCard,
  type PokemonInPlay,
  type PokemonKnockout,
  type PokemonSlot,
  type TableState,
} from "../../../convex/lib/table"
import type { DemoGame } from "./board"
import { HINT_PRESS_MS, showTapHint } from "./hint"

const RULES = playTableRules("pokemon").pokemon ?? { benchSize: 5, damageStep: 10 }
// PokemonSeatCard's FOCUS_MS and KNOCKOUT_TOAST_MS, and LifeCard's DELTA_VISIBLE_MS.
const FOCUS_MS = 3_000
const KNOCKOUT_TOAST_MS = 6_000
const DELTA_VISIBLE_MS = 1_800
const STANDARD_PRIZES = 6
// The pentagon is 17% of the board's width (site.css .pentagon), and the app clears 44 of its
// 80px, so a bench next to it moves aside by 0.55 of the pentagon.
const PENTAGON_SHARE = 0.17
const MENU_CLEARANCE = 0.55

let idCount = 0
// The reducer checks id formats: 8+ characters for a Pokémon, 16+ for an operation.
export const demoId = (prefix: string) => `${prefix}-${String(++idCount).padStart(16, "0")}`
export const playerIdOf = (seat: number) => `seat-${seat}`
export const seatOf = (playerId: string) => Number(playerId.slice("seat-".length))

const card = (name: string, hp: number): PokemonCard => ({
  name,
  hp,
  prizes: pokemonPrizeValue(name),
})
// Well-known Pokémon with their usual HP, one evolution line per seat.
const SAMPLE_DECKS: readonly (readonly PokemonCard[])[] = [
  [card("Charizard ex", 330), card("Charmander", 70), card("Charmeleon", 90), card("Vulpix", 60)],
  [card("Blastoise ex", 330), card("Squirtle", 60), card("Wartortle", 90), card("Psyduck", 70)],
  [card("Pikachu ex", 200), card("Pikachu", 60), card("Voltorb", 60), card("Magnemite", 60)],
  [card("Venusaur ex", 340), card("Bulbasaur", 70), card("Ivysaur", 100), card("Oddish", 60)],
  [card("Gengar ex", 310), card("Gastly", 60), card("Haunter", 80), card("Abra", 50)],
  [card("Dragonite ex", 330), card("Dratini", 70), card("Dragonair", 90), card("Snorlax", 150)],
]
// Damage on each seat's Active (its deck's first card), then on its bench, in deck order.
// Maya's first bench Pokémon is two hits from a knockout for the tour's demo.
const SAMPLE_DAMAGE: readonly (readonly number[])[] = [
  [120, 50, 30],
  [60, 20, 0],
  [0, 0, 40],
  [90, 0],
  [30, 50, 0],
  [150, 0],
]
export const SAMPLE_PRIZES = [3, 4, 5, 6, 4, 5] as const

const deckOf = (seat: number) => SAMPLE_DECKS[seat % SAMPLE_DECKS.length] ?? []

export function sampleTable(count: number): TableState {
  const players = Array.from({ length: count }, (_, seat) => {
    const damage = SAMPLE_DAMAGE[seat % SAMPLE_DAMAGE.length] ?? []
    const [active, ...bench] = damage.flatMap((taken, index) => {
      const sample = deckOf(seat)[index]
      return sample ? [{ ...sample, id: demoId("pokemon"), damage: taken }] : []
    })
    return [playerIdOf(seat), { pokemon: { ...(active ? { active } : {}), bench } }] as const
  })
  return { designations: {}, players: Object.fromEntries(players) }
}

type Edge = "top" | "right" | "bottom" | "left"
type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight"
export type MenuSpot = { corner?: Corner; edgeCenter?: Edge }

// PlayerGrid's menuCornerAt and fallbackMenuAt: where the game menu touches a seat, if it does.
export function menuSpotAt(
  rows: (number | null)[][],
  layout: ReturnType<typeof getPlayerGridLayout>,
  row: number,
  column: number,
): MenuSpot | undefined {
  const junction = getFourCardMenuJunction(rows)
  if (junction) {
    const upper = row === junction.boundary - 1
    if (!upper && row !== junction.boundary) return undefined
    if (column === junction.column - 1) return { corner: upper ? "bottomRight" : "topRight" }
    if (column === junction.column) return { corner: upper ? "bottomLeft" : "topLeft" }
    return undefined
  }
  if (rows.length === 1 && rows[0]?.length === 2)
    return row === 0 ? { edgeCenter: column === 0 ? "right" : "left" } : undefined
  if (rows.length === 1) return undefined
  const boundary = getCentralMenuBoundary(rows, layout)
  if (row !== boundary - 1 && row !== boundary) return undefined
  const upper = row === boundary - 1
  const count = rows[row]?.length ?? 0
  const middle = Math.floor(count / 2)
  if (count % 2) return column === middle ? { edgeCenter: upper ? "bottom" : "top" } : undefined
  if (column === middle - 1) return { corner: upper ? "bottomRight" : "topRight" }
  if (column === middle) return { corner: upper ? "bottomLeft" : "topLeft" }
  return undefined
}

// Which screen edge each of the seat content's own edges lands on (pokemonCardLayout.ts).
const CONTENT_EDGES: Record<number, Record<Edge, Edge>> = {
  0: { top: "top", right: "right", bottom: "bottom", left: "left" },
  90: { top: "right", right: "bottom", bottom: "left", left: "top" },
  [-90]: { top: "left", right: "top", bottom: "right", left: "bottom" },
  180: { top: "bottom", right: "left", bottom: "top", left: "right" },
}

// pokemonCardLayout's benchMenuClearance: the bench sits on the inner edge, so it steps aside
// from the pentagon when the pentagon touches that edge.
function benchClearance(rotation: number, spot: MenuSpot | undefined) {
  const edges = CONTENT_EDGES[rotation] ?? CONTENT_EDGES[0]
  if (!edges || !spot) return undefined
  if (spot.edgeCenter === edges.top) return "top"
  const corner = spot.corner?.toLowerCase()
  if (!corner?.includes(edges.top)) return undefined
  return corner.includes(edges.left) ? "left" : "right"
}

export interface PokemonSeatContext {
  seat: number
  rotation: number
  menu?: MenuSpot
  // Seats in this seat's row. The pentagon is sized to the board, so this converts it to seat units.
  rowLength: number
  name: string
  mark: string
}

export type PokemonTableEvent = {
  seat: number
  damage?: { pokemonId: string; delta: number }
  knockout?: PokemonKnockout
}

const pokemonName = (pokemon: Pick<PokemonInPlay, "name">) => pokemon.name?.trim() || "Pokémon"
const prizeWord = (count: number) => `${count} ${count === 1 ? "prize" : "prizes"}`

// A per-seat value that clears itself, and redraws its seat, `ms` after it was last set.
function timedBySeat<T>(ms: number, refresh: (seat: number) => void) {
  const values = new Map<number, { value: T; timer: number }>()
  const remove = (seat: number) => {
    window.clearTimeout(values.get(seat)?.timer)
    values.delete(seat)
  }
  return {
    get: (seat: number) => values.get(seat)?.value,
    set(seat: number, value: T) {
      remove(seat)
      const timer = window.setTimeout(() => {
        values.delete(seat)
        refresh(seat)
      }, ms)
      values.set(seat, { value, timer })
    },
    delete: remove,
    clear: () => [...values.keys()].forEach(remove),
  }
}

// A board's Pokémon seats. Bench focus, the knockout ask and toast, and the place sheet are this
// board's own, as they are each device's own in the app. `refresh` redraws one seat.
export function createPokemonSeats(game: DemoGame, refresh: (seat: number) => void) {
  const focus = timedBySeat<string>(FOCUS_MS, refresh)
  // Like LifeControls: the running damage change replaces the glyph on its side for a moment.
  const recent = timedBySeat<{ pokemonId: string; total: number }>(DELTA_VISIBLE_MS, refresh)
  const toasts = timedBySeat<PokemonKnockout>(KNOCKOUT_TOAST_MS, refresh)
  const asks = new Map<number, { pokemonId: string; delta: number }>()
  const sheets = new Map<number, PokemonSlot>()

  const boardOf = (seat: number) => pokemonBoardOf(game.table, playerIdOf(seat))
  const nameOf = (seat: number) => game.setup.names[seat] ?? `Player ${seat + 1}`
  const opponents = (seat: number) =>
    game.setup.names.flatMap((_, other) => (other === seat ? [] : [other]))

  function damage(seat: number, pokemonId: string, delta: number, taker?: number) {
    const found = findPokemon(boardOf(seat), pokemonId)
    if (!found) return
    const others = opponents(seat)
    const lethal = delta > 0 && found.pokemon.damage + delta >= found.pokemon.hp
    if (lethal && others.length > 1 && taker === undefined) {
      sheets.delete(seat)
      asks.set(seat, { pokemonId, delta })
      return refresh(seat)
    }
    // tableRuntime's takerFor: with one opponent, they take the prizes.
    const takerSeat = taker ?? (others.length === 1 ? others[0] : undefined)
    game.act({
      kind: "pokemon.damaged",
      playerId: playerIdOf(seat),
      pokemonId,
      delta,
      ...(takerSeat === undefined ? {} : { takerPlayerId: playerIdOf(takerSeat) }),
    })
    if (focus.get(seat) === pokemonId && findPokemon(boardOf(seat), pokemonId))
      focus.set(seat, pokemonId)
  }

  function pressBench(seat: number, pokemonId: string) {
    if (!boardOf(seat).active)
      return game.act({ kind: "pokemon.switched", playerId: playerIdOf(seat), pokemonId })
    focus.set(seat, pokemonId)
    refresh(seat)
  }

  function onTable({ seat, damage: changed, knockout }: PokemonTableEvent) {
    if (changed) {
      const running = recent.get(seat)
      const total = (running?.pokemonId === changed.pokemonId ? running.total : 0) + changed.delta
      recent.set(seat, { pokemonId: changed.pokemonId, total })
    }
    if (knockout) {
      asks.delete(seat)
      toasts.set(seat, knockout)
    }
    if (!findPokemon(boardOf(seat), focus.get(seat) ?? "")) focus.delete(seat)
    refresh(seat)
  }

  function click(button: HTMLElement) {
    const seat = Number(button.dataset.seat)
    const id = button.dataset.id ?? ""
    const playerId = playerIdOf(seat)
    switch (button.dataset.pk) {
      case "damage":
        return damage(seat, id, -Number(button.dataset.dir) * RULES.damageStep)
      case "bench":
        return pressBench(seat, id)
      case "switch":
        focus.delete(seat)
        return game.act({ kind: "pokemon.switched", playerId, pokemonId: id })
      case "prize":
        return game.change(seat, -1)
      case "place":
        sheets.set(seat, button.dataset.slot === "bench" ? "bench" : "active")
        return refresh(seat)
      case "card": {
        const slot = sheets.get(seat)
        const picked = deckOf(seat)[Number(button.dataset.value)]
        if (!slot || !picked) return
        sheets.delete(seat)
        if (
          !game.act({
            kind: "pokemon.placed",
            playerId,
            pokemonId: demoId("pokemon"),
            slot,
            card: picked,
          })
        )
          refresh(seat)
        return
      }
      case "close":
        sheets.delete(seat)
        return refresh(seat)
      case "taker": {
        const ask = asks.get(seat)
        asks.delete(seat)
        if (ask) damage(seat, ask.pokemonId, ask.delta, Number(button.dataset.value))
        return
      }
      case "cancel":
        asks.delete(seat)
        return refresh(seat)
      case "undo": {
        const knockout = toasts.get(seat)
        toasts.delete(seat)
        if (knockout)
          game.act({
            kind: "pokemon.knockoutUndone",
            playerId,
            knockoutOperationId: knockout.operationId,
          })
        return refresh(seat)
      }
    }
  }

  function knockoutMessage(knockout: PokemonKnockout) {
    const head = `${pokemonName(knockout.pokemon)} knocked out.`
    if (knockout.takerPlayerId === undefined || knockout.prizesTaken === 0) return head
    return `${head} ${nameOf(seatOf(knockout.takerPlayerId))} takes ${prizeWord(knockout.prizesTaken)}.`
  }

  function chipHtml(seat: number, pokemon: PokemonInPlay, focused: boolean) {
    const remaining = remainingHp(pokemon)
    const name = pokemonName(pokemon)
    return `<button class="pk-chip" type="button" data-pk="bench" data-seat="${seat}" data-id="${pokemon.id}" aria-pressed="${focused}" aria-label="Bench, ${name}, ${remaining} of ${pokemon.hp} HP">
      <span class="pk-chip-name">${name}</span><b>${remaining}</b>
      <span class="pk-chip-pips">${"<i></i>".repeat(pokemon.prizes)}</span>
      <span class="pk-chip-bar" style="width:${Math.round((100 * remaining) / pokemon.hp)}%"></span>
    </button>`
  }

  function benchHtml(seat: number, bench: readonly PokemonInPlay[], focusedId?: string) {
    return Array.from({ length: Math.max(RULES.benchSize, bench.length) }, (_, index) => {
      const pokemon = bench[index]
      if (pokemon) return chipHtml(seat, pokemon, pokemon.id === focusedId)
      if (index === bench.length)
        return `<button class="pk-slot pk-add" type="button" data-pk="place" data-slot="bench" data-seat="${seat}" aria-label="${nameOf(seat)}, add a bench Pokémon">+</button>`
      return '<span class="pk-slot"></span>'
    }).join("")
  }

  function heroHtml(seat: number, pokemon: PokemonInPlay, onBench: boolean) {
    const name = pokemonName(pokemon)
    const remaining = remainingHp(pokemon)
    const running = recent.get(seat)
    // The running change is damage; the glyphs show what it did to HP.
    const total = running?.pokemonId === pokemon.id ? -running.total : 0
    const glyph = (direction: 1 | -1) => {
      const showing = direction * total > 0
      const text = showing
        ? `${total > 0 ? "+" : "−"}${Math.abs(total)}`
        : direction > 0
          ? "+"
          : "−"
      return `<span class="glyph ${direction > 0 ? "plus" : "minus"}${showing ? " delta" : ""}" data-glyph="${seat}:${direction}">${text}</span>`
    }
    const label = `${nameOf(seat)}, ${onBench ? `Bench, ${name}` : name}`
    return `<div class="pk-hero">
      ${glyph(-1)}
      <span class="pk-readout">
        <span class="pk-hp" aria-label="${label}, ${remaining} HP left of ${pokemon.hp}">${remaining}</span>
        <span class="pk-caption">${onBench ? "<em>Bench</em>" : ""}<b>${name}</b><span>${pokemon.damage} damage · ${pokemon.hp} HP</span>${
          onBench
            ? `<button class="pk-switch" type="button" data-pk="switch" data-seat="${seat}" data-id="${pokemon.id}" aria-label="Switch in, ${name} becomes Active">Switch in</button>`
            : ""
        }</span>
        ${onBench ? '<span class="pk-drain"></span>' : ""}
      </span>
      ${glyph(1)}
      <button class="hit minus" type="button" data-pk="damage" data-seat="${seat}" data-id="${pokemon.id}" data-dir="-1" aria-label="${label}, add ${RULES.damageStep} damage"></button>
      <button class="hit plus" type="button" data-pk="damage" data-seat="${seat}" data-id="${pokemon.id}" data-dir="1" aria-label="${label}, heal ${RULES.damageStep}"></button>
    </div>`
  }

  function prizesHtml(seat: number) {
    const prizes = game.life[seat] ?? 0
    const pips = Array.from(
      { length: Math.max(STANDARD_PRIZES, prizes) },
      (_, index) => `<i${index < prizes ? "" : ' class="gone"'}></i>`,
    ).join("")
    return `<button class="pk-prizes" type="button" data-pk="prize" data-seat="${seat}" aria-label="${nameOf(seat)}, ${prizes} Prize ${prizes === 1 ? "card" : "cards"}. Take one."><span class="pk-pips">${pips}</span></button>`
  }

  function barHtml(seat: number) {
    const board = boardOf(seat)
    const ask = asks.get(seat)
    const asking = ask && findPokemon(board, ask.pokemonId)?.pokemon
    if (asking)
      return `<div class="pk-bar" role="group" aria-label="Who takes the prizes">
        <span>${pokemonName(asking)} knocked out. Who takes ${prizeWord(asking.prizes)}?</span>
        <span class="pk-bar-actions">${opponents(seat)
          .map(
            (other) =>
              `<button type="button" data-pk="taker" data-seat="${seat}" data-value="${other}">${nameOf(other)}</button>`,
          )
          .join(
            "",
          )}<button class="ghost" type="button" data-pk="cancel" data-seat="${seat}">Cancel</button></span>
      </div>`
    const knockout = toasts.get(seat)
    if (!knockout || board.lastKnockout?.operationId !== knockout.operationId) return ""
    const undoLands =
      (knockout.slot === "active" && !board.active) || board.bench.length < RULES.benchSize
    return `<div class="pk-bar pk-toast" role="status"><span>${knockoutMessage(knockout)}</span>${
      undoLands
        ? `<button type="button" data-pk="undo" data-seat="${seat}" aria-label="Undo, ${pokemonName(knockout.pokemon)} returns">Undo</button>`
        : "<small>No room to undo</small>"
    }</div>`
  }

  function sheetHtml(seat: number) {
    const slot = sheets.get(seat)
    if (!slot) return ""
    const title = slot === "active" ? "Place Active" : "Add to bench"
    const rows = deckOf(seat)
      .map(
        (pokemon, index) =>
          `<button type="button" data-pk="card" data-seat="${seat}" data-value="${index}"><span>${pokemonName(pokemon)}</span><em>${pokemon.hp} HP</em></button>`,
      )
      .join("")
    return `<div class="pk-sheet" role="dialog" aria-label="${title}">
      <div class="pk-sheet-head"><b>${title}</b><button type="button" data-pk="close" data-seat="${seat}">Cancel</button></div>
      <span class="pk-sheet-label">${nameOf(seat)}'s deck</span>
      <div class="pk-sheet-list">${rows}</div>
    </div>`
  }

  // The inside of one Pokémon seat: bench on the inner edge, the shown Pokémon's HP in the
  // middle, and the seat's mark and prizes along the outer edge.
  function html(context: PokemonSeatContext) {
    const { seat } = context
    const board = boardOf(seat)
    const focusedId = focus.get(seat)
    const focused = board.bench.find(({ id }) => id === focusedId)
    const shown = focused ?? board.active
    const clear = benchClearance(context.rotation, context.menu)
    const clearance = clear
      ? ` data-clear="${clear}" style="--clear:${(PENTAGON_SHARE * MENU_CLEARANCE * context.rowLength * 100).toFixed(1)}cqw"`
      : ""
    const hint = board.bench.length ? "<small>or tap a bench Pokémon</small>" : ""
    return `<div class="pk"${clearance}>
      <div class="pk-bench" role="group" aria-label="${context.name}, bench, ${board.bench.length} of ${RULES.benchSize}">${benchHtml(seat, board.bench, focused?.id)}</div>
      ${
        shown
          ? heroHtml(seat, shown, Boolean(focused))
          : `<button class="pk-place" type="button" data-pk="place" data-slot="active" data-seat="${seat}">Place Active${hint}</button>`
      }
      <div class="pk-foot"><span class="who">${context.mark}<span>${context.name}</span></span>${prizesHtml(seat)}</div>
      ${barHtml(seat)}
      ${sheetHtml(seat)}
    </div>`
  }

  function reset() {
    for (const map of [focus, recent, toasts, asks, sheets]) map.clear()
  }

  return { html, click, onTable, reset }
}

const POKEMON_DEMO_START_MS = 700
const POKEMON_DEMO_TAP_MS = 420
const POKEMON_DEMO_PAUSE_MS = 900

const inSeat = (seat: number, selector: string) => `.seat[data-player="${seat}"] ${selector}`
const damageIn = (seat: number) => inSeat(seat, '[data-pk="damage"][data-dir="-1"]')
const firstBench = (seat: number) => inSeat(seat, '[data-pk="bench"]')

// The tour's Pokémon turn, on whatever seats the visitor's table has. It plays on Maya, the seat
// facing a phone on its side: she damages her Active, then taps a bench Pokémon and knocks it
// out. With more than one opponent she picks Devon to take the prize. Each tap clicks the real
// control, and a tap whose control isn't there (the visitor's own board may differ) does nothing.
const POKEMON_DEMO_SCRIPT = [
  { tap: damageIn(0), hint: inSeat(0, '[data-glyph="0:-1"]'), presses: 3 },
  { tap: firstBench(0), presses: 1 },
  { tap: damageIn(0), hint: inSeat(0, '[data-glyph="0:-1"]'), presses: 2 },
  { tap: inSeat(0, '[data-pk="taker"][data-value="1"]'), presses: 1 },
] as const

export interface PokemonDemoOptions {
  reducedMotion: MediaQueryList
}

// Plays the tour's Pokémon turn on `board`. A Pokémon table plays as it is; any other game turns
// into Pokémon on the same seats and layout first.
export function createPokemonDemo(
  board: HTMLElement,
  game: DemoGame,
  { reducedMotion }: PokemonDemoOptions,
) {
  let active = false
  const timers = new Set<number>()
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
  const dropHints = () => board.querySelectorAll(".tap-hint").forEach((hint) => hint.remove())
  // Pokémon seats redraw on each change, so the pressed look goes on the redrawn control.
  const press = (selector: string) => {
    board.querySelector<HTMLElement>(selector)?.click()
    const pressed = board.querySelector<HTMLElement>(`${selector}.hit`)
    pressed?.classList.add("pressed")
    later(POKEMON_DEMO_TAP_MS * 0.6, () => pressed?.classList.remove("pressed"))
  }

  function play() {
    clearTimers()
    dropHints()
    if (!active || game.setup.system !== "pokemon") return
    if (reducedMotion.matches) {
      POKEMON_DEMO_SCRIPT.forEach(({ tap, presses }) => {
        for (let count = 0; count < presses; count++) press(tap)
      })
      return
    }
    let at = POKEMON_DEMO_START_MS
    for (const step of POKEMON_DEMO_SCRIPT) {
      const hintAt = at - HINT_PRESS_MS
      later(hintAt, () => {
        const target = board.querySelector(("hint" in step ? step.hint : undefined) ?? step.tap)
        if (target) showTapHint(target, { presses: step.presses, every: POKEMON_DEMO_TAP_MS })
      })
      for (let count = 0; count < step.presses; count++) {
        later(at, () => press(step.tap))
        at += POKEMON_DEMO_TAP_MS
      }
      at += POKEMON_DEMO_PAUSE_MS
    }
  }

  game.subscribe((event) => {
    if (event.type !== "reset") return
    clearTimers()
    if (active) later(0, play)
  })

  return {
    start() {
      active = true
      if (game.setup.system === "pokemon") return later(0, play)
      const count = game.setup.names.length
      game.reset({
        system: "pokemon",
        startingLife: defaultStartingLife("pokemon", undefined, count),
        values: SAMPLE_PRIZES.slice(0, count),
      })
    },
    stop() {
      active = false
      clearTimers()
      dropHints()
    },
  }
}
