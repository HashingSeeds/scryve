import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from "react"
import type { View } from "react-native"
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller"
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated"

type Lift = {
  /** why: the owner is whoever focused a field last, so a closing sheet only clears its own lift. */
  raise: (owner: object, bottom: number) => void
  clear: (owner: object) => void
}

const BoardKeyboardLiftContext = createContext<Lift | null>(null)

/**
 * why: a seat is about half the screen and the keyboard covers most of a bottom seat, so a sheet typing into the catalog lifts the whole board until that seat's bottom edge clears the keyboard. Only an upright board lifts: while the window is turned, the board measures as if upright and the keyboard rises along another edge.
 */
export function BoardKeyboardLift({
  enabled,
  boardHeight,
  children,
}: {
  enabled: boolean
  boardHeight: number
  children: ReactNode
}) {
  const { height: keyboard } = useReanimatedKeyboardAnimation()
  const bottom = useSharedValue(0)
  const owner = useRef<object>(null)
  const lifted = useDerivedValue(() => {
    // why: keyboard height runs from 0 to minus the keyboard height as it opens.
    const covered = enabled && bottom.value > 0 ? bottom.value - (boardHeight + keyboard.value) : 0
    return Math.max(0, covered)
  })
  const lift = useRef<Lift>({
    // why: a seat measured while the board is already lifted reads high by the lift.
    raise: (next, measuredBottom) => {
      owner.current = next
      bottom.value = measuredBottom + lifted.value
    },
    clear: (previous) => {
      if (owner.current !== previous) return
      owner.current = null
      bottom.value = 0
    },
  }).current
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -lifted.value }] }))

  return (
    <BoardKeyboardLiftContext.Provider value={lift}>
      <Animated.View collapsable={false} style={[$fill, style]}>
        {children}
      </Animated.View>
    </BoardKeyboardLiftContext.Provider>
  )
}

/** why: returns a focus handler for the seat's fields; it measures the seat and lifts the board while the sheet stays open. */
export function useBoardKeyboardLift(seat: RefObject<View | null>): () => void {
  const lift = useContext(BoardKeyboardLiftContext)
  const owner = useRef({}).current
  useEffect(() => () => lift?.clear(owner), [lift, owner])
  return () => {
    seat.current?.measureInWindow((_x, y, _width, height) => {
      if (height > 0) lift?.raise(owner, y + height)
    })
  }
}

const $fill = { flex: 1 } as const
