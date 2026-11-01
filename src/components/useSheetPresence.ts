import { useRef, useState } from "react"

// why: iOS refuses to present anything while a sheet is still leaving, and unmounting one skips its exit.
export function useSheetPresence<T>(
  requested: T | undefined,
  isSheet: (value: T) => boolean = () => true,
) {
  const [shown, setShown] = useState(requested)
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)
  const latest = useRef(requested)
  latest.current = requested
  // why: a sheet that unmounts mid-render reports through the onDismissed from the render before.
  const leavingNow = useRef(leaving)
  leavingNow.current = leaving
  if (!leaving && !Object.is(requested, shown)) {
    if (shown !== undefined && isSheet(shown) && !gone) setLeaving(true)
    else {
      setShown(requested)
      setGone(false)
    }
  }
  return {
    shown,
    visible: !leaving,
    onDismissed: () => {
      if (!leavingNow.current) return setGone(true)
      setLeaving(false)
      setShown(latest.current)
    },
  }
}
