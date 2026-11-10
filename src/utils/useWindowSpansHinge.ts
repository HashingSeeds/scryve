import { useSyncExternalStore } from "react"
import { addHingeListener, getHinge, isAvailable } from "expo-hinge"

const available = isAvailable()

const subscribe = (onChange: () => void) => {
  if (!available) return () => {}
  const subscription = addHingeListener(onChange)
  return () => subscription.remove()
}

const spansHinge = () => {
  const status = available ? getHinge()?.status : undefined
  return status === "fullyOpen" || status === "partiallyOpen"
}

// why: hinge angles stream in while folding and would rerender the whole board; this changes only when spanning starts or stops.
export const useWindowSpansHinge = () => useSyncExternalStore(subscribe, spansHinge, spansHinge)
