import { getPlayerGridLayoutOptions } from "@/features/game/playerLayouts"
import {
  defaultStartingLife,
  PLAY_SYSTEM_IDS,
  playSystemRules,
  type PlaySystemId,
} from "@/features/game/playSystems"

import { createDemoGame, mountBoard, type DemoGameSetup } from "./board"

const NAMES = ["Maya", "Devon", "Priya", "Jonas", "Sam", "Alex"] as const
const SAMPLE_LIFE = [32, 27, 40, 18, 35, 23] as const
// Rows are the damaged player, columns the commander that dealt it.
const SAMPLE_COMMANDER_DAMAGE = [
  [0, 3, 0, 6, 0],
  [2, 0, 0, 3, 0],
  [0, 21, 0, 4, 1],
  [5, 0, 0, 0, 2],
  [0, 0, 3, 2, 0],
] as const

function startingLife(system: PlaySystemId) {
  return defaultStartingLife(system, system === "mtg" ? "commander" : undefined)
}

function commanderSetup(count: number): DemoGameSetup {
  return {
    system: "mtg",
    startingLife: startingLife("mtg"),
    names: NAMES.slice(0, count),
    values: SAMPLE_LIFE.slice(0, count),
    layout: "auto",
  }
}

function query<T extends Element>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(selector)
  if (!found) throw new Error(`Missing ${selector}`)
  return found
}

const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
const narrow = matchMedia("(max-width: 900px)")

// Hero: the real counter on a wide "table", or the phone grid on small screens.
function setUpHero() {
  const game = createDemoGame({ ...commanderSetup(4), values: [31, 24, 36, 18] })
  const setShape = mountBoard(query("[data-hero-board]"), game, {
    shape: narrow.matches ? "phone" : "table",
  })
  narrow.addEventListener("change", () => setShape(narrow.matches ? "phone" : "table"))

  const hero = query<HTMLElement>("[data-hero]")
  const menu = query<HTMLElement>("[data-hero-menu]")
  const label = (name: string, text: string) =>
    (query(`[data-show="${name}"]`, menu).textContent = text)
  const syncLabels = () => {
    label("players", String(game.setup.names.length))
    label("system", playSystemRules(game.setup.system).shortLabel)
  }
  const setOpen = (open: boolean) => {
    menu.hidden = !open
    if (open) {
      syncLabels()
      query<HTMLElement>("[data-act]", menu).focus()
    }
  }

  hero.addEventListener("click", (event) => {
    const target = event.target as Element
    if (target.closest(".pentagon")) return setOpen(true)
    const action = target.closest<HTMLElement>("[data-act]")?.dataset.act
    if (!action && target === menu) return setOpen(false)
    if (action === "players") {
      const count = game.setup.names.length === 6 ? 2 : game.setup.names.length + 1
      game.reset({ names: NAMES.slice(0, count), values: [] })
    }
    if (action === "system") {
      const index = PLAY_SYSTEM_IDS.indexOf(game.setup.system)
      const system = PLAY_SYSTEM_IDS[(index + 1) % PLAY_SYSTEM_IDS.length] ?? "mtg"
      game.reset({ system, startingLife: startingLife(system), values: [] })
    }
    if (action === "undo") game.undo()
    if (action === "end") game.reset({ values: [] })
    if (action === "close" || action === "undo" || action === "end") setOpen(false)
    syncLabels()
  })
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) setOpen(false)
  })
}

// Features steps drive one phone. Each control resets the demo game the way the app would.
function setUpFeatures(stage: HTMLElement) {
  const game = createDemoGame(commanderSetup(5))
  mountBoard(query("[data-board='features']", stage), game, { shape: "phone" })

  const countPicker = query<HTMLElement>("[data-pick='count']")
  const layoutPicker = query<HTMLElement>("[data-pick='layout']")
  const systemPicker = query<HTMLElement>("[data-pick='system']")

  const renderLayouts = () => {
    const count = game.setup.names.length
    layoutPicker.innerHTML = getPlayerGridLayoutOptions(count)
      .map(
        (option) =>
          `<button type="button" data-value="${option.variant}" aria-pressed="${option.variant === game.setup.layout}">${option.label}</button>`,
      )
      .join("")
  }
  const press = (picker: HTMLElement, value: string) =>
    picker.querySelectorAll<HTMLElement>("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.value === value))
    })

  countPicker.addEventListener("click", (event) => {
    const value = (event.target as Element).closest<HTMLElement>("button")?.dataset.value
    if (!value) return
    const count = Number(value)
    game.reset({
      names: NAMES.slice(0, count),
      values: SAMPLE_LIFE.slice(0, count),
      layout: "auto",
    })
    press(countPicker, value)
    renderLayouts()
  })
  layoutPicker.addEventListener("click", (event) => {
    const value = (event.target as Element).closest<HTMLElement>("button")?.dataset.value
    const option = getPlayerGridLayoutOptions(game.setup.names.length).find(
      ({ variant }) => variant === value,
    )
    if (!option) return
    game.reset({ layout: option.variant })
    press(layoutPicker, option.variant)
  })
  systemPicker.innerHTML = PLAY_SYSTEM_IDS.map(
    (id) =>
      `<button type="button" data-value="${id}" aria-pressed="${id === "mtg"}">${playSystemRules(id).shortLabel}</button>`,
  ).join("")
  systemPicker.addEventListener("click", (event) => {
    const id = PLAY_SYSTEM_IDS.find(
      (system) =>
        system === (event.target as Element).closest<HTMLElement>("button")?.dataset.value,
    )
    if (!id) return
    game.reset({ system: id, startingLife: startingLife(id), values: [] })
    press(systemPicker, id)
  })
  renderLayouts()

  // Commander damage badges appear only while that step is on screen.
  return (step: string) => {
    const wantsDamage = step === "commander"
    const hasDamage = Boolean(game.setup.commanderDamage)
    if (wantsDamage === hasDamage) return
    if (wantsDamage) {
      game.reset({
        ...commanderSetup(5),
        commanderDamage: SAMPLE_COMMANDER_DAMAGE,
        values: [32, 27, 9, 18, 35],
      })
      press(countPicker, "5")
      press(systemPicker, "mtg")
      renderLayouts()
    } else {
      game.reset({ commanderDamage: undefined, values: game.life })
    }
  }
}

function setUpConnected(stage: HTMLElement) {
  const game = createDemoGame({ ...commanderSetup(4), values: [27, 33, 19, 40] })
  const phones = stage.querySelectorAll<HTMLElement>("[data-board='connected']")
  phones.forEach((el) => mountBoard(el, game, { shape: "phone" }))
  game.subscribe(() => {
    if (prefersReducedMotion.matches) return
    phones.forEach((el) => {
      const frame = el.closest<HTMLElement>(".phone")
      frame?.classList.remove("synced")
      void frame?.offsetWidth
      frame?.classList.add("synced")
    })
  })
}

// Whichever step crosses the middle of the viewport sets the stage's scene and step.
function setUpStage() {
  const stage = query<HTMLElement>("[data-stage]")
  const onFeatureStep = setUpFeatures(stage)
  setUpConnected(stage)

  const steps = document.querySelectorAll<HTMLElement>("[data-step]")
  const activate = (step: HTMLElement) => {
    const scene = step.closest<HTMLElement>("[data-scene]")?.dataset.scene ?? "intro"
    stage.dataset.scene = scene
    stage.dataset.step = step.dataset.step ?? ""
    steps.forEach((other) => other.classList.toggle("active", other === step))
    onFeatureStep(stage.dataset.step)
  }
  // On small screens the stage pins over the top half, so steps activate in the lower half.
  let observer: IntersectionObserver | undefined
  const observe = () => {
    observer?.disconnect()
    observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => entry.isIntersecting && activate(entry.target as HTMLElement)),
      { rootMargin: narrow.matches ? "-74% 0px -25% 0px" : "-50% 0px -50% 0px" },
    )
    steps.forEach((step) => observer?.observe(step))
  }
  narrow.addEventListener("change", observe)
  observe()
}

setUpHero()
setUpStage()
