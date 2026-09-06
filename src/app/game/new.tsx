import { useCallback, useState } from "react"
import { router, useFocusEffect, useLocalSearchParams } from "expo-router"

import type { CreatedLobby } from "@/features/connected/ConnectedHostSource"
import { ConnectedSetupSource } from "@/features/connected/ConnectedSetupSource"
import {
  applyGameCommand,
  defaultCommandContext,
  hasLocalGameStarted,
} from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import type { LocalGameResult } from "@/features/game/types"
import { NewGameScreen, type ConnectedHostFeed, type NewGameMode } from "@/screens/NewGameScreen"

function openLobby(lobby: CreatedLobby) {
  router.replace({ pathname: "/connected/lobby/[gameId]", params: { gameId: lobby.publicId } })
}

export default function NewLocalGameRoute() {
  const params = useLocalSearchParams<{ mode?: string; setup?: string }>()
  const [mode, setMode] = useState<NewGameMode>(params.mode === "connected" ? "connected" : "local")
  const [connectedEnabled, setConnectedEnabled] = useState(mode === "connected")
  const [connected, setConnected] = useState<ConnectedHostFeed>()
  const [activeGame, setActiveGame] = useState(() => localGameRepository.loadActiveGame())
  const [defaults] = useState(() => localGameRepository.loadSettings())
  const [initialGame] = useState(activeGame ?? undefined)
  useFocusEffect(
    useCallback(() => {
      setActiveGame(localGameRepository.loadActiveGame())
    }, []),
  )
  const started = activeGame !== null && hasLocalGameStarted(activeGame)

  function endLocal(result?: LocalGameResult) {
    const current = localGameRepository.loadActiveGame()
    if (!current || current.id !== activeGame?.id) {
      setActiveGame(current)
      throw new Error("The current game changed. Check it before ending it.")
    }
    if (result) {
      const ended = applyGameCommand(
        current,
        { type: "game.finish", result },
        defaultCommandContext(localGameRepository.getDeviceId()),
      )
      localGameRepository.archiveGame(ended)
    } else localGameRepository.clearActiveGame()
    setActiveGame(null)
  }

  return (
    <>
      {connectedEnabled ? (
        <ConnectedSetupSource onChange={setConnected} onLobbyCreated={openLobby} />
      ) : null}
      <NewGameScreen
        defaults={defaults}
        mode={mode}
        initialGame={initialGame}
        localGame={started ? activeGame : undefined}
        onResumeLocal={() => router.replace("/game/current")}
        onEndLocal={endLocal}
        onAbandonLocal={() => endLocal()}
        onSavePlayers={
          started && params.setup === "1"
            ? (players) => {
                localGameRepository.updateActivePlayers(activeGame.id, players)
                router.replace("/game/current")
              }
            : undefined
        }
        onModeChange={(next) => {
          if (next === "connected") setConnectedEnabled(true)
          setMode(next)
        }}
        onBack={() => router.back()}
        onStartLocal={(players, startingLife, setup) => {
          const current = localGameRepository.loadActiveGame()
          if (current && hasLocalGameStarted(current)) {
            setActiveGame(current)
            return
          }
          if (current) localGameRepository.clearActiveGame()
          router.replace({
            pathname: "/",
            params: {
              destination: "play",
              prepared: JSON.stringify({ players, startingLife, ...setup }),
            },
          })
        }}
        connected={connected}
        onJoinConnected={() => router.push("/connected/join")}
        onResumeConnected={(game) =>
          router.replace({
            pathname:
              game.status === "lobby" ? "/connected/lobby/[gameId]" : "/connected/game/[gameId]",
            params: { gameId: game.publicId },
          })
        }
      />
    </>
  )
}
