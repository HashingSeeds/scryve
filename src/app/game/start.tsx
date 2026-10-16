import { useState } from "react"
import { Redirect, router } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import type { CreatedLobby } from "@/features/connected/ConnectedHostSource"
import { ConnectedSetupSource } from "@/features/connected/ConnectedSetupSource"
import { activeGameBlocksSetup, startLocalGame } from "@/features/game/gameSetup"
import { localGameRepository } from "@/features/game/localPersistence"
import type { RecentSetup } from "@/features/game/recentSetups"
import { translate } from "@/i18n/translate"
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
  const [, refresh] = useState(0)

  if (setups.length === 0) return <Redirect href="/game/new" />

  const connectedGames = connected?.activeGames ?? []
  const localGameRunning = activeGameBlocksSetup()
  function blockedReason(setup: RecentSetup) {
    if (localGameRunning) return translate("play:recentSetups.endCurrentGame")
    if (setup.mode === "connected") {
      if (connected?.access) return undefined
      if (!connected?.ready)
        return (
          connected?.blockedReason ??
          connected?.status ??
          translate(
            connected?.error ? "play:recentSetups.unavailable" : "play:recentSetups.connecting",
          )
        )
      return (
        connected.blockedReason ??
        (connected.busy ? translate("play:recentSetups.working") : undefined)
      )
    }
    return connected?.ready && connectedGames.length > 0
      ? translate("play:recentSetups.finishConnectedGame")
      : undefined
  }

  function replay(setup: RecentSetup) {
    if (setup.mode === "local") {
      const meSeat = localGameRepository.loadMeSeat()
      const account = ownerId
        ? {
            ownerId,
            ...(meSeat !== "none" && (meSeat ?? 0) < setup.game.players.length
              ? { meSeat: meSeat ?? 0 }
              : {}),
          }
        : undefined
      if (!startLocalGame({ ...setup.game, ...(account ? { account } : {}) })) refresh((n) => n + 1)
      return
    }
    if (activeGameBlocksSetup()) return refresh((n) => n + 1)
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
        onRetry={connected?.retry}
        onReplay={replay}
        onNewSetup={() => router.push("/game/new")}
        onJoin={() => router.push("/connected/join")}
        onBack={() => goBack({ pathname: "/", params: { destination: "play" } })}
      />
    </>
  )
}
