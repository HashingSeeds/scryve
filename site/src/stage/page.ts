import { getPlayerGridLayoutOptions } from "@/features/game/playerLayouts"
import {
  defaultStartingLife,
  PLAY_SYSTEM_IDS,
  playSystemRules,
  type PlaySystemId,
} from "@/features/game/playSystems"

import { createDemoGame, mountBoard, type DemoGame, type DemoGameSetup } from "./board"

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

// Features steps and the hero share one phone and one game. The pickers and the game menu
// both reset the game the way the app would; the pickers follow whatever the game shows.
function setUpFeatures(stage: HTMLElement) {
  const game = createDemoGame(commanderSetup(5))
  const board = query<HTMLElement>("[data-board='features']", stage)
  mountBoard(board, game)

  const countPicker = query<HTMLElement>("[data-pick='count']")
  const layoutPicker = query<HTMLElement>("[data-pick='layout']")
  const systemPicker = query<HTMLElement>("[data-pick='system']")
  const press = (picker: HTMLElement, value: string) =>
    picker.querySelectorAll<HTMLElement>("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.value === value))
    })
  const syncPickers = () => {
    const count = game.setup.names.length
    layoutPicker.innerHTML = getPlayerGridLayoutOptions(count)
      .map(
        ({ variant, label }) => `<button type="button" data-value="${variant}">${label}</button>`,
      )
      .join("")
    press(countPicker, String(count))
    press(layoutPicker, game.setup.layout)
    press(systemPicker, game.setup.system)
  }
  const picked = (event: Event) =>
    (event.target as Element).closest<HTMLElement>("button")?.dataset.value

  countPicker.addEventListener("click", (event) => {
    const count = Number(picked(event))
    if (!count) return
    game.reset({
      names: NAMES.slice(0, count),
      values: SAMPLE_LIFE.slice(0, count),
      layout: "auto",
    })
  })
  layoutPicker.addEventListener("click", (event) => {
    const value = picked(event)
    const option = getPlayerGridLayoutOptions(game.setup.names.length).find(
      ({ variant }) => variant === value,
    )
    if (option) game.reset({ layout: option.variant })
  })
  systemPicker.innerHTML = PLAY_SYSTEM_IDS.map(
    (id) => `<button type="button" data-value="${id}">${playSystemRules(id).shortLabel}</button>`,
  ).join("")
  systemPicker.addEventListener("click", (event) => {
    const value = picked(event)
    const id = PLAY_SYSTEM_IDS.find((system) => system === value)
    if (id) game.reset({ system: id, startingLife: startingLife(id), values: [] })
  })
  game.subscribe((event) => event.type === "reset" && syncPickers())
  syncPickers()
  setUpMenu(board, game)

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
    } else {
      game.reset({ commanderDamage: undefined, values: game.life })
    }
  }
}

// The pentagon opens the app's game menu over the page.
function setUpMenu(board: HTMLElement, game: DemoGame) {
  const menu = query<HTMLElement>("[data-game-menu]")
  const label = (name: string, text: string) =>
    (query(`[data-show="${name}"]`, menu).textContent = text)
  const syncLabels = () => {
    label("players", String(game.setup.names.length))
    label("system", playSystemRules(game.setup.system).shortLabel)
  }
  const setOpen = (open: boolean) => {
    menu.hidden = !open
    if (!open) return
    syncLabels()
    query<HTMLElement>("[data-act]", menu).focus()
  }

  board.addEventListener("click", (event) => {
    if ((event.target as Element).closest(".pentagon")) setOpen(true)
  })
  menu.addEventListener("click", (event) => {
    const target = event.target as Element
    const action = target.closest<HTMLElement>("[data-act]")?.dataset.act
    if (!action) return target === menu && setOpen(false)
    if (action === "players") {
      const count = game.setup.names.length === 6 ? 2 : game.setup.names.length + 1
      game.reset({ names: NAMES.slice(0, count), values: [], layout: "auto" })
    }
    if (action === "system") {
      const index = PLAY_SYSTEM_IDS.indexOf(game.setup.system)
      const system = PLAY_SYSTEM_IDS[(index + 1) % PLAY_SYSTEM_IDS.length] ?? "mtg"
      game.reset({ system, startingLife: startingLife(system), values: [] })
    }
    if (action === "players" || action === "system") return syncLabels()
    if (action === "undo") game.undo()
    if (action === "end") game.reset({ values: [] })
    setOpen(false)
  })
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) setOpen(false)
  })
}

function setUpConnected(stage: HTMLElement) {
  const game = createDemoGame({ ...commanderSetup(4), values: [27, 33, 19, 40] })
  const phones = stage.querySelectorAll<HTMLElement>("[data-board='connected']")
  phones.forEach((el) => mountBoard(el, game))
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

  const steps = document.querySelectorAll<HTMLElement>(".steps [data-step]")
  const activate = (step: HTMLElement) => {
    if (stage.dataset.step === step.dataset.step && step.classList.contains("active")) return
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
  setUpLanding(stage, () => activate(query("[data-step='intro']")))
}

// The stage's phone starts out filling the hero (on its side on wide screens) and shrinks
// into the stage over the first screen of scrolling. Until it lands it always shows the intro.
function setUpLanding(stage: HTMLElement, showIntro: () => void) {
  const slot = query<HTMLElement>("[data-hero-slot]")
  const tour = query<HTMLElement>(".tour")
  const header = query<HTMLElement>(".header")
  const rig = query<HTMLElement>(".rig", stage)
  let frame = 0

  const update = () => {
    frame = 0
    const progress = Math.min(1, Math.max(0, scrollY / (tour.offsetTop - header.offsetHeight)))
    if (progress < 1) showIntro()
    // Ease out so the phone clears the hero copy early. It heads for where the stage pins,
    // and is offset from wherever the stage currently sits on the way there.
    const eased = 1 - (1 - progress) ** 3
    const from = slot.getBoundingClientRect()
    const stageBox = stage.getBoundingClientRect()
    const [width, height] = narrow.matches
      ? [rig.offsetWidth, rig.offsetHeight]
      : [rig.offsetHeight, rig.offsetWidth]
    const lerp = (start: number, end: number) => start + (end - start) * eased
    const scale = lerp(Math.min(from.width / width, from.height / height), 1)
    const pinnedY = header.offsetHeight + stage.offsetHeight / 2
    const x = lerp(from.left + from.width / 2, stageBox.left + stageBox.width / 2)
    // Never slide up under the header.
    const y = Math.max(
      lerp(from.top + from.height / 2, pinnedY),
      header.offsetHeight + (height * scale) / 2,
    )
    rig.style.translate = `${x - stageBox.left - stageBox.width / 2}px ${y - stageBox.top - stageBox.height / 2}px`
    rig.style.scale = String(scale)
  }
  const schedule = () => {
    frame ||= requestAnimationFrame(update)
  }
  addEventListener("scroll", schedule, { passive: true })
  addEventListener("resize", schedule)
  update()
}

setUpStage()
