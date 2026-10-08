/** why: memoized components get freshly built plain props each render; comparing arrays and plain objects by content (functions and instances by identity) lets equal props skip the render. */
export function structurallyEqual(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true
  if (Array.isArray(previous) && Array.isArray(next))
    return (
      previous.length === next.length &&
      previous.every((item, index) => structurallyEqual(item, next[index]))
    )
  if (!isPlainObject(previous) || !isPlainObject(next)) return false
  const keys = Object.keys(next)
  return (
    keys.length === Object.keys(previous).length &&
    keys.every((key) => key in previous && structurallyEqual(previous[key], next[key]))
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
