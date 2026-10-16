import { useState } from "react"
import { Redirect, router } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import type { CreatedLobby } from "@/features/connected/ConnectedHostSource"
import { ConnectedSetupSource } from "@/features/connected/ConnectedSetupSource"
import { startLocalGame } from "@/features/game/gameSetup"
import { localGameRepository } from "@/features/game/localPersistence"
import type { RecentSetup } from "@/features/game/recentSetups"
import type { ConnectedHostFeed } from "@/screens/NewGameScreen"
import { StartGameScreen } from "@/screens/StartGameScreen"
import { goBack } from "@/utils/navigation"

function openLobby(lobby: Pick<CreatedLobby, "publicId">) {
  router.replace({ pathname: "/connected/lobby/[gameId]", params: { gameId: lobby.publicId } })
}

export default function StartGameRoute() {
  const auth = useAuthAccess()
  const ownerId = auth.configured && auth.isSignedIn ? auth.userId : undefined
  const [setups] = useState(() => localGameRepository.loadRecentSetups())
  const [now] = useState(() => Date.now())
  const [connected, setConnected] = useState<ConnectedHostFeed>()
  const [localBlocked, setLocalBlocked] = useState(false)

  if (setups.length === 0) return <Redirect href="/game/new" />

  const connectedGames = connected?.activeGames ?? []
  function blockedReason(setup: RecentSetup) {
    if (setup.mode === "connected") {
      if (connected?.access) return undefined
      if (!connected?.ready) return connected?.status ?? "Connecting…"
      return connected.blockedReason ?? (connected.busy ? "Working…" : undefined)
    }
    if (localBlocked) return "End the current game in Setup first."
    return connected?.ready && connectedGames.length > 0
      ? "Finish your connected game first."
      : undefined
  }

  function replay(setup: RecentSetup) {
    if (setup.mode === "local") {
      const meSeat = localGameRepository.loadMeSeat()
      const account = ownerId
        ? {
            ownerId,
            ...(typeof meSeat === "number" && meSeat < setup.game.players.length ? { meSeat } : {}),
          }
        : undefined
      if (!startLocalGame({ ...setup.game, ...(account ? { account } : {}) })) setLocalBlocked(true)
      return
    }
    if (connected?.access) return connected.access.request()
    if (connected?.ready && !connected.busy) connected.host(setup.lobby)
  }

  return (
    <>
      <ConnectedSetupSource onChange={setConnected} onLobbyCreated={openLobby} />
      <StartGameScreen
        setups={setups}
        now={now}
        blockedReason={blockedReason}
        error={connected?.error}
        onReplay={replay}
        onNewSetup={() => router.push("/game/new")}
        onJoin={() => router.push("/connected/join")}
        onBack={() => goBack({ pathname: "/", params: { destination: "play" } })}
      />
    </>
  )
}
