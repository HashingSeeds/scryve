import { useMemo } from "react"
import { useRoute } from "expo-router"
import { useNavigationState } from "expo-router/react-navigation"

import { translate } from "@/i18n/translate"
import { goBack } from "@/utils/navigation"

import { localGameRepository } from "./localPersistence"

const GAME_ROUTES = new Set(["game/current", "connected/game/[gameId]", "lan/game"])
const LOBBY_ROUTES = new Set(["connected/lobby/[gameId]", "lan/index"])

export type BackAction = { label: string; onPress: () => void }

/** why: screens opened over the board name what's behind them beside the back chevron ("Game", "Play", "Rules", "Lobby"), read from the stack route under this one. With nothing under it, back lands on Play. */
export function useBackToBoard(): BackAction {
  const { key } = useRoute()
  // why: a pushed screen's first render can read the stack before it holds this route, so subscribe instead of reading it once.
  const below = useNavigationState(
    ({ routes }) => routes[routes.findIndex((route) => route.key === key) - 1]?.name,
  )
  return useMemo(() => {
    const label =
      below === undefined || below === "index"
        ? localGameRepository.loadActiveGame()
          ? translate("common:appNavigation.game")
          : translate("common:appNavigation.play")
        : GAME_ROUTES.has(below)
          ? translate("common:appNavigation.game")
          : LOBBY_ROUTES.has(below)
            ? translate("common:appNavigation.lobby")
            : below === "rules"
              ? translate("common:appNavigation.rules")
              : translate("common:back")
    return { label, onPress: () => goBack({ pathname: "/", params: { destination: "play" } }) }
  }, [below])
}
