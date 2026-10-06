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
import { center, HINT_PRESS_MS, seatAxis, showTapHint } from "./hint"

const NAMES = ["Maya", "Devon", "Priya", "Jonas", "Sam", "Alex"] as const
const SAMPLE_LIFE = [32, 27, 40, 18, 35, 23] as const
// Demo taps land far enough apart that each change shows on its own before the next.
const DEMO_TAP_MS = 2600
const PRESS_MS = 220
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
const narrow = matchMedia("(max-width: 900px) and (orientation: portrait)")

// Use the copy's CSS pin position for scene changes and the hero's landing animation.
function stepAnchor() {
  return Number.parseFloat(getComputedStyle(query<HTMLElement>(".step-copy")).top)
}

// The hero, the Features steps, and connected play all show one game. The pickers reset it
// the way the app would and follow whatever the game shows.
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
  const commanderStep = query<HTMLElement>(".steps [data-step='commander']")
  query<HTMLElement>("[data-commander-replay]", commanderStep).addEventListener("click", () => {
    if (showingCommander) commander.start()
    else commanderStep.scrollIntoView({ block: "start", behavior: "instant" })
  })
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

function setUpConnected(stage: HTMLElement, game: DemoGame) {
  stage
    .querySelectorAll<HTMLElement>("[data-board='connected']")
    .forEach((el) => mountBoard(el, game))
}

// Keep the sample deck's tabs and version picker in the same places as the app.
function setUpDeck(stage: HTMLElement) {
  const deck = query<HTMLElement>(".deck", stage)
  const settings = query<HTMLDetailsElement>(".deck-settings", deck)
  const cardDialog = query<HTMLDialogElement>(".card-focus", deck)
  let cardTrigger: HTMLButtonElement | undefined
  // Native dialog supplies focus trapping and Escape. Keep its sheet over the demo phone.
  const placeCardDialog = () => {
    if (!cardDialog.open) return
    const bounds = deck.getBoundingClientRect()
    Object.assign(cardDialog.style, {
      left: `${bounds.left}px`,
      top: `${bounds.top + bounds.height * 0.12}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height * 0.88}px`,
    })
  }
  cardDialog.addEventListener("close", () => cardTrigger?.focus({ preventScroll: true }))
  cardDialog.addEventListener("click", (event) => {
    if (event.target !== cardDialog) return
    const bounds = cardDialog.getBoundingClientRect()
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      cardDialog.close()
  })
  addEventListener("resize", placeCardDialog)
  addEventListener("scroll", placeCardDialog, { passive: true })
  const close = () => {
    settings.open = false
    query<HTMLElement>("summary", settings).focus({ preventScroll: true })
  }
  settings.addEventListener("toggle", () => {
    query<HTMLElement>(".deck-content", deck).inert = settings.open
  })
  deck.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button")
    if (!button) return
    if (button.hasAttribute("data-card-close")) return cardDialog.close()
    if (button.dataset.deckCard !== undefined) {
      cardTrigger = button
      deck.querySelectorAll<HTMLElement>("[data-card-details]").forEach((details) => {
        details.hidden = details.dataset.cardDetails !== button.dataset.deckCard
      })
      query<HTMLElement>("#card-focus-title", cardDialog).textContent = query<HTMLElement>(
        "span",
        button,
      ).textContent
      query<HTMLElement>(".card-focus-quantity", cardDialog).textContent =
        `1× in ${button.dataset.cardBoard}`
      cardDialog.showModal()
      placeCardDialog()
      query<HTMLElement>(".card-focus-body", cardDialog).scrollTop = 0
      return
    }
    if (button.hasAttribute("data-deck-close")) return close()
    if (button.hasAttribute("data-deck-version")) {
      settings.querySelectorAll<HTMLButtonElement>("[data-deck-version]").forEach((version) => {
        version.setAttribute("aria-pressed", String(version === button))
      })
      return close()
    }
    if (!button.dataset.deckTab) return
    deck.querySelectorAll<HTMLButtonElement>("[data-deck-tab]").forEach((tab) => {
      tab.setAttribute("aria-pressed", String(tab === button))
    })
    deck.querySelectorAll<HTMLElement>("[data-deck-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.deckPanel !== button.dataset.deckTab
    })
  })
  settings.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && settings.open) close()
  })
  return () => {
    settings.open = false
    if (cardDialog.open) cardDialog.close()
  }
}

// The next section takes over as its heading nears the copy's pin position.
function setUpStage() {
  const stage = query<HTMLElement>("[data-stage]")
  const game = createDemoGame(commanderSetup(5))
  const onFeatureStep = setUpFeatures(stage, game)
  setUpConnected(stage, game)
  const closeDeckSettings = setUpDeck(stage)

  const steps = document.querySelectorAll<HTMLElement>(".steps [data-step]")
  // Screens CSS fades out stay out of the tab order and the accessibility tree.
  const screens = stage.querySelectorAll<HTMLElement>("[data-for]")
  const syncStageVisibility = () => {
    stage.inert = narrow.matches && stage.dataset.step === "plans"
    if (stage.inert) closeDeckSettings()
  }
  const showScene = (scene: string) => {
    stage.dataset.scene = scene
    if (scene !== "pro") closeDeckSettings()
    screens.forEach((screen) => {
      screen.inert = !screen.dataset.for?.split(" ").includes(scene)
    })
  }
  const activate = (step: HTMLElement) => {
    if (stage.dataset.step === step.dataset.step && step.classList.contains("active")) return
    showScene(step.closest<HTMLElement>("[data-scene]")?.dataset.scene ?? "intro")
    stage.dataset.step = step.dataset.step ?? ""
    syncStageVisibility()
    steps.forEach((other) => other.classList.toggle("active", other === step))
    onFeatureStep(stage.dataset.step)
  }
  showScene(stage.dataset.scene ?? "intro")
  setUpDemoTaps(stage, game)
  // Read section positions once per frame so a fast scroll can skip several headings safely.
  // The step whose copy is nearest its pinned spot, the brightest one, drives the phone, so the
  // phone changes as the new heading lights up rather than once it has fully arrived.
  let frame = 0
  const updateStep = () => {
    frame = 0
    const top = stepAnchor()
    let next = steps[0]
    let nearest = Infinity
    for (const step of steps) {
      const offset = query<HTMLElement>(".step-copy", step).getBoundingClientRect().top - top
      // The final comparison table stays bright while it scrolls through the viewport.
      const distance = step.dataset.step === "plans" ? Math.max(0, offset) : Math.abs(offset)
      if (distance < nearest) [next, nearest] = [step, distance]
      const brightness = 1 - Math.min(distance / 120, 1)
      step.style.setProperty("--step-opacity", String(0.35 + brightness * 0.65))
    }
    if (next) activate(next)
    syncStageVisibility()
  }
  const scheduleStep = () => {
    frame ||= requestAnimationFrame(updateStep)
  }
  addEventListener("scroll", scheduleStep, { passive: true })
  addEventListener("resize", scheduleStep)
  updateStep()
  setUpLanding(stage, () => activate(query("[data-step='intro']")))
  setUpFullScreen(stage)
}

// On small screens the deck screen stands up in a strip too short to use, so tapping it opens
// the same phone full screen.
function setUpFullScreen(stage: HTMLElement) {
  const toggle = (open: boolean) => {
    if (stage.classList.contains("full") === open) return
    const apply = () => stage.classList.toggle("full", open)
    if (prefersReducedMotion.matches || !("startViewTransition" in document)) return apply()
    document.startViewTransition(apply)
  }
  query("[data-try-close]", stage).addEventListener("click", () => toggle(false))
  // Capture so a tap on the preview opens it instead of changing a total.
  query(".rig", stage).addEventListener(
    "click",
    (event) => {
      if (!narrow.matches || stage.dataset.scene !== "pro" || stage.classList.contains("full"))
        return
      event.stopPropagation()
      toggle(true)
    },
    { capture: true },
  )
  addEventListener("keydown", (event) => event.key === "Escape" && toggle(false))
  narrow.addEventListener("change", () => narrow.matches || toggle(false))
}

// Until someone taps a total themselves, a ghostly hand taps a card every few seconds,
// alternating plus and minus, so the change shows and the total never drifts. It taps the
// lowest card that faces the viewer: Maya's with the phone on its side, Sam's standing up. While
// the phone turns no card faces the viewer, so the demo waits.
function setUpDemoTaps(stage: HTMLElement, game: DemoGame) {
  let direction: 1 | -1 = 1
  let pending: number | undefined
  // Full screen is for the visitor's own taps.
  const showing = () =>
    (stage.dataset.scene === "intro" || stage.dataset.scene === "features") &&
    stage.dataset.step !== "commander" &&
    !stage.classList.contains("full")
  const tap = () => {
    if (!showing()) return
    const board = query<HTMLElement>("[data-board='features']", stage)
    const facing = [...board.querySelectorAll<HTMLElement>(".seat[data-player]")]
      .filter((seat) => Math.abs(seatAxis(seat) ?? 90) < 1)
      .sort((a, b) => center(b).y - center(a).y)[0]
    if (!facing) return
    const seat = Number(facing.dataset.player)
    const hit = board.querySelector<HTMLElement>(
      `.hit[data-seat='${seat}'][data-dir='${direction}']`,
    )
    const glyph = board.querySelector<HTMLElement>(`[data-glyph='${seat}:${direction}']`)
    if (!hit || !glyph) return
    const change = direction
    direction = direction === 1 ? -1 : 1
    const press = () => {
      if (!showing()) return
      hit.classList.add("pressed")
      window.setTimeout(() => hit.classList.remove("pressed"), PRESS_MS)
      game.change(seat, change)
    }
    if (prefersReducedMotion.matches) return press()
    showTapHint(glyph)
    pending = window.setTimeout(press, HINT_PRESS_MS)
  }
  const timer = window.setInterval(tap, DEMO_TAP_MS)
  stage.addEventListener("click", (event) => {
    if (!event.isTrusted || !(event.target as Element).closest(".hit")) return
    window.clearInterval(timer)
    window.clearTimeout(pending)
  })
}

// On wide screens the stage's phone starts out filling the hero, on its side, and shrinks
// into the stage without turning. It then rotates in place, finishing just before the first
// heading pins. Until the stage itself pins it always shows the intro.
function setUpLanding(stage: HTMLElement, showIntro: () => void) {
  const slot = query<HTMLElement>("[data-hero-slot]")
  const tour = query<HTMLElement>(".tour")
  const header = query<HTMLElement>(".header")
  const rig = query<HTMLElement>(".rig", stage)
  const phone = query<HTMLElement>(".phone.main", stage)
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
      if (intro.getBoundingClientRect().top > stepAnchor()) showIntro()
      return
    }
    const landed = tour.offsetTop - header.offsetHeight
    const headingPins = intro.getBoundingClientRect().top + scrollY - stepAnchor()
    const turnFrom = headingPins * 0.6
    const upright = headingPins - 48
    const progress = clamp(scrollY / turnFrom)
    if (scrollY < landed) showIntro()
    // Park in landscape, then finish the turn 48px before the heading reaches its pin.
    const standing = clamp((scrollY - turnFrom) / (upright - turnFrom))
    const turn = -90 * (1 - standing * standing * (3 - 2 * standing))
    phone.style.setProperty("--turn", `${turn}deg`)
    // A tap hint is drawn inside its seat, so it would spin along with the phone.
    if (turn !== 0 && turn !== -90)
      stage.querySelectorAll(".tap-hint").forEach((hint) => hint.remove())
    // Once landed the stage's own sticky positioning takes over, so the phone scrolls away
    // with the tour instead of staying pinned over the closing section.
    if (scrollY >= landed) {
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
