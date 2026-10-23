import { getPlayerGridLayoutOptions } from "@/features/game/playerLayouts"
import { defaultStartingLife, type PlaySystemId } from "@/features/game/playSystems"

import {
  createCommanderDemo,
  createDemoGame,
  mountBoard,
  type DemoGame,
  type DemoGameSetup,
} from "./board"
import { center, HINT_PRESS_MS, seatAxis, showTapHint } from "./hint"
import { createPokemonDemo, SAMPLE_PRIZES } from "./pokemon"
import { SITE_SYSTEM_IDS, type SiteSystemId } from "./systems"
import { createYugiohDemo } from "./yugioh"

const NAMES = ["Maya", "Devon", "Priya", "Jonas", "Sam", "Alex"] as const
const SAMPLE_LIFE = [32, 27, 40, 18, 35, 23] as const
const SAMPLE_LIFE_POINTS = [8000, 5300, 6800, 2350, 7400, 4100] as const
// Seats a game starts with when it's picked: the landing's Commander table, or a duel.
const SEATS_FOR = { mtg: 5, ygo: 2, pokemon: 2 } as const satisfies Record<SiteSystemId, number>
// Demo taps land far enough apart that each change shows on its own before the next.
const DEMO_TAP_MS = 2600
const PRESS_MS = 220
// Commander damage the demo player deals to each successive opponent.
const SAMPLE_COMMANDER_DAMAGE = [3, 3] as const

function startingLife(system: PlaySystemId) {
  return defaultStartingLife(system, system === "mtg" ? "commander" : undefined)
}

// Totals mid-game, so the board looks played.
function sampleValues(system: PlaySystemId, count: number): readonly number[] {
  if (system === "mtg") return SAMPLE_LIFE.slice(0, count)
  if (system === "pokemon") return SAMPLE_PRIZES.slice(0, count)
  if (system === "ygo") return SAMPLE_LIFE_POINTS.slice(0, count)
  return []
}

const DEMOS = ["commander", "yugioh", "pokemon"] as const
// Leaving the demo step plays its changes back in reverse over about this long.
const REWIND_MS = 1500
const REWIND_MIN_STEP_MS = 30
const REWIND_MAX_STEP_MS = 220
const VISITOR_TAP = "scryve:visitor-tap"
const REWIND_MAX_FRAMES = Math.floor(REWIND_MS / REWIND_MIN_STEP_MS)
type Demo = (typeof DEMOS)[number]
// The demo the details step opens on for each game the site offers.
const DEMO_FOR = { mtg: "commander", ygo: "yugioh", pokemon: "pokemon" } as const satisfies Record<
  SiteSystemId,
  Demo
>
function demoFor(system: string): Demo {
  const id = SITE_SYSTEM_IDS.find((site) => site === system)
  return id ? DEMO_FOR[id] : "commander"
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
  // Every system picker on the page drives the same game.
  const systemPickers = [...document.querySelectorAll<HTMLElement>("[data-pick='system']")]
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
    systemPickers.forEach((picker) => press(picker, game.setup.system))
  }
  const picked = (event: Event) =>
    (event.target as Element).closest<HTMLElement>("button")?.dataset.value

  countPicker.addEventListener("click", (event) => {
    const count = Number(picked(event))
    if (!count) return
    game.reset({
      names: NAMES.slice(0, count),
      values: sampleValues(game.setup.system, count),
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
  // The system pickers' buttons are in the HTML, so the hero has its height before this runs.
  systemPickers.forEach((picker) => {
    picker.addEventListener("click", (event) => {
      const value = picked(event)
      const id = SITE_SYSTEM_IDS.find((system) => system === value)
      if (!id) return
      const count = SEATS_FOR[id]
      game.reset({
        system: id,
        startingLife: startingLife(id),
        names: NAMES.slice(0, count),
        values: sampleValues(id, count),
        layout: "auto",
      })
    })
  })
  game.subscribe((event) => event.type === "reset" && syncPickers())
  syncPickers()

  // The details step plays one demo at a time on the visitor's own table: Commander damage, a
  // Yu-Gi-Oh! calculator turn, or a Pokémon turn. Seats and layout stay theirs; only the game
  // changes when the demo needs it, and a Yu-Gi-Oh! duel seats two, as its copy says. It
  // opens on the visitor's game when that game has a demo, and the step's picker switches between
  // them. Each switch or replay starts again from the visitor's table. When the step leaves the
  // screen, the demo's changes play back in reverse until the visitor's table is back.
  const demos: Record<Demo, { start: () => void; stop: () => void }> = {
    commander: createCommanderDemo(board, game, {
      damage: SAMPLE_COMMANDER_DAMAGE,
      reducedMotion: prefersReducedMotion,
    }),
    yugioh: createYugiohDemo(board, game, { reducedMotion: prefersReducedMotion }),
    pokemon: createPokemonDemo(board, game, { reducedMotion: prefersReducedMotion }),
  }
  const step = query<HTMLElement>(".steps [data-step='details']")
  const demoPicker = query<HTMLElement>("[data-pick='demo']", step)
  let showing: Demo | undefined
  // The demo the step shows next. Picking a game anywhere on the page sets it, so the step's copy
  // already matches by the time it scrolls into view and never changes in front of the visitor.
  let chosen: Demo = demoFor(game.setup.system)
  let borrowed: ReturnType<DemoGame["snapshot"]> | undefined
  // The table after each change the demo makes, for the rewind.
  let trail: ReturnType<DemoGame["snapshot"]>[] = []
  let rewinding: number | undefined
  let leaving: ReturnType<DemoGame["snapshot"]> | undefined
  game.subscribe(() => {
    if (showing && rewinding === undefined) trail.push(game.snapshot())
  })

  function stopRewind() {
    window.clearTimeout(rewinding)
    rewinding = undefined
    delete stage.dataset.rewinding
  }
  // A keyboard activation has no point, so it goes to the redrawn control with the same data
  // attributes (seat, direction, action, picker value) in the same board or picker, which outlive
  // the redraw. A control the landed game lacks gets nothing.
  const ownerOf = (el: Element): ParentNode =>
    el.closest<HTMLElement>("[data-board], [data-pick]") ?? document
  const sameControl = (old: Element, owner: ParentNode) => {
    const control = old.closest<HTMLElement>("button")
    if (!control) return null
    const match = Object.entries(control.dataset)
      .map(
        ([key, value]) =>
          `[data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${value}"]`,
      )
      .join("")
    return match ? owner.querySelector<HTMLElement>(`button${match}`) : null
  }
  // A tap anywhere lands the rewind first, so the tap changes the visitor's table and no later
  // frame overwrites it. Capture runs before the boards' and pickers' own handlers.
  document.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted || rewinding === undefined) return
      const owner = event.target instanceof Element ? ownerOf(event.target) : document
      stopRewind()
      if (leaving) game.restore(leaving)
      // Landing redraws the board, so a tap on it goes to whatever control is there now.
      if (!(event.target instanceof Element) || event.target.isConnected) return
      event.stopPropagation()
      event.preventDefault()
      if (owner instanceof Element && owner.matches("[data-board]"))
        stage.dispatchEvent(new Event(VISITOR_TAP))
      const now =
        event.detail === 0
          ? sameControl(event.target, owner)
          : document.elementFromPoint(event.clientX, event.clientY)
      if (!(now instanceof HTMLElement)) return
      if (event.detail === 0) now.focus({ preventScroll: true })
      now.click()
    },
    true,
  )
  // Steps back through the trail, about REWIND_MS in all, and lands on the visitor's table.
  function rewind(to: ReturnType<DemoGame["snapshot"]>) {
    const steps = trail.slice(0, -1).reverse()
    // A long trail is thinned to evenly spaced frames, so the rewind keeps to REWIND_MS.
    const keep = Math.min(steps.length, REWIND_MAX_FRAMES)
    const frames = [
      ...Array.from({ length: keep }).flatMap(
        (_, i) => steps[Math.floor((i * steps.length) / keep)] ?? [],
      ),
      to,
    ]
    trail = []
    const every = Math.min(
      REWIND_MAX_STEP_MS,
      Math.max(REWIND_MIN_STEP_MS, REWIND_MS / frames.length),
    )
    const next = () => {
      const frame = frames.shift()
      if (!frame) return stopRewind()
      // A frame redraws the boards, so keyboard focus moves to the same control in the redraw.
      const focused = document.activeElement
      const owner = focused ? ownerOf(focused) : document
      game.restore(frame)
      if (focused instanceof Element && !focused.isConnected)
        sameControl(focused, owner)?.focus({ preventScroll: true })
      if (frames.length) rewinding = window.setTimeout(next, every)
      else stopRewind()
    }
    stage.dataset.rewinding = ""
    rewinding = window.setTimeout(next, every)
  }

  function choose(demo: Demo) {
    chosen = demo
    press(demoPicker, demo)
    step.querySelectorAll<HTMLElement>("[data-demo-copy]").forEach((copy) => {
      copy.hidden = copy.dataset.demoCopy !== demo
    })
  }
  function show(demo: Demo) {
    if (showing) demos[showing].stop()
    if (showing && borrowed) game.restore(borrowed)
    trail = []
    showing = demo
    choose(demo)
    demos[demo].start()
    if (demo === "commander" && game.setup.system !== "mtg")
      game.reset({
        system: "mtg",
        startingLife: startingLife("mtg"),
        values: SAMPLE_LIFE.slice(0, game.setup.names.length),
      })
  }
  const scrollToStep = () => step.scrollIntoView({ block: "start", behavior: "instant" })

  demoPicker.addEventListener("click", (event) => {
    const demo = DEMOS.find((value) => value === picked(event))
    if (!demo) return
    if (borrowed) return show(demo)
    choose(demo)
    scrollToStep()
  })
  systemPickers.forEach((picker) =>
    picker.addEventListener("click", (event) => {
      const value = picked(event)
      if (!borrowed && value) choose(demoFor(value))
    }),
  )
  query<HTMLElement>("[data-replay]", step).addEventListener("click", () => {
    if (borrowed && showing) show(showing)
    else scrollToStep()
  })

  return (next: string) => {
    if ((next === "details") === Boolean(borrowed)) return
    if (next === "details") {
      // Coming back mid-rewind starts from the visitor's table, not a half-rewound one.
      if (rewinding !== undefined) {
        stopRewind()
        game.restore(leaving ?? game.snapshot())
      }
      borrowed = game.snapshot()
      return show(chosen)
    }
    if (showing) demos[showing].stop()
    showing = undefined
    leaving = borrowed
    if (borrowed && prefersReducedMotion.matches) game.restore(borrowed)
    else if (borrowed) rewind(borrowed)
    borrowed = undefined
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
  const game = createDemoGame(commanderSetup(SEATS_FOR.mtg))
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

// Scenes whose screen is portrait only. On small screens the phone stands up in a strip too
// short to use, so tapping it opens the same phone full screen.
const PORTRAIT_SCENES = new Set(["record", "pro"])

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
      if (
        !narrow.matches ||
        !PORTRAIT_SCENES.has(stage.dataset.scene ?? "") ||
        stage.classList.contains("full")
      )
        return
      event.stopPropagation()
      toggle(true)
    },
    { capture: true },
  )
  addEventListener("keydown", (event) => event.key === "Escape" && toggle(false))
  narrow.addEventListener("change", () => narrow.matches || toggle(false))
}

// Until someone taps a total or a calculator themselves, a ghostly hand taps a card every few
// seconds, alternating plus and minus, so the change shows and the total never drifts. It taps the
// lowest card that faces the viewer: Maya's with the phone on its side, Sam's standing up. When
// none does, as with a duel's two seats on a phone on its side, it taps a card on its side. While
// the phone turns no card sits square to the viewer, so the demo waits.
function setUpDemoTaps(stage: HTMLElement, game: DemoGame) {
  let direction: 1 | -1 = 1
  let pending: number | undefined
  // Full screen is for the visitor's own taps.
  const showing = () =>
    (stage.dataset.scene === "intro" || stage.dataset.scene === "features") &&
    stage.dataset.step !== "details" &&
    stage.dataset.rewinding === undefined &&
    !stage.classList.contains("full")
  const tap = () => {
    if (!showing()) return
    const board = query<HTMLElement>("[data-board='features']", stage)
    const facing = [...board.querySelectorAll<HTMLElement>(".seat[data-player]")]
      .flatMap((seat) => {
        const axis = seatAxis(seat)
        const square = axis !== undefined && Math.abs(axis - Math.round(axis / 90) * 90) < 1
        return square ? [{ seat, upright: Math.abs(axis) < 1 }] : []
      })
      .sort(
        (a, b) => Number(b.upright) - Number(a.upright) || center(b.seat).y - center(a.seat).y,
      )[0]?.seat
    if (!facing) return
    const seat = Number(facing.dataset.player)
    const selector = `.hit[data-seat='${seat}'][data-dir='${direction}']`
    const glyph = board.querySelector<HTMLElement>(`[data-glyph='${seat}:${direction}']`)
    if (!board.querySelector(selector) || !glyph) return
    direction = direction === 1 ? -1 : 1
    // Clicks the control itself, so a Pokémon seat counts damage on whichever Pokémon it shows.
    // Pokémon seats redraw on each change, so the control is found again at the press.
    const press = () => {
      if (!showing()) return
      board.querySelector<HTMLElement>(selector)?.click()
      const hit = board.querySelector<HTMLElement>(selector)
      hit?.classList.add("pressed")
      window.setTimeout(() => hit?.classList.remove("pressed"), PRESS_MS)
    }
    if (prefersReducedMotion.matches) return press()
    showTapHint(glyph)
    pending = window.setTimeout(press, HINT_PRESS_MS)
  }
  const timer = window.setInterval(tap, DEMO_TAP_MS)
  const stopTaps = () => {
    window.clearInterval(timer)
    window.clearTimeout(pending)
  }
  stage.addEventListener("click", (event) => {
    if (event.isTrusted && (event.target as Element).closest(".hit, [data-pk], [data-calc]"))
      stopTaps()
  })
  // The demo step's rewind replays a visitor's tap as a script click, so it says so itself.
  stage.addEventListener(VISITOR_TAP, stopTaps)
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
