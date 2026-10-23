import { router } from "expo-router"

import { startLocalGame } from "@/features/game/gameSetup"
import { localGameRepository } from "@/features/game/localPersistence"

import { matchSetupFor } from "./eventLogic"
import type { EventTableView, EventView } from "./eventSource"

export function startEventMatch(
  view: EventView,
  table: EventTableView,
  replace: boolean,
  ownerId: string | undefined,
) {
  const setup = matchSetupFor(view, table, Date.now())
  const active = localGameRepository.loadActiveGame()
  // why: tapping Start match again for the match already running must resume it, not end it mid-match.
  if (
    active?.match &&
    active.players.map((player) => player.name).join("\n") ===
      setup.players.map((player) => player.name).join("\n")
  ) {
    router.push("/game/current")
    return true
  }
  if (replace) localGameRepository.clearActiveGame()
  const meSeat = view.myPlayerId ? table.playerIds.indexOf(view.myPlayerId) : -1
  return startLocalGame({
    ...setup,
    ...(ownerId && meSeat >= 0 ? { account: { ownerId, meSeat } } : {}),
  })
}
