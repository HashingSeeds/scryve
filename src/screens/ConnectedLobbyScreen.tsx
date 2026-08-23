import { useEffect, useRef, useState, type ReactNode } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { ScrollView, Share, View } from "react-native"
import { useConvexConnectionState, useMutation, useQuery } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import {
  $dialogActions,
  $dialogButton,
  DialogCard,
  type DialogOrigin,
} from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { remoteValue } from "@/features/async/remoteState"
import { readPublicCloudConfig } from "@/features/auth/config"
import { AppearancePicker } from "@/features/connected/AppearancePicker"
import {
  lobbyDetail,
  lobbyExitCopy,
  onlineOnlyNotice,
  seatSummary,
  type LobbyExitAction,
} from "@/features/connected/connectedCopy"
import { InviteCard } from "@/features/connected/InviteCard"
import { buildInviteQrPayload, buildInviteUrl } from "@/features/connected/inviteLinks"
import { LobbySeatList, type LobbyDeckState } from "@/features/connected/LobbySeatList"
import {
  PlayerActionsDialog,
  type ReportablePlayer,
} from "@/features/connected/PlayerActionsDialog"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { isPlayerMarkShape, shapeForSeat, type PlayerAppearance } from "../../convex/lib/appearance"
import { versionLabel } from "../../convex/lib/deckVersions"

const LOBBY_TITLE = "Lobby"

function LobbySkeleton() {
  const { themed } = useAppTheme()
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading lobby"
      style={themed($skeleton)}
    >
      <View style={themed($skeletonInvite)} />
      {Array.from({ length: 2 }).map((_, index) => (
        <View key={index} testID="lobby-skeleton-seat" style={themed($skeletonSeat)} />
      ))}
    </View>
  )
}

export function ConnectedLobbyScreen({
  publicId,
  onStarted,
  onBack,
  onLeft,
}: {
  publicId: string
  onStarted: () => void
  onBack?: () => void
  onLeft?: () => void
}) {
  return (
    <ConvexQueryBoundary
      resetKey={publicId}
      fallback={({ retry }) => (
        <LobbyStatusScreen
          message="This lobby is unavailable."
          error
          retry={retry}
          onBack={onBack}
        />
      )}
    >
      <ConnectedLobbyContent
        publicId={publicId}
        onStarted={onStarted}
        onBack={onBack}
        onLeft={onLeft}
      />
    </ConvexQueryBoundary>
  )
}

function ConnectedLobbyContent({
  publicId,
  onStarted,
  onBack,
  onLeft,
}: {
  publicId: string
  onStarted: () => void
  onBack?: () => void
  onLeft?: () => void
}) {
  const { themed } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const deviceId = useRef(new LocalGameRepository().getDeviceId()).current
  const lobby = useQuery(api.games.lobbyProjection, { publicId, deviceId })
  const { isWebSocketConnected } = useConvexConnectionState()
  const start = useMutation(api.games.startGame)
  const leave = useMutation(api.games.leaveMyGame)
  const abandon = useMutation(api.games.abandonGame)
  const selectDeck = useMutation(api.decks.selectForSeat)
  const setAppearance = useMutation(api.games.setMyAppearance)
  const [actionError, setActionError] = useState<string>()
  const [leaveAction, setLeaveAction] = useState<LobbyExitAction>()
  const [leaving, setLeaving] = useState(false)
  const [exitOrigin, setExitOrigin] = useState<DialogOrigin>()
  const [playerToReport, setPlayerToReport] = useState<ReportablePlayer>()
  const [appearanceSeat, setAppearanceSeat] = useState<number>()
  const [appearanceDraft, setAppearanceDraft] = useState<PlayerAppearance>()
  const [appearanceOrigin, setAppearanceOrigin] = useState<DialogOrigin>()
  const [savingAppearance, setSavingAppearance] = useState(false)
  const [starting, setStarting] = useState(false)
  const [selectingDeckSeats, setSelectingDeckSeats] = useState<ReadonlySet<number>>(new Set())
  const startInFlight = useRef(false)
  const selectingDeckSeatsInFlight = useRef(new Set<number>())
  const didNavigateToGame = useRef(false)

  useEffect(() => {
    if (lobby?.status === "active" && !didNavigateToGame.current) {
      didNavigateToGame.current = true
      onStarted()
    }
  }, [lobby?.status, onStarted])
  const origin = readPublicCloudConfig()
  const inviteUrl =
    lobby?.invitation?.token && origin.configured
      ? buildInviteUrl(origin.value.inviteOrigin, lobby.invitation.token)
      : undefined
  const inviteQrPayload = lobby?.invitation?.token
    ? buildInviteQrPayload(lobby.invitation.token, lobby.invitation.manualCode)
    : null
  const manualCode = lobby?.invitation?.manualCode

  async function chooseVersion(seat: number, deckVersionId: string) {
    if (selectingDeckSeatsInFlight.current.has(seat)) return
    if (!isWebSocketConnected) {
      setActionError(onlineOnlyNotice("deck"))
      return
    }
    selectingDeckSeatsInFlight.current.add(seat)
    setSelectingDeckSeats(new Set(selectingDeckSeatsInFlight.current))
    try {
      setActionError(undefined)
      await selectDeck({ publicId, seat, deckVersionId: deckVersionId as Id<"deckVersions"> })
    } catch (cause) {
      setActionError(convexErrorMessage(cause, "Could not select deck"))
    } finally {
      selectingDeckSeatsInFlight.current.delete(seat)
      setSelectingDeckSeats(new Set(selectingDeckSeatsInFlight.current))
    }
  }

  async function startGame() {
    if (startInFlight.current) return
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
      setActionError(cause instanceof Error ? cause.message : "Could not start the game")
    } finally {
      startInFlight.current = false
      setStarting(false)
    }
  }

  async function shareInvite() {
    try {
      setActionError(undefined)
      if (inviteUrl) {
        await Share.share({ message: `Join my Scryve game: ${inviteUrl}`, url: inviteUrl })
      } else if (manualCode) {
        await Share.share({ message: `Join my Scryve game with code ${manualCode}` })
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not open sharing")
    }
  }

  async function saveAppearance() {
    if (appearanceSeat === undefined || !appearanceDraft) return
    try {
      setSavingAppearance(true)
      setActionError(undefined)
      await setAppearance({ publicId, seat: appearanceSeat, ...appearanceDraft })
      setAppearanceSeat(undefined)
    } catch (cause) {
      setActionError(convexErrorMessage(cause, "Could not update your color and mark"))
    } finally {
      setSavingAppearance(false)
    }
  }

  function openExitDialog(action: LobbyExitAction, event?: GestureResponderEvent) {
    setExitOrigin(
      event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : undefined,
    )
    setLeaveAction(action)
  }

  async function confirmExit() {
    if (!leaveAction) return
    if (!isWebSocketConnected) {
      setActionError(onlineOnlyNotice("exit"))
      return
    }
    try {
      setLeaving(true)
      setActionError(undefined)
      if (leaveAction === "abandon") await abandon({ publicId })
      else await leave({ publicId, deviceId })
      setLeaveAction(undefined)
      onLeft?.()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not leave lobby")
    } finally {
      setLeaving(false)
    }
  }

  if (lobby === undefined) return <LobbyStatusScreen message="Loading lobby…" onBack={onBack} />

  const claimedSeats = lobby.players.length
  const openSeats = Math.max(0, lobby.playerCount - claimedSeats)
  const everySeatClaimed = claimedSeats === lobby.playerCount
  const exitAction: LobbyExitAction = lobby.isHost ? "abandon" : "leave"
  const exitCopy = lobbyExitCopy(exitAction)
  const startBlocked = !everySeatClaimed || !isWebSocketConnected || starting
  const openExitCopy = leaveAction ? lobbyExitCopy(leaveAction) : undefined
  const takenAppearances = lobby.players
    .filter((player) => player.seat !== appearanceSeat)
    .map((player) => ({
      color: player.color,
      shape: isPlayerMarkShape(player.shape) ? player.shape : shapeForSeat(player.seat),
    }))

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header
        title={titleVisible ? LOBBY_TITLE : ""}
        leftTx={onBack ? "common:back" : undefined}
        onLeftPress={onBack}
      />
      <ScrollView
        style={$styles.flex1}
        contentContainerStyle={themed($content)}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={themed($hero)}>
          <Text preset="heading" text={LOBBY_TITLE} />
          <Text
            size="sm"
            style={themed($dimmed)}
            text={lobbyDetail(lobby.startingLife, lobby.ruleset)}
          />
        </View>
        <InviteCard
          qrPayload={inviteQrPayload}
          manualCode={manualCode}
          onShare={inviteUrl || manualCode ? shareInvite : undefined}
        />
        <View style={themed($section)}>
          <Text
            preset="subheading"
            accessibilityRole="header"
            text={`Seats · ${claimedSeats} of ${lobby.playerCount}`}
          />
          <LobbyDeckSource>
            {(deckState) => (
              <LobbySeatList
                seats={lobby.players}
                openSeats={openSeats}
                deckState={deckState}
                versionLabel={versionLabel}
                selectingDeckSeats={selectingDeckSeats}
                onSelectVersion={(seat, deckVersionId) => void chooseVersion(seat, deckVersionId)}
                onEditAppearance={(seat, event) => {
                  setAppearanceOrigin(
                    event?.nativeEvent
                      ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
                      : undefined,
                  )
                  setAppearanceDraft({
                    color: seat.color,
                    shape: isPlayerMarkShape(seat.shape) ? seat.shape : shapeForSeat(seat.seat),
                  })
                  setAppearanceSeat(seat.seat)
                }}
                onReport={(seat) =>
                  seat.playerId
                    ? setPlayerToReport({
                        playerId: seat.playerId,
                        seat: seat.seat,
                        displayName: seat.displayName,
                        color: seat.color,
                        ...(isPlayerMarkShape(seat.shape) ? { shape: seat.shape } : {}),
                        controlledByMe: false,
                      })
                    : undefined
                }
              />
            )}
          </LobbyDeckSource>
        </View>
      </ScrollView>
      <BottomActionBar>
        {actionError && !openExitCopy ? (
          <AlertNote testID="connected-action-error" text={actionError} />
        ) : null}
        {lobby.isHost && !isWebSocketConnected ? (
          <AlertNote testID="connected-start-offline" text={onlineOnlyNotice("start")} />
        ) : null}
        {lobby.isHost ? (
          <>
            <Button
              testID="start-connected-game-button"
              text={starting ? "Starting\u2026" : "Start game"}
              preset="reversed"
              style={themed($primaryAction)}
              disabled={startBlocked}
              onPress={() => void startGame()}
            />
            {!everySeatClaimed && isWebSocketConnected ? (
              <Text
                size="xxs"
                style={themed($actionHint)}
                text={seatSummary(claimedSeats, lobby.playerCount)}
              />
            ) : null}
          </>
        ) : (
          <Text size="sm" style={themed($actionHint)} text="Waiting for the host to start." />
        )}
        <Button
          testID={`${exitAction}-connected-lobby-button`}
          text={exitCopy.confirmText}
          style={themed($secondaryAction)}
          textStyle={themed($secondaryActionText)}
          onPress={(event) => openExitDialog(exitAction, event)}
        />
      </BottomActionBar>
      {leaveAction && openExitCopy ? (
        <ConfirmDialog
          visible
          origin={exitOrigin}
          title={openExitCopy.title}
          message={openExitCopy.message}
          confirmText={openExitCopy.confirmText}
          destructive={leaveAction === "abandon"}
          busy={leaving}
          confirmDisabled={!isWebSocketConnected}
          dialogTestID="connected-lobby-leave-confirmation"
          confirmTestID={`confirm-connected-lobby-${leaveAction}-button`}
          cancelTestID={`cancel-connected-lobby-${leaveAction}-button`}
          backdropTestID="connected-lobby-leave-backdrop"
          backdropAccessibilityLabel="Keep this lobby open"
          notice={
            actionError ? (
              <AlertNote testID="connected-action-error" text={actionError} />
            ) : !isWebSocketConnected ? (
              <AlertNote testID="connected-lobby-exit-offline" text={onlineOnlyNotice("exit")} />
            ) : null
          }
          onConfirm={() => void confirmExit()}
          onClose={() => setLeaveAction(undefined)}
        />
      ) : null}
      {appearanceSeat !== undefined && appearanceDraft ? (
        <DialogCard
          visible
          onClose={() => setAppearanceSeat(undefined)}
          closeDisabled={savingAppearance}
          origin={appearanceOrigin}
          backdropTestID="lobby-appearance-backdrop"
          backdropAccessibilityLabel="Close color and mark picker"
          dialogTestID="lobby-appearance-dialog"
          accessibilityViewIsModal
        >
          <Text preset="subheading" text="Your color and mark" />
          <AppearancePicker
            value={appearanceDraft}
            taken={takenAppearances}
            onChange={setAppearanceDraft}
          />
          <View style={themed($dialogActions)}>
            <Button
              testID="cancel-appearance-button"
              text="Cancel"
              style={themed($dialogButton)}
              disabled={savingAppearance}
              onPress={() => setAppearanceSeat(undefined)}
            />
            <Button
              testID="save-appearance-button"
              text={savingAppearance ? "Saving…" : "Save"}
              preset="reversed"
              style={themed($dialogButton)}
              disabled={savingAppearance}
              onPress={() => void saveAppearance()}
            />
          </View>
        </DialogCard>
      ) : null}
      {playerToReport ? (
        <PlayerActionsDialog
          publicId={publicId}
          players={[playerToReport]}
          initialPlayer={playerToReport}
          onClose={() => setPlayerToReport(undefined)}
        />
      ) : null}
    </Screen>
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

function LobbyStatusScreen({
  message,
  error = false,
  retry,
  onBack,
}: {
  message: string
  error?: boolean
  retry?: () => void
  onBack?: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header title="" leftTx={onBack ? "common:back" : undefined} onLeftPress={onBack} />
      <ScrollView
        style={$styles.flex1}
        contentContainerStyle={themed($content)}
        scrollEnabled={false}
      >
        <View style={themed($hero)}>
          <Text preset="heading" text={LOBBY_TITLE} />
          {error ? (
            <AlertNote text={message} />
          ) : (
            <Text
              accessibilityRole="progressbar"
              accessibilityLiveRegion="polite"
              size="sm"
              style={themed($dimmed)}
              text={message}
            />
          )}
        </View>
        <LobbySkeleton />
        {error && retry ? (
          <Button testID="retry-lobby-button" text="Try again" onPress={retry} />
        ) : null}
      </ScrollView>
      <BottomActionBar>
        <Button text="Start game" preset="reversed" style={themed($primaryAction)} disabled />
      </BottomActionBar>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  gap: spacing.md,
  padding: spacing.lg,
  paddingBottom: spacing.xl,
})
const $hero: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $dimmed: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $primaryAction: ThemedStyle<ViewStyle> = () => ({ minHeight: 52 })
const $secondaryAction: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: 44,
  borderWidth: 0,
  backgroundColor: colors.transparent,
})
const $secondaryActionText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 15,
})
const $actionHint: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})
const $skeleton: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $skeletonInvite: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  height: 320,
  borderRadius: spacing.md,
  backgroundColor: colors.palette.neutral300,
  opacity: 0.4,
})
const $skeletonSeat: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  height: 64,
  borderRadius: spacing.sm,
  backgroundColor: colors.palette.neutral300,
  opacity: 0.4,
})
