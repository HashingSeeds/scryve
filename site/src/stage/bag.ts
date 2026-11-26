import { DIE_FACES, POUCH_PATH, RINGED_GLYPHS, TABLE_GLYPHS } from "@/components/tableGlyphs"
import {
  DICE_TOOLS,
  roll,
  rollValueLabel,
  toolLabel,
  type DiceRoll,
  type DiceTool,
} from "@/features/game/dice"
import { playTableRules, tableItemShortLabel, type PlaySystemId } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"

import { demoFormat } from "./systems"

// The bag's three quick dice, as in the app's CounterChips; "More dice" shows the rest.
const QUICK_DICE: readonly DiceTool[] = ["d20", "d6", "coin"]

export function dieSvg(tool: DiceTool) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${DIE_FACES[tool]}" fill="currentColor" fill-rule="evenodd"/></svg>`
}

function tableGlyphSvg(id: string) {
  const path = TABLE_GLYPHS[id]
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    path ? "" : '<circle cx="12" cy="12" r="4" fill="currentColor"/>'
  }${RINGED_GLYPHS.has(id) ? '<circle cx="12" cy="12" r="7"/>' : ""}${path ? `<path d="${path}"/>` : ""}</svg>`
}

// Each seat's dice bag, like the app's: the pouch opens the seat's counters and dice, and a roll
// closes it and leaves the result beside the player's name. Counters show what the bag holds.
export function createBags(system: () => PlaySystemId) {
  const open = new Set<number>()
  const allDice = new Set<number>()
  const results = new Map<number, DiceRoll>()

  function buttonHtml(seat: number, name: string) {
    return `<button class="bag" type="button" data-bag="open" data-seat="${seat}" aria-label="${translate("board:dice.openBag", { identity: name })}" aria-expanded="${open.has(seat)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${POUCH_PATH}" fill="currentColor"/></svg></button>`
  }

  function toolHtml(seat: number, tool: DiceTool) {
    return `<button type="button" data-bag="roll" data-seat="${seat}" data-tool="${tool}" aria-label="${toolLabel(tool)}">${dieSvg(tool)}</button>`
  }

  function sheetHtml(seat: number, name: string) {
    if (!open.has(seat)) return ""
    const rules = playTableRules(system(), demoFormat(system()))
    const items = [...rules.counters, ...rules.designations]
    const itemsHtml = items
      .map((item) => `<span>${tableGlyphSvg(item.id)}${tableItemShortLabel(item)}</span>`)
      .concat(
        rules.customCounters
          ? [`<span>${tableGlyphSvg("plus")}${translate("board:counters.customShort")}</span>`]
          : [],
      )
      .join("")
    const quick = items.length > 0
    const every = allDice.has(seat) || !quick
    const top = every
      ? `<div class="bag-dice all">${DICE_TOOLS.map((tool) => toolHtml(seat, tool)).join("")}</div>`
      : `<div class="bag-items">${itemsHtml}</div>`
    const more = quick
      ? `<button type="button" data-bag="more" data-seat="${seat}" aria-label="${translate("board:dice.moreDice")}" aria-pressed="${allDice.has(seat)}">•••</button>`
      : ""
    return `<div class="bag-sheet" role="group" aria-label="${translate("board:dice.openBag", { identity: name })}">
      ${top}
      <div class="bag-row">
        ${quick ? `<div class="bag-dice">${QUICK_DICE.map((tool) => toolHtml(seat, tool)).join("")}${more}</div>` : ""}
        <button class="bag-close" type="button" data-bag="close" data-seat="${seat}" aria-label="${translate("board:menu.closeDice")}">${tableGlyphSvg("close")}</button>
      </div>
    </div>`
  }

  function chipHtml(seat: number) {
    const result = results.get(seat)
    if (!result) return ""
    return `<span class="roll-chip" role="status">${dieSvg(result.tool)}<b>${rollValueLabel(result)}</b></span>`
  }

  // Handles a press inside the bag; returns the seat to redraw.
  function click(control: HTMLElement): number {
    const seat = Number(control.dataset.seat)
    switch (control.dataset.bag) {
      case "open":
        open.add(seat)
        break
      case "close":
        open.delete(seat)
        allDice.delete(seat)
        break
      case "more":
        if (allDice.has(seat)) allDice.delete(seat)
        else allDice.add(seat)
        break
      case "roll": {
        const tool = DICE_TOOLS.find((candidate) => candidate === control.dataset.tool)
        if (tool) results.set(seat, roll(tool))
        open.delete(seat)
        allDice.delete(seat)
        break
      }
    }
    return seat
  }

  function reset() {
    for (const set of [open, allDice]) set.clear()
    results.clear()
  }

  return { buttonHtml, sheetHtml, chipHtml, click, reset, isOpen: (seat: number) => open.has(seat) }
}
