import { useEffect, useRef } from "react"

import type { LobbyDeckState } from "@/features/connected/LobbySeatList"
import type { MyDecks } from "@/features/decks/LocalDeckChoicesSource"
import { LobbyClosedScreen, LobbyStatusScreen, LobbyView } from "@/features/lobby/LobbyView"
import { translate } from "@/i18n/translate"

import { lanCanRequireDecks, type LanSeatDeck } from "./lanGame"
import { lanSession, useLanSession } from "./lanSession"
import { identitySection } from "../../../convex/lib/systems"

const NO_SEATS_SELECTING: ReadonlySet<number> = new Set()

const listed = (decks: MyDecks) => (decks === undefined || decks === "unavailable" ? [] : decks)

/** why: offline, only a deck's latest version has a known starting value, so an older one would start at the wrong life. */
const latestVersionsOnly = (decks: MyDecks) =>
  listed(decks).map((deck) => ({
    ...deck,
    versions: deck.versions.filter(({ _id }) => _id === deck.latestVersionId),
  }))

function deckStateOf(decks: MyDecks, signedIn: boolean, lifeFromDeck: boolean): LobbyDeckState {
  if (decks === undefined && signedIn) return { status: "loading" }
  return { status: "ready", value: lifeFromDeck ? latestVersionsOnly(decks) : [...listed(decks)] }
}

function seatDeckOf(decks: MyDecks, versionId: string): LanSeatDeck | undefined {
  const deck = listed(decks).find((candidate) =>
    candidate.versions.some(({ _id }) => _id === versionId),
  )
  if (!deck) return undefined
  return {
    versionId,
    name: deck.name,
    ...(deck.latestVersionId === versionId && deck.startingValue !== undefined
      ? { startingValue: deck.startingValue }
      : {}),
  }
}

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
      onChangeDeckRequired={
        isHost &&
        signedIn &&
        lobby.status === "lobby" &&
        lobby.setup.system &&
        (lobby.setup.deckRequired || lanCanRequireDecks(lobby))
          ? (deckRequired) => lanSession.updateSettings({ deckRequired })
          : undefined
      }
      decks={
        lobby.setup.system && lobby.status !== "active"
          ? {
              source: (render) =>
                render(
                  deckStateOf(
                    myDecks,
                    signedIn,
                    Boolean(
                      identitySection(lobby.setup.system, lobby.setup.format)?.startingValueFacet,
                    ),
                  ),
                ),
              selectingSeats: NO_SEATS_SELECTING,
              onSelect: (_seat, versionId) => {
                const deck = versionId ? seatDeckOf(myDecks, versionId) : null
                if (deck !== undefined) void lanSession.selectDeck(deck).catch(() => undefined)
              },
              ...(signedIn && onManageDecks ? { onManage: onManageDecks } : {}),
            }
          : undefined
      }
    />
  )
}
