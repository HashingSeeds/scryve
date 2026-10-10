import { useState } from "react"
import * as Crypto from "expo-crypto"
import { Redirect, router } from "expo-router"

import { localGameRepository } from "@/features/game/localPersistence"
import { CurrentGameScreen } from "@/screens/CurrentGameScreen"

/** why: spike entry; hosts the active local game, so open `/dev/seed/game` first for a board. */
export default function TableHostRoute() {
  const [game] = useState(() => localGameRepository.loadActiveGame())
  const [sessionId] = useState(() => Crypto.randomUUID())
  if (!__DEV__ || !game) return <Redirect href="/" />
  return (
    <CurrentGameScreen
      initialGame={game}
      tableSessionId={sessionId}
      onViewSummary={(gameId) => router.push({ pathname: "/history/[gameId]", params: { gameId } })}
    />
  )
}
