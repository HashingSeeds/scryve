import { Easing } from "react-native-reanimated"

/** why: an attack plays these beats in order and ending it plays them backwards: the attacker's life tucks into its corner, its blades fan out of its mark, then they fly as the shadow spreads, each landing as the shadow reaches its defender. */
export const COMMANDER_BEATS = {
  tuck: 300,
  fan: 325,
  flood: 1190,
  // why: blades fly this long only when a defender has no shadow to ride.
  flight: 525,
  hold: 75,
}

const FLOOD_CURVE = [0.45, 0.05, 0.25, 1] as const
export const FLOOD_EASING = Easing.bezier(...FLOOD_CURVE)
// why: the drain is the flood's curve played backwards, so the shadow leaves each seat when it had reached it.
export const DRAIN_EASING = Easing.bezier(
  1 - FLOOD_CURVE[2],
  1 - FLOOD_CURVE[3],
  1 - FLOOD_CURVE[0],
  1 - FLOOD_CURVE[1],
)

const cubic = (a: number, b: number, s: number) =>
  3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s

/** why: the share of the flood's time the shadow takes to grow `share` of its way. */
export function floodTimeAt(share: number) {
  const [x1, y1, x2, y2] = FLOOD_CURVE
  let low = 0
  let high = 1
  for (let step = 0; step < 24; step++) {
    const mid = (low + high) / 2
    if (cubic(y1, y2, mid) < share) low = mid
    else high = mid
  }
  return cubic(x1, x2, (low + high) / 2)
}
