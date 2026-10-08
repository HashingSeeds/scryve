import { useMemo } from "react"

/** why: `players` is rebuilt on every life tick and server update; keeping one array until a color changes lets the memoized game menu skip those renders. */
export function useSeatColors(players: readonly { color: string }[]): readonly string[] {
  const key = players.map((player) => player.color).join(" ")
  return useMemo(() => (key ? key.split(" ") : []), [key])
}
