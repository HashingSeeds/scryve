import { useEffect, useRef } from "react"

import type { MyDecks } from "@/features/decks/LocalDeckChoicesSource"
import { LobbyClosedScreen, LobbyStatusScreen, LobbyView } from "@/features/lobby/LobbyView"
import { translate } from "@/i18n/translate"

import { lanSession, useLanSession } from "./lanSession"
import { nearbyDeckState, nearbySeatDeck } from "./nearbyDecks"

const NO_SEATS_SELECTING: ReadonlySet<number> = new Set()

export function NearbyLobbyScreen({
  error: routeError,
  myDecks,
  signedIn = false,
  onBack,
  onPlay,
  onLeft,
  onManageDecks,
}: {
  error?: string
  myDecks?: MyDecks
  signedIn?: boolean
  onBack: () => void
  onPlay: () => void
  onLeft: () => void
  onManageDecks?: () => void
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
      decks={
        lobby.setup.system && lobby.status !== "active"
          ? {
              source: (render) => render(nearbyDeckState(myDecks, signedIn, lobby.setup)),
              selectingSeats: NO_SEATS_SELECTING,
              onSelect: (_seat, versionId) => {
                const deck = versionId ? nearbySeatDeck(myDecks, versionId, lobby.setup) : null
                if (deck !== undefined) void lanSession.selectDeck(deck).catch(() => undefined)
              },
              ...(signedIn && onManageDecks ? { onManage: onManageDecks } : {}),
            }
          : undefined
      }
    />
  )
}
