import { getPlayerGridLayoutOptions } from "@/features/game/playerLayouts"
import {
  defaultStartingLife,
  PLAY_SYSTEM_IDS,
  playSystemRules,
  type PlaySystemId,
} from "@/features/game/playSystems"

import {
  createCommanderDemo,
  createDemoGame,
  mountBoard,
  type DemoGame,
  type DemoGameSetup,
} from "./board"

const NAMES = ["Maya", "Devon", "Priya", "Jonas", "Sam", "Alex"] as const
const SAMPLE_LIFE = [32, 27, 40, 18, 35, 23] as const
// Commander damage the demo player deals to each successive opponent.
const SAMPLE_COMMANDER_DAMAGE = [6, 3] as const

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

// The hero, the Features steps, and connected play all show one game. The pickers and the
// game menu reset it the way the app would; the pickers follow whatever the game shows.
function setUpFeatures(stage: HTMLElement, game: DemoGame) {
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

  // The commander damage demo plays while that step is on screen. Commander damage is a
  // Magic format, so the step moves another system to Magic; the demo then plays on reset.
  const commander = createCommanderDemo(board, game, {
    damage: SAMPLE_COMMANDER_DAMAGE,
    reducedMotion: prefersReducedMotion,
  })
  let showingCommander = false
  return (step: string) => {
    const wantsCommander = step === "commander"
    if (wantsCommander === showingCommander) return
    showingCommander = wantsCommander
    if (!wantsCommander) return commander.stop()
    commander.start()
    if (game.setup.system === "mtg") return
    game.reset({
      system: "mtg",
      startingLife: startingLife("mtg"),
      values: SAMPLE_LIFE.slice(0, game.setup.names.length),
    })
  }
}

// Both connected phones mount the same game, so a tap on either shows up on both.
function setUpConnected(stage: HTMLElement, game: DemoGame) {
  stage
    .querySelectorAll<HTMLElement>("[data-board='connected']")
    .forEach((el) => mountBoard(el, game))
}

// Whichever step crosses the middle of the viewport sets the stage's scene and step.
function setUpStage() {
  const stage = query<HTMLElement>("[data-stage]")
  const game = createDemoGame(commanderSetup(5))
  const onFeatureStep = setUpFeatures(stage, game)
  setUpConnected(stage, game)

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

// On wide screens the stage's phone starts out filling the hero, on its side, and shrinks
// into the stage over the first screen of scrolling, standing up as it lands so it is upright
// by the time the players step activates. Until it lands it always shows the intro.
function setUpLanding(stage: HTMLElement, showIntro: () => void) {
  const slot = query<HTMLElement>("[data-hero-slot]")
  const tour = query<HTMLElement>(".tour")
  const header = query<HTMLElement>(".header")
  const rig = query<HTMLElement>(".rig", stage)
  const phone = query<HTMLElement>(".phone.main", stage)
  const players = query<HTMLElement>(".steps [data-step='players']")
  let frame = 0
  const clamp = (value: number) => Math.min(1, Math.max(0, value))

  const intro = query<HTMLElement>(".steps [data-step='intro']")

  const update = () => {
    frame = 0
    // On small screens CSS pins the phone from the top, so there is nothing to animate.
    if (narrow.matches) {
      rig.style.translate = ""
      rig.style.scale = ""
      phone.style.removeProperty("--turn")
      if (intro.getBoundingClientRect().top > innerHeight * 0.75) showIntro()
      return
    }
    const landed = tour.offsetTop - header.offsetHeight
    const progress = clamp(scrollY / landed)
    if (progress < 1) showIntro()
    // Start turning before it lands so the two motions blend instead of stopping in between.
    const turnFrom = landed * 0.6
    const upright = players.getBoundingClientRect().top + scrollY - innerHeight / 2
    const standing = clamp((scrollY - turnFrom) / (upright - turnFrom))
    const turn = narrow.matches ? 0 : -90 * (1 - standing * standing * (3 - 2 * standing))
    phone.style.setProperty("--turn", `${turn}deg`)
    // Once landed the stage's own sticky positioning takes over, so the phone scrolls away
    // with the tour instead of staying pinned over the closing section.
    if (progress === 1) {
      rig.style.translate = ""
      rig.style.scale = ""
      return
    }
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
  narrow.addEventListener("change", schedule)
  update()
}

setUpStage()
