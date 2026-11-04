import { useMemo } from "react"

import { goBack } from "@/utils/navigation"
import { useBackLabel } from "@/utils/useBackLabel"

export type BackAction = { label: string; onPress: () => void }

/** why: screens opened over the board name what's behind them beside the back chevron ("Game", "Play", "Rules", "Lobby"). With nothing under them, back lands on Play. */
export function useBackToBoard(): BackAction {
  const label = useBackLabel()
  return useMemo(
    () => ({ label, onPress: () => goBack({ pathname: "/", params: { destination: "play" } }) }),
    [label],
  )
}
