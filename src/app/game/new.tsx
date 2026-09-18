import { useCallback, useEffect, useState } from "react"
import { router, useFocusEffect, useLocalSearchParams } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import type { ResumableGame } from "@/features/connected/connectedCopy"
import type { CreatedLobby } from "@/features/connected/ConnectedHostSource"
import { ConnectedSetupSource } from "@/features/connected/ConnectedSetupSource"
import {
  LocalGamePublishSource,
  type PublishedGame,
} from "@/features/connected/LocalGamePublishSource"
import { loadNewestResumeGame } from "@/features/connected/persistence"
import {
  applyGameCommand,
  defaultCommandContext,
  hasLocalGameStarted,
} from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import type { LocalGameResult } from "@/features/game/types"
import { JoinConnectedScreen } from "@/screens/JoinConnectedScreen"
import {
  NewGameScreen,
  type ConnectedHostFeed,
  type LocalConnectFeed,
  type NewGameMode,
} from "@/screens/NewGameScreen"

function openLobby(lobby: Pick<CreatedLobby, "publicId">) {
  router.replace({ pathname: "/connected/lobby/[gameId]", params: { gameId: lobby.publicId } })
}

/**
 * A published game is live from the first moment, so it opens on the board rather
 * than a lobby, and the local copy is dropped: the server owns it now.
 *
 * Declared at module scope so the publish source sees one stable callback: it feeds
 * a memo whose consumer reports it upward from an effect.
 */
function openPublishedGame({ publicId }: PublishedGame) {
  localGameRepository.clearActiveGame()
  router.replace({
    pathname: "/connected/game/[gameId]",
    params: { gameId: publicId, invite: "1" },
  })
}

export function ReportLocalConnect({
  feed,
  onChange,
}: {
  feed: LocalConnectFeed
  onChange: (feed: LocalConnectFeed) => void
}) {
  const { busy, error, publish } = feed
  useEffect(() => onChange({ busy, error, publish }), [busy, error, publish, onChange])
  return null
}

export default function NewLocalGameRoute() {
  const params = useLocalSearchParams<{ mode?: string; setup?: string }>()
  const [mode, setMode] = useState<NewGameMode>(params.mode === "connected" ? "connected" : "local")
  const [joinCode, setJoinCode] = useState("")
  const [connected, setConnected] = useState<ConnectedHostFeed>()
  const [localConnect, setLocalConnect] = useState<LocalConnectFeed>()
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
      localGameRepository.archiveGame(ended, "new_game_prompt")
    } else localGameRepository.clearActiveGame()
    setActiveGame(null)
  }

  const connectableGame = started && mode === "local" ? activeGame : null
  const connectAllowed = Boolean(connected?.access ?? connected?.ready)

  function resumeConnected(game: ResumableGame) {
    router.replace({
      pathname: game.status === "lobby" ? "/connected/lobby/[gameId]" : "/connected/game/[gameId]",
      params: { gameId: game.publicId },
    })
  }

  function goBack() {
    const local = localGameRepository.loadActiveGame()
    const startedLocal = local && hasLocalGameStarted(local) ? local : null
    const newest = loadNewestResumeGame()
    if (newest && newest.updatedAt > (startedLocal?.updatedAt ?? 0)) {
      resumeConnected(newest)
      return
    }
    if (startedLocal) {
      router.replace("/game/current")
      return
    }
    router.back()
  }

  return (
    <>
      <ConnectedSetupSource onChange={setConnected} onLobbyCreated={openLobby} />
      {connectableGame ? (
        <LocalGamePublishSource game={connectableGame} onPublished={openPublishedGame}>
          {(feed) => <ReportLocalConnect feed={feed} onChange={setLocalConnect} />}
        </LocalGamePublishSource>
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
                setActiveGame(localGameRepository.loadActiveGame())
              }
            : undefined
        }
        onModeChange={setMode}
        onBack={goBack}
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
        localConnect={
          connectableGame && localConnect && connectAllowed
            ? {
                ...localConnect,
                ...(connected?.access ? { access: connected.access } : {}),
                ready: Boolean(connected?.ready || connected?.access),
              }
            : undefined
        }
        joinContent={
          <CloudScreen multiplayer onBack={() => setMode("local")}>
            {(access) => (
              <JoinConnectedScreen
                embedded
                access={access}
                initialCode={joinCode}
                onCodeChange={setJoinCode}
                onJoined={(publicId) => openLobby({ publicId })}
              />
            )}
          </CloudScreen>
        }
        onResumeConnected={resumeConnected}
      />
    </>
  )
}
