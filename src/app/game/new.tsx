import { useCallback, useEffect, useMemo, useState } from "react"
import { router, useFocusEffect, useLocalSearchParams } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import type { CreatedLobby } from "@/features/connected/ConnectedHostSource"
import { ConnectedSetupSource } from "@/features/connected/ConnectedSetupSource"
import {
  LocalGamePublishSource,
  type PublishedGame,
} from "@/features/connected/LocalGamePublishSource"
import { LocalDeckChoicesSource, type DeckChoices } from "@/features/decks/LocalDeckChoicesSource"
import {
  applyGameCommand,
  defaultCommandContext,
  hasLocalGameStarted,
  isMatchInProgress,
} from "@/features/game/domain"
import { startLocalGame } from "@/features/game/gameSetup"
import { localGameRepository } from "@/features/game/localPersistence"
import type { LocalGame, LocalGameResult, MatchSeatOutcome } from "@/features/game/types"
import { lanPlayAvailable } from "@/features/lan/lanAvailability"
import { translate } from "@/i18n/translate"
import {
  NewGameScreen,
  type ConnectedHostFeed,
  type LocalConnectFeed,
  type NewGameMode,
} from "@/screens/NewGameScreen"
import { goBack } from "@/utils/navigation"

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
  const params = useLocalSearchParams<{ mode?: string; setup?: string; deckId?: string }>()
  const auth = useAuthAccess()
  const ownerId = auth.configured && auth.isSignedIn ? auth.userId : undefined
  const [mode, setMode] = useState<NewGameMode>(params.mode === "connected" ? "connected" : "local")
  const [connected, setConnected] = useState<ConnectedHostFeed>()
  const [localConnect, setLocalConnect] = useState<LocalConnectFeed>()
  const [decks, setDecks] = useState<DeckChoices>()
  const [activeGame, setActiveGame] = useState(() => localGameRepository.loadActiveGame())
  const [defaults] = useState(() => localGameRepository.loadSettings())
  const [recentSetups] = useState(() => localGameRepository.loadRecentSetups())
  const [defaultMeSeat] = useState(() => {
    const remembered = localGameRepository.loadMeSeat()
    return remembered === "none" ? undefined : (remembered ?? 0)
  })
  const [initialGame] = useState(activeGame ?? undefined)
  useFocusEffect(
    useCallback(() => {
      setActiveGame(localGameRepository.loadActiveGame())
    }, []),
  )
  const started = activeGame !== null && hasLocalGameStarted(activeGame)
  // why: a match between games has no life changes yet, but Start must continue it rather than replace it.
  const blocking = activeGame !== null && (started || isMatchInProgress(activeGame))
  const matchEndGame = useMemo((): LocalGame | undefined => {
    if (!activeGame?.match || started || activeGame.match.gameNumber < 2) return undefined
    const latest = localGameRepository.latestMatchGame(activeGame.match.id)
    return latest ? localGameRepository.loadHistoryDetail(latest.id)?.game : undefined
  }, [activeGame, started])

  function endMatch(outcomes: MatchSeatOutcome[]) {
    if (!activeGame?.match) return
    localGameRepository.finishMatch(activeGame.match.id, outcomes)
    localGameRepository.clearActiveGame()
    setActiveGame(null)
  }

  function endLocal(result?: LocalGameResult) {
    const current = localGameRepository.loadActiveGame()
    if (!current || current.id !== activeGame?.id) {
      setActiveGame(current)
      throw new Error(translate("play:newGame.gameChanged"))
    }
    if (result) {
      const ended = applyGameCommand(
        current,
        { type: "game.finish", result },
        defaultCommandContext(localGameRepository.getDeviceId()),
      )
      localGameRepository.archiveGame(ended, "new_game_prompt", ownerId)
    } else localGameRepository.clearActiveGame()
    setActiveGame(null)
  }

  const connectableGame = started && mode === "local" ? activeGame : null
  const connectAllowed = Boolean(connected?.access ?? connected?.ready)

  return (
    <>
      <ConnectedSetupSource onChange={setConnected} onLobbyCreated={openLobby} />
      {ownerId ? <LocalDeckChoicesSource ownerId={ownerId} onChange={setDecks} /> : null}
      {connectableGame ? (
        <LocalGamePublishSource game={connectableGame} onPublished={openPublishedGame}>
          {(feed) => <ReportLocalConnect feed={feed} onChange={setLocalConnect} />}
        </LocalGamePublishSource>
      ) : null}
      <NewGameScreen
        initialDeckId={params.deckId}
        defaults={defaults}
        mode={mode}
        initialGame={initialGame}
        recentSetups={recentSetups}
        localGame={blocking ? activeGame : undefined}
        localMatchEnd={matchEndGame ? { game: matchEndGame, onEnd: endMatch } : undefined}
        account={ownerId ? { ownerId, defaultMeSeat, decks } : undefined}
        onResumeLocal={() => router.replace("/game/current")}
        onEndLocal={endLocal}
        onAbandonLocal={() => endLocal()}
        // why: Play opens plain /game/new before its stored-game state catches up, so a running game's edits must persist on every entry.
        onSavePlayers={
          blocking
            ? (players, account) => {
                localGameRepository.updateActivePlayers(activeGame.id, players, account)
                setActiveGame(localGameRepository.loadActiveGame())
              }
            : undefined
        }
        onModeChange={setMode}
        onBack={() => goBack({ pathname: "/", params: { destination: "play" } })}
        onStartLocal={(players, startingLife, setup) => {
          if (!startLocalGame({ players, startingLife, ...setup }))
            setActiveGame(localGameRepository.loadActiveGame())
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
        onJoin={() => router.push("/connected/join")}
        onNearby={
          lanPlayAvailable()
            ? (setup) => router.push({ pathname: "/lan", params: { setup: JSON.stringify(setup) } })
            : undefined
        }
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
