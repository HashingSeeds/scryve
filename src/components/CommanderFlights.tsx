import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { StyleSheet, View, type ViewStyle } from "react-native"
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated"

import { useReducedMotion } from "@/utils/useReducedMotion"

import { Sword } from "./Sword"

// why: worklets read these, so they are declared before the code that uses them.
const FAN_MS = 260
const FLIGHT_MS = 420
const FAN_SPREAD = 40
const FAN_REACH = 26
const BLADE = 32
const LANDED_SCALE = 34 / 32

type Point = { x: number; y: number }
type AnchorKind = "home" | "landing"

type Flights = {
  /** why: a ref for the spot a blade leaves from (the attacker's sword) or lands on (a defender's strike), by seat. */
  anchor: (kind: AnchorKind, seat: number) => (node: View | null) => void
  /** why: seats whose strike waits for its blade, so it shows once the blade lands. */
  inbound: ReadonlySet<number>
  /** why: the seat whose blades are flying home, so its sword shows once they meet. */
  homeBound: number | null
}

const NOWHERE = new Set<number>()
const FlightsContext = createContext<Flights>({
  anchor: () => () => {},
  inbound: NOWHERE,
  homeBound: null,
})

export const useCommanderFlights = () => useContext(FlightsContext)

type Blade = {
  seat: number
  home: Point
  out: Point
  to: Point
  from: number
  tilt: number
  ahead: number
  land: number
  go: number
  end: number
  delay: number
  back: boolean
}

/** why: when a seat arms, its sword splits into one blade per defender, each fanning out where it rests and then flying to the sword beside that seat's disc, turning to face each reader as it travels; Done plays the same flight backwards, so every blade comes home together. `rotationOf` gives a seat's content rotation on the screen. */
export function CommanderFlights({
  attacker,
  rotationOf,
  color,
  children,
}: {
  attacker: number | null
  rotationOf: (seat: number) => number
  color: string
  children: ReactNode
}) {
  const reducedMotion = useReducedMotion()
  const frame = useRef<View>(null)
  const nodes = useRef({ home: new Map<number, View>(), landing: new Map<number, View>() })
  const refs = useRef(new Map<string, (node: View | null) => void>())
  const [blades, setBlades] = useState<readonly Blade[]>([])
  const [inbound, setInbound] = useState<ReadonlySet<number>>(NOWHERE)
  const [homeBound, setHomeBound] = useState<number | null>(null)
  const flight = useRef(0)
  const latest = useRef({ rotationOf, color })
  useEffect(() => {
    latest.current = { rotationOf, color }
  })

  const anchor = useCallback((kind: AnchorKind, seat: number) => {
    const key = `${kind}:${seat}`
    const known = refs.current.get(key)
    if (known) return known
    const ref = (node: View | null) => {
      if (node) nodes.current[kind].set(seat, node)
      else nodes.current[kind].delete(seat)
    }
    refs.current.set(key, ref)
    return ref
  }, [])

  const [shownColor, setShownColor] = useState(color)
  const previous = useRef(attacker)
  useEffect(() => {
    const before = previous.current
    previous.current = attacker
    if (before === attacker) return
    const run = ++flight.current
    setBlades([])
    setInbound(NOWHERE)
    setHomeBound(null)
    if (reducedMotion !== false) return
    const seat = attacker ?? before
    if (seat === null) return
    const back = attacker === null
    if (!back) setShownColor(latest.current.color)
    // why: the defenders' strikes lay out in the commit that arms the attack, so the plan reads them a frame later.
    const frameId = requestAnimationFrame(() => {
      void measureAll(frame.current, seat, nodes.current).then((spots) => {
        if (!spots || run !== flight.current) return
        const planned = plan(spots, seat, latest.current.rotationOf, back)
        if (!planned.length) return
        setBlades(planned)
        setInbound(new Set(planned.map(({ seat: landing }) => landing)))
        if (back) setHomeBound(seat)
      })
    })
    return () => cancelAnimationFrame(frameId)
  }, [attacker, reducedMotion])

  const landed = useCallback((seat: number, back: boolean) => {
    setBlades((current) => {
      const left = current.filter((blade) => blade.seat !== seat)
      if (back && !left.length) setHomeBound(null)
      return left
    })
    if (!back)
      setInbound((current) => {
        const left = new Set(current)
        left.delete(seat)
        return left
      })
  }, [])

  const value = useMemo(() => ({ anchor, inbound, homeBound }), [anchor, inbound, homeBound])
  return (
    <FlightsContext.Provider value={value}>
      <View ref={frame} style={$frame} collapsable={false}>
        {children}
        <View pointerEvents="none" style={$layer}>
          {blades.map((blade) => (
            <FlyingBlade
              key={`${blade.seat}:${blade.back}`}
              blade={blade}
              color={shownColor}
              onLanded={landed}
            />
          ))}
        </View>
      </View>
    </FlightsContext.Provider>
  )
}

type Spots = { home: Point; landings: Map<number, Point> }

function measureCenter(node: View) {
  return new Promise<Point | null>((resolve) =>
    node.measureInWindow((x, y, width, height) =>
      resolve(width || height ? { x: x + width / 2, y: y + height / 2 } : null),
    ),
  )
}

async function measureAll(
  frame: View | null,
  seat: number,
  nodes: { home: Map<number, View>; landing: Map<number, View> },
): Promise<Spots | null> {
  const home = nodes.home.get(seat)
  if (!frame || !home) return null
  const origin = await new Promise<Point>((resolve) =>
    frame.measureInWindow((x, y) => resolve({ x, y })),
  )
  const local = (point: Point | null) =>
    point ? { x: point.x - origin.x, y: point.y - origin.y } : null
  const homeAt = local(await measureCenter(home))
  if (!homeAt) return null
  const landings = new Map<number, Point>()
  for (const [landing, node] of nodes.landing) {
    if (landing === seat) continue
    const at = local(await measureCenter(node))
    if (at) landings.set(landing, at)
  }
  return { home: homeAt, landings }
}

// why: degrees clockwise from straight up, from one point toward another.
const bearing = (from: Point, to: Point) =>
  (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI
// why: the same angle as `to`, written the short way round from `from`.
const toward = (from: number, to: number) => from + ((((to - from) % 360) + 540) % 360) - 180

function plan(
  { home, landings }: Spots,
  seat: number,
  rotationOf: (seat: number) => number,
  back: boolean,
): Blade[] {
  const from = rotationOf(seat)
  const aimed = [...landings].map(([landing, to]) => ({
    seat: landing,
    to,
    reach: Math.hypot(to.x - home.x, to.y - home.y),
    aim: toward(from, bearing(home, to)),
  }))
  aimed.sort((a, b) => a.aim - b.aim)
  // why: each blade leans at its own defender, but neighbours open at least FAN_SPREAD degrees so the fan reads as one blade each.
  const leans: number[] = []
  aimed.forEach(({ aim }, index) =>
    leans.push(index ? Math.max(aim, leans[index - 1] + FAN_SPREAD) : aim),
  )
  const drift = leans.reduce((sum, lean, index) => sum + lean - aimed[index].aim, 0) / aimed.length
  const blades = aimed.map(({ seat: landing, to, reach, aim }, index) => {
    const tilt = toward(from, leans[index] - drift)
    const radians = (tilt * Math.PI) / 180
    const go = FAN_MS + 60 + reach * 0.25
    const ahead = toward(tilt, aim)
    return {
      seat: landing,
      home,
      out: { x: home.x + FAN_REACH * Math.sin(radians), y: home.y - FAN_REACH * Math.cos(radians) },
      to,
      from,
      tilt,
      ahead,
      // why: the landed blade lies across the defender's view, pointing at its disc.
      land: toward(ahead, rotationOf(landing) + 90),
      go,
      end: go + FLIGHT_MS,
      delay: 0,
      back,
    }
  })
  const whole = Math.max(...blades.map(({ end }) => end))
  // why: backwards, every blade starts so that all of them reach home together.
  return back ? blades.map((blade) => ({ ...blade, delay: whole - blade.end })) : blades
}

function FlyingBlade({
  blade,
  color,
  onLanded,
}: {
  blade: Blade
  color: string
  onLanded: (seat: number, back: boolean) => void
}) {
  const { back, end, delay, seat } = blade
  const t = useSharedValue(back ? end : 0)
  useEffect(() => {
    const done = (finished?: boolean) => {
      "worklet"
      if (finished) runOnJS(onLanded)(seat, back)
    }
    t.value = withDelay(
      delay,
      withTiming(back ? 0 : end, { duration: end, easing: Easing.linear }, done),
    )
  }, [back, delay, end, onLanded, seat, t])
  const style = useAnimatedStyle(() => {
    const { home, out, to, from, tilt, ahead, land, go } = blade
    const now = t.value
    let point = home
    let angle = from
    let scale = 1
    if (now <= FAN_MS) {
      const k = splay(now / FAN_MS)
      point = { x: home.x + (out.x - home.x) * k, y: home.y + (out.y - home.y) * k }
      angle = from + (tilt - from) * k
    } else if (now <= go) {
      point = out
      angle = tilt
    } else {
      const k = Math.min(1, (now - go) / FLIGHT_MS)
      const travel = glide(k)
      point = { x: out.x + (to.x - out.x) * travel, y: out.y + (to.y - out.y) * travel }
      angle =
        k < 0.5 ? tilt + (ahead - tilt) * easeOut(k * 2) : ahead + (land - ahead) * (k * 2 - 1)
      scale = 1 + (LANDED_SCALE - 1) * k
    }
    return {
      opacity: Math.min(1, now / (end * 0.12)),
      transform: [
        { translateX: point.x - BLADE / 2 },
        { translateY: point.y - BLADE / 2 },
        { rotate: `${angle}deg` },
        { scale },
      ],
    }
  })
  return (
    <Animated.View testID={`commander-blade-seat-${seat}`} style={[$blade, style]}>
      <Sword size={BLADE} color={color} />
    </Animated.View>
  )
}

function splay(k: number) {
  "worklet"
  // why: an ease out that overshoots a little, so each blade snaps open.
  const c = 1.4
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2)
}

function glide(k: number) {
  "worklet"
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
}

function easeOut(k: number) {
  "worklet"
  return 1 - (1 - k) * (1 - k)
}

const $frame: ViewStyle = { flex: 1 }
const $layer: ViewStyle = { ...StyleSheet.absoluteFill, zIndex: 50 }
const $blade: ViewStyle = { position: "absolute", left: 0, top: 0, width: BLADE, height: BLADE }
