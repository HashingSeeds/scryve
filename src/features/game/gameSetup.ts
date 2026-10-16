import { router } from "expo-router"

import { hasLocalGameStarted, isMatchInProgress } from "./domain"
import { localGameRepository, type LocalGameAccountInput } from "./localPersistence"
import type { LocalSetup } from "./recentSetups"

function activeGameBlocksSetup() {
  const game = localGameRepository.loadActiveGame()
  return game !== null && (hasLocalGameStarted(game) || isMatchInProgress(game))
}

/**
 * why: the board's copy of the active game can lag what is stored, so this reads storage when
 * tapped. A running game opens its own setup; otherwise recent setups come first when there are any.
 */
export function gameSetupHref() {
  if (activeGameBlocksSetup()) return "/game/new" as const
  return localGameRepository.loadRecentSetups().length > 0
    ? ("/game/start" as const)
    : ("/game/new" as const)
}

export function startLocalGame(setup: LocalSetup & { account?: LocalGameAccountInput }) {
  if (activeGameBlocksSetup()) return false
  if (localGameRepository.loadActiveGame()) localGameRepository.clearActiveGame()
  const { account, ...game } = setup
  if (account) localGameRepository.saveMeSeat(account.meSeat)
  localGameRepository.rememberSetup({ mode: "local", game })
  // why: setup sits above the board it came from, so replacing it would stack a second board that never unmounts.
  router.dismissTo({
    pathname: "/",
    params: { destination: "play", prepared: JSON.stringify(setup) },
  })
  return true
}
