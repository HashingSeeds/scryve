import { router } from "expo-router"

import { createLocalGame, hasLocalGameStarted, isMatchInProgress } from "./domain"
import { localGameRepository, type LocalGameAccountInput } from "./localPersistence"
import type { LocalSetup } from "./recentSetups"

export function activeGameBlocksSetup() {
  const game = localGameRepository.loadActiveGame()
  return game !== null && (hasLocalGameStarted(game) || isMatchInProgress(game))
}

/** why: an abandoned game is offered back only on the board that replaced it, so any other start ends the offer. `replacesAbandoned` marks setup's own Abandon, whose start is that board. */
export function startLocalGame(
  setup: LocalSetup & { account?: LocalGameAccountInput },
  { replacesAbandoned = false }: { replacesAbandoned?: boolean } = {},
) {
  if (activeGameBlocksSetup()) return false
  if (!replacesAbandoned) localGameRepository.forgetAbandoned()
  const created = createLocalGame(setup)
  if (localGameRepository.loadActiveGame()) localGameRepository.clearActiveGame()
  const { account, ...game } = setup
  if (account) localGameRepository.saveMeSeat(account.meSeat)
  localGameRepository.rememberSetup({ mode: "local", game })
  localGameRepository.saveActiveGame(created)
  // why: a team's shared life and seat count would become every later game's defaults.
  if (!created.variant) localGameRepository.saveDefaultsFrom(created)
  // why: setup sits above the board it came from, so replacing it would stack a second board that never unmounts.
  router.dismissTo({
    pathname: "/",
    params: { destination: "play", prepared: JSON.stringify(setup) },
  })
  return true
}
