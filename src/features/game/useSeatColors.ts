import { useState } from "react"

/** why: `players` is rebuilt on every life tick and server update; keeping one array until a color changes lets the memoized game menu skip those renders. */
export function useSeatColors(players: readonly { color: string }[]): readonly string[] {
  const colors = players.map((player) => player.color)
  const [stable, setStable] = useState(colors)
  const changed =
    colors.length !== stable.length || colors.some((color, index) => color !== stable[index])
  if (changed) setStable(colors)
  return changed ? colors : stable
}
