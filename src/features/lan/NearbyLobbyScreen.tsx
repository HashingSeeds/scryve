import { useEffect, useRef } from "react"

import { LobbyClosedScreen, LobbyStatusScreen, LobbyView } from "@/features/lobby/LobbyView"
import { translate } from "@/i18n/translate"

import { lanSession, useLanSession } from "./lanSession"

export function NearbyLobbyScreen({
  error: routeError,
  onBack,
  onPlay,
  onLeft,
}: {
  error?: string
  onBack: () => void
  onPlay: () => void
  onLeft: () => void
}) {
  const { lobby, projection, role, status, error, serviceName } = useLanSession()

  const startedRound = useRef(lobby?.status === "active" ? lobby.round : undefined)
  useEffect(() => {
    if (lobby?.status !== "active" || startedRound.current === lobby.round) return
    startedRound.current = lobby.round
    onPlay()
  }, [lobby?.status, lobby?.round, onPlay])

  const shownError = routeError ?? error
  if (!role) {
    if (lobby?.status === "abandoned")
      return <LobbyClosedScreen status="abandoned" onClose={onLeft} />
    return (
      <LobbyStatusScreen
        message={shownError ?? translate("connected:nearby.connecting")}
        error={Boolean(shownError)}
        onBack={onBack}
      />
    )
  }
  if (!lobby || !projection)
    return (
      <LobbyStatusScreen
        message={translate(
          status === "reconnecting"
            ? "connected:nearby.reconnecting"
            : "connected:nearby.connecting",
        )}
        onBack={() => {
          lanSession.leave()
          onBack()
        }}
      />
    )

  const isHost = role === "host"
  const away = new Set(lobby.seats.filter((seat) => !seat.connected).map((seat) => seat.key))
  return (
    <LobbyView
      lobby={{
        ...lobby.setup,
        isHost,
        players: projection.players.map((player) => ({
          ...player,
          ...(away.has(player.playerId) ? { away: true } : {}),
        })),
      }}
      heading={
        serviceName ? { text: serviceName, label: translate("play:newGame.nearby") } : undefined
      }
      online={isHost || status === "connected"}
      offlineNotice={translate("connected:nearby.reconnecting")}
      exitOfflineNotice={translate("connected:nearby.reconnecting")}
      error={error}
      starting={false}
      leaving={false}
      startLabel={
        lobby.status === "finished" ? translate("connected:nearby.startAgain") : undefined
      }
      onStart={() => lanSession.start()}
      onReturnToGame={lobby.status === "active" ? onPlay : undefined}
      onExit={async () => {
        lanSession.leave()
        onLeft()
        return true
      }}
      onBack={onBack}
      onChangePlayerCount={
        isHost && lobby.status === "lobby"
          ? (playerCount) => lanSession.updateSettings({ playerCount })
          : undefined
      }
    />
  )
}
