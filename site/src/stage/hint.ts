// A ghostly hand that shows visitors where to tap: it glides in, presses one spot any number of
// times, and drifts away. The demos time their changes to its presses.

// From when the hand appears to its first press.
export const HINT_PRESS_MS = 550
// From the last press to when the hand has gone.
const HINT_LEAVE_MS = 450
// The hand reaches up and in on screen at this angle, whichever way its seat faces. Too close
// to the bottom of the screen for the hand, it reaches down from above instead.
const HINT_ANGLE = { up: 45, down: 135 }
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
const INTO_PRESS = "cubic-bezier(0.55, 0, 1, 0.45)"

// Tabler's hand-click (MIT). `tip` is the fingertip as a fraction of the box. The tap lines are
// grouped so they can burst out from the fingertip on each press.
const HAND = {
  tip: [0.396, 0.125],
  svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13v-8.5a1.5 1.5 0 0 1 3 0v7.5"/><path d="M11 11.5v-2a1.5 1.5 0 0 1 3 0v2.5"/><path d="M14 10.5a1.5 1.5 0 0 1 3 0v1.5"/><path d="M17 11.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7l-.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"/><g class="tap-lines" style="transform-origin:9.5px 3px"><path d="M5 3l-1 -1"/><path d="M4 7h-1"/><path d="M14 3l1 -1"/><path d="M15 6h1"/></g></svg>',
} as const

type Point = { x: number; y: number }

export const center = (el: Element): Point => {
  const box = el.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

// The angle of a seat's own x axis on screen, from − to +, including every rotation above it.
export function seatAxis(seat: Element) {
  const minus = seat.querySelector(".glyph.minus")
  const plus = seat.querySelector(".glyph.plus")
  if (!minus || !plus) return
  const [from, to] = [center(minus), center(plus)]
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
}

// Where a point on screen falls in the seat's own unrotated, unscaled layout. The − and +
// glyphs give the seat's angle and scale on screen; turning and scaling keep its center put.
function toSeat(seatIn: HTMLElement, point: Point, axis: number) {
  const glyphs = [...seatIn.querySelectorAll<HTMLElement>(".glyph")]
  const [minus, plus] = glyphs
  if (!minus || !plus) return
  const span = Math.hypot(center(plus).x - center(minus).x, center(plus).y - center(minus).y)
  const scale =
    span / (plus.offsetLeft - minus.offsetLeft + (plus.offsetWidth - minus.offsetWidth) / 2)
  const middle = center(seatIn)
  const [dx, dy] = [(point.x - middle.x) / scale, (point.y - middle.y) / scale]
  const turn = (-axis * Math.PI) / 180
  return {
    x: seatIn.offsetWidth / 2 + dx * Math.cos(turn) - dy * Math.sin(turn),
    y: seatIn.offsetHeight / 2 + dx * Math.sin(turn) + dy * Math.cos(turn),
    scale,
  }
}

// Keyframes for one hand visit, with offsets as fractions of `total`.
function handFrames(presses: number, every: number, total: number): Keyframe[] {
  const at = (ms: number) => ms / total
  const pose = (lift: number, size: number) => `translateY(${lift}%) scale(${size})`
  const frames: Keyframe[] = [
    { offset: 0, opacity: 0, transform: pose(28, 1.06), easing: EASE },
    {
      offset: at(HINT_PRESS_MS * 0.68),
      opacity: 0.85,
      transform: pose(14, 1.06),
      easing: INTO_PRESS,
    },
  ]
  for (let press = 0; press < presses; press++) {
    const down = HINT_PRESS_MS + press * every
    frames.push({ offset: at(down), opacity: 0.9, transform: pose(0, 0.9), easing: EASE })
    if (press < presses - 1)
      frames.push({
        offset: at(down + every / 2),
        opacity: 0.9,
        transform: pose(7, 1),
        easing: INTO_PRESS,
      })
  }
  const last = HINT_PRESS_MS + (presses - 1) * every
  frames.push(
    { offset: at(last + 90), opacity: 0.9, transform: pose(2, 0.93) },
    {
      offset: at(last + 180),
      opacity: 0.9,
      transform: pose(2, 0.93),
      easing: "cubic-bezier(0.4, 0, 0.7, 1)",
    },
    { offset: 1, opacity: 0, transform: pose(16, 1.02) },
  )
  return frames
}

// The tap lines burst out from the fingertip on each press and fade before the next.
function lineFrames(presses: number, every: number, total: number): Keyframe[] {
  const at = (ms: number) => ms / total
  const hidden = { opacity: 0, transform: "scale(0.4)" }
  const frames: Keyframe[] = [{ offset: 0, ...hidden }]
  for (let press = 0; press < presses; press++) {
    const down = HINT_PRESS_MS + press * every
    frames.push(
      { offset: at(down), ...hidden, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
      { offset: at(down + 70), opacity: 1, transform: "scale(1.25)" },
      { offset: at(down + 180), opacity: 1, transform: "scale(1.1)" },
      { offset: at(down + Math.min(every - 20, 360)), opacity: 0, transform: "scale(1.2)" },
    )
  }
  frames.push({ offset: 1, opacity: 0, transform: "scale(1.2)" })
  return frames
}

// Shows the hand pressing `target`, a part of a seat, `presses` times `every` ms apart. The first
// press lands HINT_PRESS_MS from now. The hand lives in the seat's own layout so it stays put as
// the page scrolls, but its angle is set on screen: it reaches up and to the right, or mirrored
// on the left half of the phone, so its wrist never hangs off the screen's side edge.
export function showTapHint(target: Element, { presses = 1, every = 300 } = {}) {
  const seat = target.closest(".seat")
  const seatIn = target.closest<HTMLElement>(".seat-in")
  const screen = target.closest(".screen")
  const axis = seat ? seatAxis(seat) : undefined
  if (!seat || !seatIn || !screen || axis === undefined) return
  const spot = center(target)
  const local = toSeat(seatIn, spot, axis)
  if (!local) return
  const mirror = spot.x < center(screen).x
  const [x, y] = HAND.tip
  seat.querySelector(".tap-hint")?.remove()
  const hint = document.createElement("span")
  hint.className = "tap-hint"
  hint.setAttribute("aria-hidden", "true")
  hint.innerHTML = HAND.svg
  hint.style.left = `${local.x}px`
  hint.style.top = `${local.y}px`
  hint.style.setProperty("--tip-x", String(x))
  hint.style.setProperty("--tip-y", String(y))
  seatIn.append(hint)
  // How far the hand hangs below the fingertip when it leans the usual way.
  const drop = hint.offsetHeight * local.scale * Math.cos((HINT_ANGLE.up * Math.PI) / 180)
  const lean =
    screen.getBoundingClientRect().bottom - spot.y < drop ? HINT_ANGLE.down : HINT_ANGLE.up
  hint.style.rotate = `${(mirror ? -lean : lean) - axis}deg`
  if (mirror) hint.style.scale = "-1 1"
  const total = HINT_PRESS_MS + (presses - 1) * every + HINT_LEAVE_MS
  hint.animate(handFrames(presses, every, total), total).finished.then(
    () => hint.remove(),
    () => {},
  )
  hint.querySelector(".tap-lines")?.animate(lineFrames(presses, every, total), total)
}
