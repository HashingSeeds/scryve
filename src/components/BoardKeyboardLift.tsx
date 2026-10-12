import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { KeyboardAvoidingView } from "react-native-keyboard-controller"

type SetLift = (owner: object, on: boolean) => void

const BoardKeyboardLiftContext = createContext<SetLift>(() => {})

/**
 * why: a seat is about half the screen and the keyboard covers most of a bottom seat, so while a bottom seat's sheet has a field focused the whole board rides above the keyboard. Only an upright board lifts: while the window is turned, the keyboard rises along another board edge.
 */
export function BoardKeyboardLift({
  enabled,
  bottomInset,
  children,
}: {
  enabled: boolean
  /** why: a seat on the screen's bottom edge squares its corners into the rounded screen corners; that strip stays tucked under the keyboard instead of showing square corners above it. */
  bottomInset: number
  children: ReactNode
}) {
  const [owner, setOwner] = useState<object | null>(null)
  // why: the owner is whichever sheet asked last, so a closing sheet only drops its own lift.
  const setLift = useRef<SetLift>((next, on) =>
    setOwner((current) => (on ? next : current === next ? null : current)),
  ).current

  return (
    <BoardKeyboardLiftContext.Provider value={setLift}>
      <KeyboardAvoidingView
        behavior="position"
        enabled={enabled && owner !== null}
        keyboardVerticalOffset={-bottomInset}
        style={$fill}
        contentContainerStyle={$fill}
      >
        {children}
      </KeyboardAvoidingView>
    </BoardKeyboardLiftContext.Provider>
  )
}

/** why: returns a focus handler for a sheet's fields; a seat on the bottom edge lifts the board until the sheet closes. */
export function useBoardKeyboardLift(lifts: boolean): () => void {
  const setLift = useContext(BoardKeyboardLiftContext)
  const owner = useRef({}).current
  useEffect(() => () => setLift(owner, false), [setLift, owner])
  return () => setLift(owner, lifts)
}

const $fill = { flex: 1 } as const
