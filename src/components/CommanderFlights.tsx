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
import { Pressable, StyleSheet, View, type TextStyle, type ViewStyle } from "react-native"
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated"

import { useReducedMotion } from "@/utils/useReducedMotion"

import {
  commanderBeats,
  commanderTempo,
  floodTimeAt,
  setCommanderTempo,
  TEMPOS,
} from "./commanderBeats"
import { Sword } from "./Sword"
import { Text } from "./Text"

// why: worklets read these, so they are declared before the code that uses them.
const FAN_SPREAD = 40
const FAN_REACH = 26
const BLADE = 32
const SETTLE_MS = 100

type Point = { x: number; y: number }
type Spot = Point & { size: number }
type AnchorKind = "home" | "landing"

type Flights = {
  /** why: a ref for the spot a blade leaves from (the attacker's sword) or lands on (a defender's strike), by seat. */
  anchor: (kind: AnchorKind, seat: number) => (node: View | null) => void
  /** why: a defender says how far the shadow grows before it reaches its disc, so its blade lands then. */
  arrive: (seat: number, share: number) => void
  /** why: seats whose strike waits for its blade, so it shows once the blade lands. */
  inbound: ReadonlySet<number>
  /** why: the attacker whose blades have not left its sword yet, so it keeps showing the sword until they cover it. */
  waiting: number | null
  /** why: the seat whose blades are flying home, so its sword shows once they meet. */
  homeBound: number | null
}

const NOWHERE = new Set<number>()
const FlightsContext = createContext<Flights>({
  anchor: () => () => {},
  arrive: () => {},
  inbound: NOWHERE,
  waiting: null,
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
  // why: the blade lands at the size of the strike's own sword.
  landed: number
  // why: the blade leaves at the size of the sword it comes from, small when that sword is inside a mark.
  start: number
  // why: the blade waits at home while the attacker's life tucks away, fans out, then flies from `go` for `flight`.
  lead: number
  fan: number
  go: number
  flight: number
  end: number
  delay: number
  // why: how long after the shadow's clock started this blade mounted.
  skew: number
  back: boolean
}

/** why: when a seat arms, its sword splits into one blade per defender, each fanning out of the mark and then flying to the sword beside that seat's disc, turning to face each reader as it travels; Done plays the same flight backwards, so every blade comes home together. `rotationOf` gives a seat's content rotation on the screen. */
export function CommanderFlights({
  attacker,
  rotationOf,
  color,
  homeColor,
  children,
}: {
  attacker: number | null
  rotationOf: (seat: number) => number
  color: string
  /** why: the sword in the attacker's mark is cut out in this color, so blades start and end looking like it. */
  homeColor?: string
  children: ReactNode
}) {
  const reducedMotion = useReducedMotion()
  const frame = useRef<View>(null)
  const nodes = useRef({ home: new Map<number, View>(), landing: new Map<number, View>() })
  const refs = useRef(new Map<string, (node: View | null) => void>())
  const [blades, setBlades] = useState<readonly Blade[]>([])
  const [inbound, setInbound] = useState<ReadonlySet<number>>(NOWHERE)
  // why: the seat whose sword has left its mark, set as its blades take over from it and cleared as they land back on it.
  const [out, setOut] = useState<number | null>(null)
  const flight = useRef(0)
  const flying = useRef(0)
  // why: a team zone's check unmounts on Done, so its blades fly home to where they left from.
  const homes = useRef(new Map<number, Spot>())
  const arrivals = useRef(new Map<number, number>())
  const arrive = useCallback((seat: number, share: number) => {
    arrivals.current.set(seat, share)
  }, [])
  const latest = useRef({ rotationOf, color, homeColor })
  useEffect(() => {
    latest.current = { rotationOf, color, homeColor }
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

  const [shownColor, setShownColor] = useState({ blade: color, home: homeColor })
  const previous = useRef(attacker)
  useEffect(() => {
    const before = previous.current
    previous.current = attacker
    if (before === attacker) return
    const run = ++flight.current
    setBlades([])
    setInbound(NOWHERE)
    const seat = attacker ?? before
    if (reducedMotion !== false || seat === null) {
      setOut(attacker)
      return
    }
    const back = attacker === null
    if (!back) setShownColor({ blade: latest.current.color, home: latest.current.homeColor })
    // why: the shadow's clock starts in this commit, so blades that mount a few frames later start that far along.
    const started = performance.now()
    // why: the defenders' strikes lay out in the commit that arms the attack, so the plan reads them a frame later.
    const frameId = requestAnimationFrame(() => {
      void measureAll(frame.current, seat, nodes.current, homes.current.get(seat)).then((spots) => {
        if (run !== flight.current) return
        if (spots) homes.current.set(seat, spots.home)
        const skew = performance.now() - started
        const planned = spots
          ? plan(spots, seat, latest.current.rotationOf, back, arrivals.current).map((blade) => ({
              ...blade,
              skew,
            }))
          : []
        // why: the mark swaps in the same commit the blades appear over it, so the swap hides under them.
        setOut(planned.length || !back ? seat : null)
        flying.current = planned.length
        setBlades(planned)
        if (planned.length) setInbound(new Set(planned.map(({ seat: landing }) => landing)))
      })
    })
    return () => cancelAnimationFrame(frameId)
  }, [attacker, reducedMotion])

  // why: the sword a blade lands on shows first and the blade lifts off it a few frames later, so the handover never shows a gap.
  const landed = useCallback((seat: number, back: boolean) => {
    const run = flight.current
    flying.current -= 1
    if (back && !flying.current) setOut(null)
    if (!back)
      setInbound((current) => {
        const left = new Set(current)
        left.delete(seat)
        return left
      })
    setTimeout(() => {
      if (run === flight.current)
        setBlades((current) => current.filter((blade) => blade.seat !== seat))
    }, SETTLE_MS)
  }, [])

  const waiting = attacker !== null && out !== attacker ? attacker : null
  const homeBound = out !== null && out !== attacker ? out : null
  const value = useMemo(
    () => ({ anchor, arrive, inbound, waiting, homeBound }),
    [anchor, arrive, inbound, waiting, homeBound],
  )
  return (
    <FlightsContext.Provider value={value}>
      <View ref={frame} style={$frame} collapsable={false}>
        {children}
        <View pointerEvents="none" style={$layer}>
          {blades.map((blade) => (
            <FlyingBlade
              key={`${blade.seat}:${blade.back}`}
              blade={blade}
              color={shownColor.blade}
              homeColor={shownColor.home}
              onLanded={landed}
            />
          ))}
        </View>
        {__DEV__ ? <TempoSwitch /> : null}
      </View>
    </FlightsContext.Provider>
  )
}

function TempoSwitch() {
  const [tempo, setTempo] = useState(commanderTempo)
  return (
    <Pressable
      testID="commander-tempo-switch"
      onPress={() => {
        const next = TEMPOS[(TEMPOS.indexOf(tempo) + 1) % TEMPOS.length]
        setCommanderTempo(next)
        setTempo(next)
      }}
      style={$tempoSwitch}
    >
      <Text text={`Tempo ${tempo}x`} style={$tempoText} />
    </Pressable>
  )
}

type Spots = { home: Spot; landings: Map<number, Spot> }

function measureCenter(node: View) {
  return new Promise<Spot | null>((resolve) =>
    node.measureInWindow((x, y, width, height) =>
      resolve(
        width || height
          ? { x: x + width / 2, y: y + height / 2, size: Math.max(width, height) }
          : null,
      ),
    ),
  )
}

async function measureAll(
  frame: View | null,
  seat: number,
  nodes: { home: Map<number, View>; landing: Map<number, View> },
  lastHome?: Spot,
): Promise<Spots | null> {
  const home = nodes.home.get(seat)
  if (!frame || (!home && !lastHome)) return null
  const origin = await new Promise<Point>((resolve) =>
    frame.measureInWindow((x, y) => resolve({ x, y })),
  )
  const local = <At extends Point>(point: At | null) =>
    point ? { ...point, x: point.x - origin.x, y: point.y - origin.y } : null
  const homeAt = (home && local(await measureCenter(home))) ?? lastHome
  if (!homeAt) return null
  const landings = new Map<number, Spot>()
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
  arrivals: ReadonlyMap<number, number>,
): Blade[] {
  const { tuck, fan, flood, flight, hold } = commanderBeats()
  const from = rotationOf(seat)
  const rides = [...landings.keys()].every((landing) => arrivals.has(landing))
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
    // why: blades leave the fan together as the shadow sets off, each flying until the shadow reaches its defender.
    const share = arrivals.get(landing)
    const go = rides ? tuck + fan : tuck + fan + hold + reach * 0.25
    const flies = rides && share !== undefined ? Math.max(1, flood * floodTimeAt(share)) : flight
    const ahead = toward(tilt, aim)
    return {
      seat: landing,
      home,
      out: {
        x: home.x + FAN_REACH * Math.sin(radians),
        y: home.y - FAN_REACH * Math.cos(radians),
      },
      to,
      from,
      tilt,
      ahead,
      // why: the landed blade lies across the defender's view, pointing at its disc.
      land: toward(ahead, rotationOf(landing) + 90),
      landed: to.size / BLADE,
      start: Math.min(1, home.size / BLADE),
      lead: tuck,
      fan,
      go,
      flight: flies,
      end: go + flies,
      delay: 0,
      skew: 0,
      back,
    }
  })
  // why: backwards, the shadow drains from the start, so every blade leaves its defender as the shadow does and all reach home together.
  const whole = rides ? tuck + fan + flood : Math.max(...blades.map(({ end }) => end))
  return back ? blades.map((blade) => ({ ...blade, delay: whole - blade.end })) : blades
}

function FlyingBlade({
  blade,
  color,
  homeColor,
  onLanded,
}: {
  blade: Blade
  color: string
  homeColor?: string
  onLanded: (seat: number, back: boolean) => void
}) {
  const { back, end, delay, seat, skew } = blade
  const first = back ? end : Math.min(skew, end)
  const t = useSharedValue(first)
  useEffect(() => {
    const done = (finished?: boolean) => {
      "worklet"
      if (finished) runOnJS(onLanded)(seat, back)
    }
    const wait = back ? Math.max(0, delay - skew) : 0
    const duration = back ? end : end - first
    t.value = withDelay(wait, withTiming(back ? 0 : end, { duration, easing: Easing.linear }, done))
  }, [back, delay, end, first, onLanded, seat, skew, t])
  const style = useAnimatedStyle(() => {
    const { home, out, to, from, tilt, ahead, land, landed, start, lead, fan, go, flight } = blade
    const now = t.value
    let point = home
    let angle = from
    let scale = start
    if (now <= lead) {
      // why: the blade rests as the sword in the mark while the attacker's life tucks away.
    } else if (now <= lead + fan) {
      const k = splay((now - lead) / fan)
      point = { x: home.x + (out.x - home.x) * k, y: home.y + (out.y - home.y) * k }
      angle = from + (tilt - from) * k
      scale = start + (1 - start) * Math.min(1, k)
    } else if (now <= go) {
      point = out
      angle = tilt
      scale = 1
    } else {
      const k = Math.min(1, (now - go) / flight)
      const travel = glide(k)
      point = { x: out.x + (to.x - out.x) * travel, y: out.y + (to.y - out.y) * travel }
      angle =
        k < 0.5 ? tilt + (ahead - tilt) * easeOut(k * 2) : ahead + (land - ahead) * (k * 2 - 1)
      scale = 1 + (landed - 1) * k
    }
    return {
      transform: [
        { translateX: point.x - BLADE / 2 },
        { translateY: point.y - BLADE / 2 },
        { rotate: `${angle}deg` },
        { scale },
      ],
    }
  })
  // why: each blade starts as the sword cut into the mark and takes the strike color as it fans out; home, it turns back.
  const homeStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, Math.max(0, (t.value - blade.lead) / blade.fan)),
  }))
  return (
    <Animated.View testID={`commander-blade-seat-${seat}`} style={[$blade, style]}>
      <Sword size={BLADE} color={color} />
      {homeColor ? (
        <Animated.View style={[StyleSheet.absoluteFill, homeStyle]}>
          <Sword size={BLADE} color={homeColor} />
        </Animated.View>
      ) : null}
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
const $tempoSwitch: ViewStyle = {
  position: "absolute",
  top: 56,
  alignSelf: "center",
  zIndex: 60,
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 999,
  backgroundColor: "rgba(0,0,0,0.8)",
}
const $tempoText: TextStyle = { color: "#fff", fontSize: 14, fontWeight: "700" }
const $blade: ViewStyle = { position: "absolute", left: 0, top: 0, width: BLADE, height: BLADE }
