import { router } from "expo-router"

import { createLocalGame, hasLocalGameStarted, isMatchInProgress } from "./domain"
import { localGameRepository, type LocalGameAccountInput } from "./localPersistence"
import type { LocalSetup } from "./recentSetups"

export function activeGameBlocksSetup() {
  const game = localGameRepository.loadActiveGame()
  return game !== null && (hasLocalGameStarted(game) || isMatchInProgress(game))
}

export function startLocalGame(setup: LocalSetup & { account?: LocalGameAccountInput }) {
  if (activeGameBlocksSetup()) return false
  const created = createLocalGame(setup)
  if (localGameRepository.loadActiveGame()) localGameRepository.clearActiveGame()
  const { account, ...game } = setup
  if (account) localGameRepository.saveMeSeat(account.meSeat)
  localGameRepository.rememberSetup({ mode: "local", game })
  localGameRepository.saveActiveGame(created)
  // why: setup sits above the board it came from, so replacing it would stack a second board that never unmounts.
  router.dismissTo({
    pathname: "/",
    params: { destination: "play", prepared: JSON.stringify(setup) },
  })
  return true
}
