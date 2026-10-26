import { useSyncExternalStore } from "react"
import { addHingeListener, getHinge, isAvailable } from "expo-hinge"

import { usePretendDuo } from "@/devtools/pretendDuo"

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

// why: hinge angles stream in while a device folds, and the whole board would re-render for each one; this snapshot only changes when the window starts or stops spanning the fold.
export function useWindowSpansHinge() {
  const spans = useSyncExternalStore(subscribe, spansHinge, spansHinge)
  return usePretendDuo() || spans
}
