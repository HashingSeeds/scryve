import { useEffect, useRef, useState } from "react"
import { Share, View } from "react-native"
import { useConvexConnectionState, useMutation, useQuery } from "convex/react"
import QRCode from "react-native-qrcode-svg"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { readPublicCloudConfig } from "@/features/auth/config"
import { buildInviteQrPayload, buildInviteUrl } from "@/features/connected/inviteLinks"
import { LocalGameRepository } from "@/features/game/localPersistence"

import { api } from "../../convex/_generated/api"

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
  const deviceId = useRef(new LocalGameRepository().getDeviceId()).current
  const lobby = useQuery(api.games.lobbyProjection, { publicId, deviceId })
  const { isWebSocketConnected } = useConvexConnectionState()
  const start = useMutation(api.games.startGame)
  const leave = useMutation(api.games.leaveMyGame)
  const abandon = useMutation(api.games.abandonGame)
  const [actionError, setActionError] = useState<string>()
  const [leaveAction, setLeaveAction] = useState<"leave" | "abandon">()
  const [leaving, setLeaving] = useState(false)
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
  if (lobby === undefined)
    return (
      <Screen preset="auto">
        <Header
          title="Connected lobby"
          leftTx={onBack ? "common:back" : undefined}
          onLeftPress={onBack}
        />
        <Text text="Loading lobby…" />
      </Screen>
    )
  return (
    <Screen preset="scroll" safeAreaEdges={["top", "bottom"]}>
      <Header
        title="Connected lobby"
        leftTx={onBack ? "common:back" : undefined}
        onLeftPress={onBack}
      />
      <Text preset="heading" accessibilityRole="header" text="Connected lobby" />
      <Text
        text={`${lobby.players.length} of ${lobby.playerCount} seats claimed · ${lobby.startingLife} life · ${lobby.ruleset}`}
      />
      {lobby.invitation?.manualCode ? (
        <>
          <Text
            testID="manual-code"
            preset="subheading"
            text={`Code: ${lobby.invitation.manualCode}`}
          />
          <Text
            text={`Can't scan the QR? Enter code ${lobby.invitation.manualCode} on the join screen.`}
          />
          <Button
            testID="share-manual-code-button"
            text="Share manual code"
            onPress={async () => {
              try {
                setActionError(undefined)
                await Share.share({
                  message: `Join my Count game with code ${lobby.invitation?.manualCode}`,
                })
              } catch (cause) {
                setActionError(cause instanceof Error ? cause.message : "Could not open sharing")
              }
            }}
          />
        </>
      ) : null}
      {inviteQrPayload ? (
        <View style={$qr}>
          <QRCode
            testID="invite-qr"
            value={inviteQrPayload}
            size={220}
            quietZone={24}
            color="#000000"
            backgroundColor="#FFFFFF"
            ecl="H"
          />
          <Text text="On the other device, open Join with code → Scan invite QR." />
        </View>
      ) : null}
      {inviteUrl ? (
        <Button
          testID="share-invite-button"
          text="Share HTTPS invite"
          onPress={async () => {
            try {
              setActionError(undefined)
              await Share.share({ message: `Join my Count game: ${inviteUrl}`, url: inviteUrl })
            } catch (cause) {
              setActionError(cause instanceof Error ? cause.message : "Could not open sharing")
            }
          }}
        />
      ) : null}
      {actionError ? (
        <Text
          testID="connected-action-error"
          accessibilityRole="alert"
          text={`${actionError} Check your connection and current lobby state, then try again.`}
        />
      ) : null}
      {leaveAction ? (
        <View
          testID="connected-lobby-leave-confirmation"
          accessibilityRole="alert"
          style={$confirmation}
        >
          <Text
            weight="bold"
            text={
              leaveAction === "abandon"
                ? "Abandon this lobby for everyone and save a terminal summary?"
                : "Leave this lobby from your resume list? Other players and history remain unchanged."
            }
          />
          <Button text="Cancel" disabled={leaving} onPress={() => setLeaveAction(undefined)} />
          <Button
            testID={`confirm-connected-lobby-${leaveAction}-button`}
            text={leaveAction === "abandon" ? "Abandon lobby" : "Leave lobby"}
            preset="reversed"
            disabled={leaving || !isWebSocketConnected}
            onPress={async () => {
              if (!isWebSocketConnected) {
                setActionError("Reconnect before leaving; this action is not queued.")
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
            }}
          />
        </View>
      ) : (
        <View style={$leaveActions}>
          {!lobby.isHost ? (
            <Button
              testID="leave-connected-lobby-button"
              text="Leave lobby"
              disabled={!isWebSocketConnected}
              onPress={() => setLeaveAction("leave")}
            />
          ) : null}
          {lobby.isHost ? (
            <Button
              testID="abandon-connected-lobby-button"
              text="Abandon lobby for everyone"
              disabled={!isWebSocketConnected}
              onPress={() => setLeaveAction("abandon")}
            />
          ) : null}
        </View>
      )}
      {!isWebSocketConnected ? (
        <Text
          testID="connected-lobby-exit-offline"
          accessibilityRole="alert"
          text="Reconnect before leaving or abandoning this lobby. These online-only actions are not queued."
        />
      ) : null}
      {lobby.isHost && !isWebSocketConnected ? (
        <Text
          testID="connected-start-offline"
          accessibilityRole="alert"
          text="Reconnect before starting. Start is online-only and will not be queued."
        />
      ) : null}
      <View style={$players}>
        {lobby.players.map((player: any) => (
          <Card
            key={player.seat}
            heading={`Seat ${player.seat}: ${player.displayName}`}
            content={`${player.currentLife} life`}
          />
        ))}
      </View>
      {lobby.isHost ? (
        <Button
          testID="start-connected-game-button"
          text="Start game"
          preset="reversed"
          disabled={lobby.players.length !== lobby.playerCount || !isWebSocketConnected}
          onPress={async () => {
            if (!isWebSocketConnected) {
              setActionError("Reconnect before starting; this action is not queued.")
              return
            }
            try {
              setActionError(undefined)
              await start({ publicId })
            } catch (cause) {
              setActionError(cause instanceof Error ? cause.message : "Could not start the game")
            }
          }}
        />
      ) : (
        <Text text="Waiting for the host to start." />
      )}
    </Screen>
  )
}

const $qr = { alignItems: "center", marginVertical: 16 } as const
const $players = { gap: 8, marginVertical: 16 }
const $confirmation = {
  gap: 8,
  padding: 12,
  marginVertical: 12,
  borderWidth: 1,
  borderColor: "#C03403",
  borderRadius: 8,
} as const
const $leaveActions = { gap: 8, marginVertical: 12 } as const
