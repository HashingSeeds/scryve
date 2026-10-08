import { useState } from "react"

import { structurallyEqual } from "./structurallyEqual"

/** why: derived data is rebuilt on every render; returning the previous value while it is structurally equal lets memoized children and context consumers skip those renders. */
export function useStructurallyStable<Value>(value: Value): Value {
  const [stable, setStable] = useState(() => value)
  const changed = !structurallyEqual(stable, value)
  if (changed) setStable(() => value)
  return changed ? value : stable
}
