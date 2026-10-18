import { useEffect, useRef, useState, type ReactNode } from "react"
import { Share } from "react-native"
import { useMutation, useQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { remoteValue } from "@/features/async/remoteState"
import { readPublicCloudConfig } from "@/features/auth/config"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { onlineOnlyNotice, type LobbyExitAction } from "@/features/connected/connectedCopy"
import { buildInviteQrPayload, buildInviteUrl } from "@/features/connected/inviteLinks"
import type { LobbyDeckState } from "@/features/connected/LobbySeatList"
import { removeResumeEntryEverywhere } from "@/features/connected/persistence"
import {
  PlayerActionsDialog,
  type ReportablePlayer,
} from "@/features/connected/PlayerActionsDialog"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { LobbyClosedScreen, LobbyStatusScreen, LobbyView } from "@/features/lobby/LobbyView"
import { translate } from "@/i18n/translate"
import { captureAnalytics, captureGame } from "@/utils/analytics"
import { convexErrorMessage, isGameUnavailableError } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  isPlayerMarkShape,
  isProMarkShape,
  shapeForSeat,
  shownMarkShape,
  type PlayerAppearance,
} from "../../convex/lib/appearance"

export function ConnectedLobbyScreen({
  publicId,
  onStarted,
  onBack,
  onLeft,
  onManageDecks,
}: {
  publicId: string
  onStarted: () => void
  onBack?: () => void
  onLeft?: () => void
  onManageDecks?: (system: string) => void
}) {
  return (
    <ConvexQueryBoundary
      resetKey={publicId}
      fallback={({ error, retry }) => {
        const gone = isGameUnavailableError(error)
        return (
          <LobbyStatusScreen
            message={translate(gone ? "connected:gameGone" : "connected:lobby.unavailable")}
            error
            {...(gone ? {} : { retry })}
            onBack={
              onBack
                ? () => {
                    if (gone) removeResumeEntryEverywhere(publicId)
                    onBack()
                  }
                : undefined
            }
          />
        )
      }}
    >
      <ConnectedLobbyContent
        publicId={publicId}
        onStarted={onStarted}
        onBack={onBack}
        onLeft={onLeft}
        onManageDecks={onManageDecks}
      />
    </ConvexQueryBoundary>
  )
}

function ConnectedLobbyContent({
  publicId,
  onStarted,
  onBack,
  onLeft,
  onManageDecks,
}: {
  publicId: string
  onStarted: () => void
  onBack?: () => void
  onLeft?: () => void
  onManageDecks?: (system: string) => void
}) {
  const deviceId = useRef(new LocalGameRepository().getDeviceId()).current
  const lobby = useQuery(api.games.lobbyProjection, {
    publicId,
    deviceId,
    includeRecentOperationIds: false,
  })
  const isWebSocketConnected = useConvexOnline()
  const updateSettings = useMutation(api.games.updateLobbySettings)
  const [savingSettings, setSavingSettings] = useState(false)
  const settingsInFlight = useRef(false)
  const start = useMutation(api.games.startGame)
  const leave = useMutation(api.games.leaveMyGame)
  const abandon = useMutation(api.games.abandonGame)
  const selectDeck = useMutation(api.decks.selectForSeat)
  const setAppearance = useMutation(api.games.setMyAppearance)
  const billing = useRevenueCat()
  const [actionError, setActionError] = useState<string>()
  const [leaving, setLeaving] = useState(false)
  const [playerToReport, setPlayerToReport] = useState<ReportablePlayer>()
  const [savingAppearance, setSavingAppearance] = useState(false)
  const [starting, setStarting] = useState(false)
  const [selectingDeckSeats, setSelectingDeckSeats] = useState<ReadonlySet<number>>(new Set())
  const startInFlight = useRef(false)
  const selectingDeckSeatsInFlight = useRef(new Set<number>())
  const didNavigateToGame = useRef(false)
  const observedLobby = useRef(false)

  useEffect(() => {
    observedLobby.current = false
    didNavigateToGame.current = false
  }, [publicId])

  useEffect(() => {
    if (lobby?.status === "lobby") observedLobby.current = true
    if (lobby?.status === "active" && !didNavigateToGame.current) {
      if (observedLobby.current)
        captureGame(
          "game_started",
          {
            id: publicId,
            system: lobby.system,
            format: lobby.format,
            playerCount: lobby.playerCount,
          },
          "connected",
        )
      didNavigateToGame.current = true
      onStarted()
    }
  }, [lobby, onStarted, publicId])
  const origin = readPublicCloudConfig()
  const inviteUrl =
    lobby?.invitation?.token && origin.configured
      ? buildInviteUrl(origin.value.inviteOrigin, lobby.invitation.token)
      : undefined
  const inviteQrPayload = lobby?.invitation?.token
    ? buildInviteQrPayload(lobby.invitation.token, lobby.invitation.manualCode)
    : null
  const manualCode = lobby?.invitation?.manualCode

  async function chooseVersion(seat: number, deckVersionId?: string) {
    if (selectingDeckSeatsInFlight.current.has(seat)) return
    if (!isWebSocketConnected) {
      setActionError(onlineOnlyNotice("deck"))
      return
    }
    selectingDeckSeatsInFlight.current.add(seat)
    setSelectingDeckSeats(new Set(selectingDeckSeatsInFlight.current))
    try {
      setActionError(undefined)
      await selectDeck({
        publicId,
        seat,
        ...(deckVersionId ? { deckVersionId: deckVersionId as Id<"deckVersions"> } : {}),
      })
      if (deckVersionId) captureAnalytics("deck_used", { feature: "assigned" })
    } catch (cause) {
      setActionError(convexErrorMessage(cause, translate("connected:lobby.errors.selectDeck")))
    } finally {
      selectingDeckSeatsInFlight.current.delete(seat)
      setSelectingDeckSeats(new Set(selectingDeckSeatsInFlight.current))
    }
  }

  async function changeSettings(settings: { playerCount?: number; deckRequired?: boolean }) {
    if (settingsInFlight.current || startInFlight.current || !isWebSocketConnected) return
    settingsInFlight.current = true
    setSavingSettings(true)
    try {
      setActionError(undefined)
      await updateSettings({ publicId, ...settings })
    } catch (cause) {
      setActionError(convexErrorMessage(cause, translate("connected:lobby.errors.updateSettings")))
    } finally {
      settingsInFlight.current = false
      setSavingSettings(false)
    }
  }

  async function startGame() {
    if (startInFlight.current || settingsInFlight.current) return
    if (!isWebSocketConnected) {
      setActionError(onlineOnlyNotice("start"))
      return
    }

    startInFlight.current = true
    setStarting(true)
    try {
      setActionError(undefined)
      await start({ publicId })
    } catch (cause) {
      setActionError(
        convexErrorMessage(
          cause,
          cause instanceof Error ? cause.message : translate("connected:lobby.errors.start"),
        ),
      )
    } finally {
      startInFlight.current = false
      setStarting(false)
    }
  }

  async function shareInvite() {
    try {
      setActionError(undefined)
      if (inviteUrl) {
        await Share.share({
          message: translate("connected:invite.shareMessage", { url: inviteUrl }),
          url: inviteUrl,
        })
      } else if (manualCode) {
        await Share.share({
          message: translate("connected:invite.shareMessageCode", { code: manualCode }),
        })
      }
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : translate("connected:invite.shareFailed"),
      )
    }
  }

  async function saveAppearance(seat: number, draft: PlayerAppearance) {
    try {
      setSavingAppearance(true)
      setActionError(undefined)
      const freeShape = lobby?.players.find((player) => player.seat === seat)?.shape
      const pro = isProMarkShape(draft.shape)
      await setAppearance({
        publicId,
        seat,
        color: draft.color,
        shape: !pro ? draft.shape : isPlayerMarkShape(freeShape) ? freeShape : shapeForSeat(seat),
        proShape: pro ? draft.shape : null,
      })
      return true
    } catch (cause) {
      setActionError(convexErrorMessage(cause, translate("connected:lobby.errors.appearance")))
      return false
    } finally {
      setSavingAppearance(false)
    }
  }

  async function confirmExit(action: LobbyExitAction) {
    if (!isWebSocketConnected) {
      setActionError(onlineOnlyNotice("exit"))
      return false
    }
    try {
      setLeaving(true)
      setActionError(undefined)
      if (action === "abandon") await abandon({ publicId })
      else await leave({ publicId, deviceId })
      onLeft?.()
      return true
    } catch (cause) {
      setActionError(
        convexErrorMessage(
          cause,
          cause instanceof Error ? cause.message : translate("connected:lobby.errors.leave"),
        ),
      )
      return false
    } finally {
      setLeaving(false)
    }
  }

  if (lobby === undefined)
    return <LobbyStatusScreen message={translate("connected:lobby.loading")} onBack={onBack} />

  if (lobby.status === "abandoned" || lobby.status === "finished")
    return (
      <LobbyClosedScreen status={lobby.status} onClose={onLeft ?? onBack ?? (() => undefined)} />
    )

  return (
    <LobbyView
      lobby={lobby}
      heading={
        manualCode ? { text: manualCode, label: translate("connected:invite.code") } : undefined
      }
      online={isWebSocketConnected}
      offlineNotice={onlineOnlyNotice("start")}
      exitOfflineNotice={onlineOnlyNotice("exit")}
      error={actionError}
      starting={starting}
      savingSettings={savingSettings}
      leaving={leaving}
      onStart={() => void startGame()}
      onExit={confirmExit}
      onBack={onBack}
      onChangePlayerCount={(playerCount) => void changeSettings({ playerCount })}
      onChangeDeckRequired={(deckRequired) => void changeSettings({ deckRequired })}
      invite={{
        qrPayload: inviteQrPayload,
        manualCode,
        onShare: inviteUrl || manualCode ? shareInvite : undefined,
      }}
      decks={{
        source: (render) => <LobbyDeckSource>{render}</LobbyDeckSource>,
        selectingSeats: selectingDeckSeats,
        onSelect: (seat, deckVersionId) => void chooseVersion(seat, deckVersionId),
        onManage: onManageDecks ? () => onManageDecks(lobby.system) : undefined,
      }}
      appearance={{
        saving: savingAppearance,
        proLocked: !billing.isCountPro,
        foil: billing.isFoil,
        save: saveAppearance,
        presentPaywall: async () => {
          await billing.presentPaywall()
        },
      }}
      onReport={(seat) =>
        seat.playerId
          ? setPlayerToReport({
              playerId: seat.playerId,
              seat: seat.seat,
              displayName: seat.displayName,
              color: seat.color,
              ...(shownMarkShape(seat) ? { shape: shownMarkShape(seat) } : {}),
              controlledByMe: false,
            })
          : undefined
      }
    >
      {playerToReport ? (
        <PlayerActionsDialog
          publicId={publicId}
          players={[playerToReport]}
          onClose={() => setPlayerToReport(undefined)}
        />
      ) : null}
    </LobbyView>
  )
}

function LobbyDeckSource({ children }: { children: (state: LobbyDeckState) => ReactNode }) {
  return (
    <ConvexQueryBoundary fallback={({ retry }) => children({ status: "error", retry })}>
      <LobbyDeckQuery>{children}</LobbyDeckQuery>
    </ConvexQueryBoundary>
  )
}

function LobbyDeckQuery({ children }: { children: (state: LobbyDeckState) => ReactNode }) {
  const result = useQuery(api.decks.listMine)
  return children(remoteValue(result?.decks))
}
