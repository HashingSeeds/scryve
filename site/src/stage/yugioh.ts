// The demo board's Life Points calculator, ported from the app's LifeCalculator
// (src/components/LifeCalculator.tsx) and the corner button LifeCard opens it with. Keep the
// keys, actions, copy, and trail in sync with those files.

import { playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { accessibleForeground } from "@/utils/colorContrast"

import { MAX_LIFE_DELTA } from "../../../convex/lib/gameRules"
import { flooredLifeDelta } from "../../../convex/lib/systems"
import type { DemoGame } from "./board"
import { HINT_PRESS_MS, showTapHint } from "./hint"
import { innerEdgeClearance, type MenuSpot } from "./pokemon"
import { createDemoScript } from "./script"

const COLUMN_KEYS = ["1", "2", "3", "00", "4", "5", "6", "0", "7", "8", "9", "⌫"] as const
const BESIDE_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"] as const
type Key = (typeof COLUMN_KEYS)[number]
const MAX_DIGITS = String(MAX_LIFE_DELTA).length
// LifeCalculator's COLUMN_MIN_HEIGHT and TRAIL_STEPS, in the app's points.
const COLUMN_MIN_HEIGHT = 300
const TRAIL_STEPS = { beside: 2, column: 3 }
// The app's dark theme colors the calculator mixes from (src/theme/colorsDark.ts).
const ERROR = "#C03403"
const SUCCESS = "#55C894"
const DELETE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6H9l-6 6 6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1Z"/><path d="m16 10-4 4m0-4 4 4"/></svg>'

// CalculatorGlyph: a calculator outline with a display and six keys.
const CALCULATOR_GLYPH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="4.5" y="2.5" width="15" height="19" rx="3" stroke-width="1.9"/><rect x="7.5" y="5.5" width="9" height="4" rx="1" stroke-width="1.6"/>${[
  8.6, 12, 15.4,
]
  .flatMap((cx) =>
    [13, 17].map(
      (cy) => `<circle cx="${cx}" cy="${cy}" r="1.15" fill="currentColor" stroke="none"/>`,
    ),
  )
  .join("")}</svg>`

// GameMenuButtonShape's mixColorsInLinearLight: `ratio` of the way from `from` to `to`.
function mix(from: string, to: string, ratio: number) {
  const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
  const end = channels(to)
  return `#${channels(from)
    .map((channel, index) => {
      const linear = (1 - ratio) * (channel / 255) ** 2.2 + ratio * ((end[index] ?? 0) / 255) ** 2.2
      return Math.round(Math.min(255, Math.max(0, linear ** (1 / 2.2) * 255)))
        .toString(16)
        .padStart(2, "0")
    })
    .join("")}`
}

// LifeCalculator's colors for a seat: a darkened sheet, and Damage and Gain mixed into it.
function calculatorColors(seatColor: string) {
  const background = mix(seatColor, "#000000", 0.82)
  const ink = accessibleForeground(background)
  const damage = mix(ERROR, background, 0.55)
  const gain = mix(SUCCESS, background, 0.55)
  return {
    "--calc-bg": background,
    "--calc-ink": ink,
    "--calc-damage": damage,
    "--calc-damage-ink": accessibleForeground(damage),
    "--calc-gain": gain,
    "--calc-gain-ink": accessibleForeground(gain),
    // The theme red reads at about 2:1 on a darkened seat, so it leans toward the ink.
    "--calc-trail-damage": mix(ERROR, ink, 0.3),
    "--calc-trail-gain": SUCCESS,
  }
}

const signed = (delta: number) => `${delta < 0 ? "−" : "+"}${Math.abs(delta)}`

export const hasCalculator = (system: PlaySystemId) =>
  Boolean(playSystemRules(system).counter.calculator)

export interface CalculatorSeat {
  seat: number
  rotation: number
  menu?: MenuSpot
  name: string
  color: string
}

// LifeCard's corner button, at the content's bottom right, opposite the seat's name.
export function calculatorButtonHtml(seat: number, name: string) {
  return `<button class="calc-open" type="button" data-calc="open" data-seat="${seat}" aria-label="${translate("board:lifeCard.openCalculator", { identity: name })}">${CALCULATOR_GLYPH}</button>`
}

// A board's calculators: which seat has one open and what's typed, as each device's own in the
// app. A calculator layers over its seat and updates in place, so focus stays on its keys.
export function createCalculators(board: HTMLElement, game: DemoGame) {
  const entries = new Map<number, string>()
  const seats = new Map<number, CalculatorSeat>()

  const sheetOf = (seat: number) =>
    board.querySelector<HTMLElement>(`.seat[data-player="${seat}"] .calc`)
  const nameOf = (seat: number) => seats.get(seat)?.name ?? `Player ${seat + 1}`

  // The app lays the keypad beside the number below COLUMN_MIN_HEIGHT points of seat. The board
  // is the app's 390 point wide screen, scaled.
  function besideFor(inner: HTMLElement) {
    const points = inner.offsetHeight * (390 / Math.max(1, board.offsetWidth))
    return inner.offsetHeight > 0 && points < COLUMN_MIN_HEIGHT
  }

  function sheetHtml(context: CalculatorSeat, beside: boolean) {
    const { seat, name } = context
    const keys = beside ? BESIDE_KEYS : COLUMN_KEYS
    const keyHtml = keys
      .map(
        (key) =>
          `<button type="button" data-calc="key" data-seat="${seat}" data-key="${key}" aria-label="${key === "⌫" ? translate("common:delete") : key}">${key === "⌫" ? DELETE_ICON : key}</button>`,
      )
      .join("")
    const action = (id: "damage" | "half" | "gain", label: string) =>
      `<button type="button" data-calc="${id}" data-seat="${seat}">${label}</button>`
    const clear = innerEdgeClearance(context.rotation, context.menu)
    const style = Object.entries(calculatorColors(context.color))
      .map(([property, value]) => `${property}:${value}`)
      .join(";")
    return `<div class="calc" role="group" aria-label="${name}" data-layout="${beside ? "beside" : "column"}"${clear ? ` data-clear="${clear}"` : ""} style="${style}">
      <div class="calc-head"><b>${name}</b><button class="calc-close" type="button" data-calc="close" data-seat="${seat}" aria-label="${translate("board:calculator.close", { name })}"></button></div>
      <div class="calc-readout">
        <span class="calc-value" aria-live="polite"></span>
        <span class="calc-hint"></span>
        <span class="calc-trail"></span>
      </div>
      <div class="calc-keys">${keyHtml}</div>
      <div class="calc-actions">${action("damage", beside ? "−" : translate("board:calculator.damage"))}${action("half", "½")}${action("gain", beside ? "+" : translate("board:calculator.gain"))}</div>
    </div>`
  }

  // LifeTrail: the latest changes, each with the total it started from, oldest dropped first
  // when the seat runs out of room. Once an amount is typed the current total ends the trail,
  // since the typed amount has taken the big number's place. No changes yet, no trail.
  function trailHtml(seat: number, changes: readonly number[], count: number, showTotal: boolean) {
    if (!changes.length) return ""
    const life = game.life[seat] ?? 0
    let from = life - changes.reduce((sum, delta) => sum + delta, 0)
    const steps = changes.map((delta) => {
      const step = { delta, from }
      from += delta
      return step
    })
    const shown = steps.slice(steps.length - count)
    return [
      ...(count > 0 && count < steps.length ? ['<span class="calc-was">…</span>'] : []),
      ...shown.map(
        ({ delta, from }) =>
          `<span class="calc-was">${from}</span><b class="${delta < 0 ? "down" : "up"}">${signed(delta)}</b>`,
      ),
      ...(showTotal ? [`<span>${life}</span>`] : []),
    ].join("")
  }

  function update(seat: number) {
    const sheet = sheetOf(seat)
    if (!sheet) return
    const entry = entries.get(seat) ?? ""
    const amount = Number(entry)
    const life = game.life[seat] ?? 0
    const name = nameOf(seat)
    const system = game.setup.system
    // Halving rounds the total up, as Yu-Gi-Oh! rounds halved Life Points.
    const halved = Math.ceil(life / 2) - life
    const value = sheet.querySelector<HTMLElement>(".calc-value")
    const hint = sheet.querySelector<HTMLElement>(".calc-hint")
    const trail = sheet.querySelector<HTMLElement>(".calc-trail")
    if (value) {
      value.textContent = entry || String(life)
      value.classList.toggle("typed", entry !== "")
    }
    if (hint)
      hint.textContent = entry
        ? `− → ${life + flooredLifeDelta(system, life, -amount)} · + → ${life + amount}`
        : translate("board:calculator.typeAmount")
    const deltas = {
      damage: -amount,
      half: Math.abs(halved) <= MAX_LIFE_DELTA ? halved : 0,
      gain: amount,
    }
    const labels = {
      damage: translate("board:calculator.subtractFrom", { amount, name }),
      half: translate("board:calculator.halve", { name }),
      gain: translate("board:calculator.addTo", { amount, name }),
    }
    for (const id of ["damage", "half", "gain"] as const) {
      const button = sheet.querySelector<HTMLButtonElement>(`[data-calc="${id}"]`)
      if (!button) continue
      button.disabled = !deltas[id]
      button.dataset.delta = String(deltas[id])
      button.setAttribute("aria-label", labels[id])
    }
    if (!trail) return
    const changes = game.lifeChanges(seat)
    const beside = sheet.dataset.layout === "beside"
    let count = Math.min(beside ? TRAIL_STEPS.beside : TRAIL_STEPS.column, changes.length)
    const draw = () => {
      trail.innerHTML = trailHtml(seat, changes, count, entry !== "")
    }
    draw()
    // A seat too narrow for even one change shows none rather than wrapping into the keypad.
    while (count > 0 && trail.scrollWidth > trail.clientWidth) {
      count--
      draw()
    }
    trail.setAttribute(
      "aria-label",
      changes.length
        ? translate("board:calculator.log", {
            name,
            steps: changes.map((delta) => signed(delta)).join(", "),
          })
        : "",
    )
  }

  function open(seat: number, focus: boolean) {
    const context = seats.get(seat)
    const inner = board.querySelector<HTMLElement>(`.seat[data-player="${seat}"] .seat-in`)
    if (!context || !inner || sheetOf(seat)) return
    entries.set(seat, "")
    inner.insertAdjacentHTML("beforeend", sheetHtml(context, besideFor(inner)))
    const sheet = inner.lastElementChild
    update(seat)
    // Mounted hidden, then faded in on the next style flush, like the app's FadeIn.
    if (sheet instanceof HTMLElement) {
      void sheet.offsetWidth
      sheet.classList.add("on")
      if (focus)
        sheet.querySelector<HTMLElement>('[data-calc="key"]')?.focus({ preventScroll: true })
    }
  }

  function close(seat: number) {
    const sheet = sheetOf(seat)
    entries.delete(seat)
    if (!sheet) return
    const hadFocus = sheet.contains(document.activeElement)
    sheet.remove()
    if (hadFocus)
      board
        .querySelector<HTMLElement>(`.seat[data-player="${seat}"] .calc-open`)
        ?.focus({ preventScroll: true })
  }

  function press(seat: number, key: Key) {
    const current = entries.get(seat) ?? ""
    if (key === "⌫") entries.set(seat, current.slice(0, -1))
    else if (!current && key.startsWith("0")) return
    else if (current.length + key.length <= MAX_DIGITS) entries.set(seat, current + key)
    update(seat)
  }

  // `keyboard` is an activation with no pointer, which moves focus into an opened calculator.
  function click(button: HTMLElement, keyboard: boolean) {
    const seat = Number(button.dataset.seat)
    switch (button.dataset.calc) {
      case "open":
        return open(seat, keyboard)
      case "close":
        return close(seat)
      case "key": {
        const key = COLUMN_KEYS.find((value) => value === button.dataset.key)
        return key && press(seat, key)
      }
      case "damage":
      case "half":
      case "gain": {
        const delta = Number(button.dataset.delta)
        close(seat)
        if (delta) game.adjust(seat, delta)
        return
      }
    }
  }

  return {
    // Registers a seat as the board draws it, with its button in place of the calculator.
    html(context: CalculatorSeat) {
      seats.set(context.seat, context)
      return calculatorButtonHtml(context.seat, context.name)
    },
    click,
    // Escape closes the open calculator the key was pressed in.
    escape(target: Element) {
      const sheet = target.closest<HTMLElement>(".calc")
      const seat = sheet?.closest<HTMLElement>(".seat")?.dataset.player
      if (seat === undefined) return false
      close(Number(seat))
      return true
    },
    // Another board's change keeps an open calculator's total and trail current.
    onChange: update,
    reset() {
      entries.clear()
      seats.clear()
    },
  }
}

const YUGIOH_DEMO_START_MS = 700
const YUGIOH_DEMO_TAP_MS = 800
const YUGIOH_DEMO_PAUSE_MS = 1100
// The demo's attack, typed one key at a time, then the halving that follows it.
const ATTACK_KEYS = ["2", "5", "00"] as const

export interface YugiohDemoOptions {
  reducedMotion: MediaQueryList
}

// The tour's Yu-Gi-Oh! turn: a duel, so two seats at 8000. The seat facing the viewer opens its
// calculator, types an attack and taps Damage, then opens it again, where the trail shows that
// change, and halves. Each tap clicks the real control, and the visitor's own tap ends the run.
export function createYugiohDemo(
  board: HTMLElement,
  game: DemoGame,
  { reducedMotion }: YugiohDemoOptions,
) {
  let active = false
  const script = createDemoScript(board)

  function play() {
    script.start()
    if (!active || game.setup.system !== "ygo") return script.end()
    const facing = [...board.querySelectorAll<HTMLElement>('.seat[data-rotation="0"]')].at(-1)
    const seat = facing?.dataset.player
    if (seat === undefined) return script.end()
    const control = (selector: string) =>
      board.querySelector<HTMLElement>(`.seat[data-player="${seat}"] ${selector}`)
    const steps = [
      '[data-calc="open"]',
      ...ATTACK_KEYS.map((key) => `[data-calc="key"][data-key="${key}"]`),
      '[data-calc="damage"]',
      '[data-calc="open"]',
      '[data-calc="half"]',
    ]
    if (reducedMotion.matches) {
      steps.forEach((selector) => control(selector)?.click())
      return script.end()
    }
    // A longer pause before each step that opens or closes the calculator, so it settles first.
    const settles = new Set([1, 4, 5, 6])
    let at = YUGIOH_DEMO_START_MS
    steps.forEach((selector, index) => {
      if (settles.has(index)) at += YUGIOH_DEMO_PAUSE_MS - YUGIOH_DEMO_TAP_MS
      script.later(at - HINT_PRESS_MS, () => {
        const target = control(selector)
        if (target) showTapHint(target)
      })
      script.later(at, () => {
        const target = control(selector)
        target?.classList.add("pressed")
        script.later(YUGIOH_DEMO_TAP_MS * 0.3, () => target?.classList.remove("pressed"))
        target?.click()
        if (index === steps.length - 1) script.end()
      })
      at += YUGIOH_DEMO_TAP_MS
    })
  }

  game.subscribe((event) => {
    if (event.type !== "reset") return
    script.cancel()
    if (active) script.later(0, play)
  })

  return {
    start() {
      active = true
      if (game.setup.system === "ygo" && game.setup.names.length === 2) return script.later(0, play)
      game.reset({
        system: "ygo",
        startingLife: playSystemRules("ygo").counter.defaultValue,
        names: game.setup.names.slice(0, 2),
        values: [],
        layout: "auto",
      })
    },
    stop() {
      active = false
      script.cancel()
    },
  }
}
