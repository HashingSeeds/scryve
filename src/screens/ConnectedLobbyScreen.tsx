import { useEffect, useRef, useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { ScrollView, Share, View } from "react-native"
import { useConvexConnectionState, useMutation, useQuery } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import type { DialogOrigin } from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { readPublicCloudConfig } from "@/features/auth/config"
import {
  lobbyDetail,
  lobbyExitCopy,
  onlineOnlyNotice,
  seatSummary,
  type LobbyExitAction,
} from "@/features/connected/connectedCopy"
import { InviteCard } from "@/features/connected/InviteCard"
import { buildInviteQrPayload, buildInviteUrl } from "@/features/connected/inviteLinks"
import { LobbySeatList } from "@/features/connected/LobbySeatList"
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
  const { themed } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const deviceId = useRef(new LocalGameRepository().getDeviceId()).current
  const lobby = useQuery(api.games.lobbyProjection, { publicId, deviceId })
  const decks = useQuery(api.decks.listMine)?.decks
  const { isWebSocketConnected } = useConvexConnectionState()
  const start = useMutation(api.games.startGame)
  const leave = useMutation(api.games.leaveMyGame)
  const abandon = useMutation(api.games.abandonGame)
  const selectDeck = useMutation(api.decks.selectForSeat)
  const [actionError, setActionError] = useState<string>()
  const [leaveAction, setLeaveAction] = useState<LobbyExitAction>()
  const [leaving, setLeaving] = useState(false)
  const [exitOrigin, setExitOrigin] = useState<DialogOrigin>()
  const [playerToReport, setPlayerToReport] = useState<ReportablePlayer>()
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
    try {
      setActionError(undefined)
      await selectDeck({ publicId, seat, deckVersionId: deckVersionId as Id<"deckVersions"> })
    } catch (cause) {
      setActionError(convexErrorMessage(cause, "Could not select deck"))
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

  if (lobby === undefined)
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
            <Text size="sm" style={themed($dimmed)} text="Loading lobby…" />
          </View>
          <LobbySkeleton />
        </ScrollView>
        <BottomActionBar>
          <Button text="Start game" preset="reversed" style={themed($primaryAction)} disabled />
        </BottomActionBar>
      </Screen>
    )

  const claimedSeats = lobby.players.length
  const openSeats = Math.max(0, lobby.playerCount - claimedSeats)
  const everySeatClaimed = claimedSeats === lobby.playerCount
  const exitAction: LobbyExitAction = lobby.isHost ? "abandon" : "leave"
  const exitCopy = lobbyExitCopy(exitAction)
  const startBlocked = !everySeatClaimed || !isWebSocketConnected
  const openExitCopy = leaveAction ? lobbyExitCopy(leaveAction) : undefined

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
          seatSummary={seatSummary(claimedSeats, lobby.playerCount)}
          onShare={inviteUrl || manualCode ? shareInvite : undefined}
        />
        <View style={themed($section)}>
          <Text
            preset="subheading"
            accessibilityRole="header"
            text={`Seats · ${claimedSeats} of ${lobby.playerCount}`}
          />
          <LobbySeatList
            seats={lobby.players}
            openSeats={openSeats}
            decks={decks}
            versionLabel={versionLabel}
            onSelectVersion={(seat, deckVersionId) => void chooseVersion(seat, deckVersionId)}
            onReport={(seat) =>
              seat.playerId
                ? setPlayerToReport({
                    playerId: seat.playerId,
                    seat: seat.seat,
                    displayName: seat.displayName,
                    color: seat.color,
                    controlledByMe: false,
                  })
                : undefined
            }
          />
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
              text="Start game"
              preset="reversed"
              style={themed($primaryAction)}
              disabled={startBlocked}
              onPress={async () => {
                if (!isWebSocketConnected) {
                  setActionError(onlineOnlyNotice("start"))
                  return
                }
                try {
                  setActionError(undefined)
                  await start({ publicId })
                } catch (cause) {
                  setActionError(
                    cause instanceof Error ? cause.message : "Could not start the game",
                  )
                }
              }}
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

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
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
