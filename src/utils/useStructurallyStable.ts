import { useState } from "react"

import { structurallyEqual } from "./structurallyEqual"

export function useStructurallyStable<Value>(value: Value): Value {
  const [stable, setStable] = useState(() => value)
  const changed = !structurallyEqual(stable, value)
  if (changed) setStable(() => value)
  return changed ? value : stable
}
