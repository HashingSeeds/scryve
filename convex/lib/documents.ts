function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, field]) => field !== undefined && !key.startsWith("_"))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, field]) => [key, canonical(field)]),
  )
}

export function storesValue(stored: object, value: object) {
  return JSON.stringify(canonical(stored)) === JSON.stringify(canonical(value))
}
