import { useState } from "react"

// why: rows keep their place while votes change, so a fast second tap lands on the request the player meant.
export function holdOrder<T extends { _id: string }>(
  order: readonly string[],
  items: readonly T[],
) {
  const byId = new Map(items.map((item) => [item._id, item]))
  const kept = order.flatMap((id) => byId.get(id) ?? [])
  const known = new Set(order)
  return [...kept, ...items.filter((item) => !known.has(item._id))]
}

export function useHeldOrder<T extends { _id: string }>(
  items: readonly T[] | undefined,
  resetKey: string,
) {
  const [held, setHeld] = useState<{ key: string; order: string[] }>()
  if (!items) return undefined
  if (held?.key !== resetKey) {
    setHeld({ key: resetKey, order: items.map((item) => item._id) })
    return items
  }
  const known = new Set(held.order)
  const added = items.filter((item) => !known.has(item._id)).map((item) => item._id)
  if (added.length) setHeld({ key: resetKey, order: [...held.order, ...added] })
  return holdOrder(held.order, items)
}
