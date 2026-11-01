import { useEffect, useRef, useState } from "react"

import { buildInviteQrPayload } from "@/features/connected/inviteLinks"
import type { MyDecks } from "@/features/decks/LocalDeckChoicesSource"
import { loadSharedDecks, lobbySharedDeck } from "@/features/decks/sharedDecks"
import { LobbyClosedScreen, LobbyView } from "@/features/lobby/LobbyView"
import { translate } from "@/i18n/translate"

import type { LanSeatDeck } from "./lanGame"
import { lanSession, useLanSessionSlice, type LanSessionState } from "./lanSession"
import { nearbyGameCode, nearbyGameHost } from "./nearbyCode"
import { nearbyDeckState, nearbySeatDeck, nearbySharedSeatDeck } from "./nearbyDecks"
import { NearbyDeviceDeckSource } from "./NearbyDeviceDeckSource"
import { NearbyStatusScreen, OpenSettingsButton } from "./NearbyStatusScreen"

const NO_SEATS_SELECTING: ReadonlySet<number> = new Set()

const selectDeck = (deck: LanSeatDeck | null) =>
  void lanSession.selectDeck(deck).catch(() => undefined)

// why: the lobby shows no life totals, so leaving them out keeps every life change from re-rendering it under the board.
const selectLobbyScreen = ({
  lobby,
  projection,
  role,
  status,
  error,
  serviceName,
}: LanSessionState) => ({
  lobby,
  role,
  status,
  error,
  serviceName,
  players: projection?.players.map(({ currentLife: _currentLife, ...player }) => player),
})

export function NearbyLobbyScreen({
  accessDenied = false,
  hosting = false,
  myDecks,
  signedIn = false,
  onBack,
  onPlay,
  onLeft,
  onManageDecks,
  onAddDeck,
}: {
  accessDenied?: boolean
  hosting?: boolean
  myDecks?: MyDecks
  signedIn?: boolean
  onBack: () => void
  onPlay: () => void
  onLeft: () => void
  onManageDecks?: () => void
  onAddDeck?: () => void
}) {
  const { lobby, players, role, status, error, serviceName } = useLanSessionSlice(selectLobbyScreen)
  const [sharedDecks] = useState(loadSharedDecks)

  const startedRound = useRef(lobby?.status === "active" ? lobby.round : undefined)
  useEffect(() => {
    if (lobby?.status !== "active" || startedRound.current === lobby.round) return
    startedRound.current = lobby.round
    onPlay()
  }, [lobby?.status, lobby?.round, onPlay])

  if (!role) {
    if (lobby?.status === "abandoned")
      return <LobbyClosedScreen status="abandoned" onClose={onLeft} />
    if (accessDenied)
      return (
        <NearbyStatusScreen
          title={translate("connected:nearby.accessTitle")}
          message={translate("connected:nearby.accessDenied")}
          actions={<OpenSettingsButton />}
          onBack={onBack}
        />
      )
    if (error) return <NearbyStatusScreen message={error} onBack={onBack} />
    return (
      <NearbyStatusScreen
        busy
        message={translate(hosting ? "connected:nearby.starting" : "connected:nearby.connecting")}
        onBack={onBack}
      />
    )
  }
  if (!lobby || !players)
    return (
      <NearbyStatusScreen
        busy
        message={
          role === "host"
            ? translate("connected:nearby.starting")
            : translate(
                status === "reconnecting"
                  ? "connected:nearby.reconnectingTo"
                  : "connected:nearby.connectingTo",
                { name: serviceName },
              )
        }
        onBack={() => {
          lanSession.leave()
          onBack()
        }}
      />
    )

  const isHost = role === "host"
  const code = serviceName ? nearbyGameCode(serviceName) : undefined
  const away = new Set(lobby.seats.filter((seat) => !seat.connected).map((seat) => seat.key))
  return (
    <LobbyView
      lobby={{
        ...lobby.setup,
        isHost,
        players: players.map((player) => ({
          ...player,
          ...(away.has(player.playerId) ? { away: true } : {}),
        })),
      }}
      heading={
        serviceName
          ? { text: nearbyGameHost(serviceName), label: translate("play:newGame.nearby") }
          : undefined
      }
      online={isHost || status === "connected"}
      invite={code ? { qrPayload: buildInviteQrPayload("", code), manualCode: code } : undefined}
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
              source: (render) => {
                const state = nearbyDeckState(myDecks, signedIn, lobby.setup)
                // why: Sync and use needs an account, so a signed-out player sees no device decks here.
                if (!signedIn) return render(state)
                return (
                  <NearbyDeviceDeckSource
                    myDecks={myDecks}
                    setup={lobby.setup}
                    onSelect={selectDeck}
                  >
                    {(device) => render(state, device)}
                  </NearbyDeviceDeckSource>
                )
              },
              selectingSeats: NO_SEATS_SELECTING,
              onSelect: (_seat, versionId) => {
                const deck = versionId ? nearbySeatDeck(myDecks, versionId, lobby.setup) : null
                if (deck !== undefined) selectDeck(deck)
              },
              ...(signedIn
                ? {
                    onManage: onManageDecks,
                    onAddDeck,
                    shared: {
                      decks: sharedDecks.map(lobbySharedDeck),
                      onUse: (_seat, deckKey) => {
                        const kept = sharedDecks.find((shared) => shared.deckKey === deckKey)
                        if (kept)
                          void nearbySharedSeatDeck(kept, lobby.setup).then(
                            (deck) => deck && selectDeck(deck),
                          )
                      },
                    },
                  }
                : {}),
            }
          : undefined
      }
    />
  )
}
