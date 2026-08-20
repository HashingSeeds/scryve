import { useEffect, useRef, useState } from "react"
import { Share, TextStyle, View, ViewStyle } from "react-native"
import { useConvexConnectionState, useMutation, useQuery } from "convex/react"
import QRCode from "react-native-qrcode-svg"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { FilterChips } from "@/components/FilterChips"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { readPublicCloudConfig } from "@/features/auth/config"
import { buildInviteQrPayload, buildInviteUrl } from "@/features/connected/inviteLinks"
import {
  PlayerActionsDialog,
  type ReportablePlayer,
} from "@/features/connected/PlayerActionsDialog"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { versionLabel } from "../../convex/lib/deckVersions"

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
  const decks = useQuery(api.decks.listMine)?.decks
  const { isWebSocketConnected } = useConvexConnectionState()
  const start = useMutation(api.games.startGame)
  const leave = useMutation(api.games.leaveMyGame)
  const abandon = useMutation(api.games.abandonGame)
  const selectDeck = useMutation(api.decks.selectForSeat)
  const [actionError, setActionError] = useState<string>()
  const [leaveAction, setLeaveAction] = useState<"leave" | "abandon">()
  const [leaving, setLeaving] = useState(false)
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

  async function chooseVersion(seat: number, deckVersionId: Id<"deckVersions">) {
    try {
      setActionError(undefined)
      await selectDeck({ publicId, seat, deckVersionId })
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

  if (lobby === undefined)
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]} contentInset="standard">
        <Header
          title="Connected lobby"
          leftTx={onBack ? "common:back" : undefined}
          onLeftPress={onBack}
        />
        <Text text="Loading lobby…" />
      </Screen>
    )
  return (
    <Screen
      preset="auto"
      safeAreaEdges={["bottom"]}
      contentInset="standard"
      contentContainerStyle={$content}
    >
      <Header
        title="Connected lobby"
        leftTx={onBack ? "common:back" : undefined}
        onLeftPress={onBack}
      />
      {inviteQrPayload ? (
        <View style={$qr}>
          <QRCode
            testID="invite-qr"
            value={inviteQrPayload}
            size={184}
            quietZone={16}
            color="#000000"
            backgroundColor="#FFFFFF"
            ecl="H"
          />
        </View>
      ) : null}
      {manualCode ? (
        <Text
          testID="manual-code"
          preset="subheading"
          text={`Code: ${manualCode}`}
          style={$centeredText}
        />
      ) : null}
      {manualCode ? (
        <Text size="xs" text={`Scan to join or enter code ${manualCode}.`} style={$centeredText} />
      ) : null}
      <Text
        style={$centeredText}
        text={`${lobby.players.length} of ${lobby.playerCount} seats claimed · ${lobby.startingLife} life · ${lobby.ruleset}`}
      />
      <View style={$players}>
        {lobby.players.map((player) => {
          const chosenDeck = decks?.find((deck) =>
            deck.versions.some((version) => version._id === player.deckVersionId),
          )
          const chosenVersion = chosenDeck?.versions.find(
            (version) => version._id === player.deckVersionId,
          )
          return (
            <View key={player.playerId ?? `seat-${player.seat}`} style={$players}>
              <Card
                heading={player.displayName}
                content={
                  player.controlledByMe
                    ? chosenDeck
                      ? `Your seat · ${chosenDeck.name} · ${versionLabel(chosenVersion ?? { versionNumber: 1 })}`
                      : "Your seat · no deck selected"
                    : `Seat ${player.seat} · ${player.deckVersionId ? "deck selected" : "no deck selected"}`
                }
                RightComponent={
                  !player.controlledByMe && player.playerId ? (
                    <Button
                      testID={`lobby-report-player-seat-${player.seat}`}
                      text="Report"
                      style={$reportAction}
                      onPress={() =>
                        setPlayerToReport({
                          playerId: player.playerId,
                          seat: player.seat,
                          displayName: player.displayName,
                          color: player.color,
                          controlledByMe: false,
                        })
                      }
                    />
                  ) : undefined
                }
              />
              {player.controlledByMe && decks?.length ? (
                <View style={$deckChoices}>
                  <FilterChips
                    testID={`seat-${player.seat}-deck`}
                    accessibilityLabel="Deck"
                    chips={decks
                      .filter((deck) => deck.versions.length > 0)
                      .map((deck) => ({ id: deck._id, label: deck.name }))}
                    selectedId={chosenDeck?._id ?? ""}
                    onSelect={(deckId) => {
                      const deck = decks.find((candidate) => candidate._id === deckId)
                      const version = deck?.versions[deck.versions.length - 1]
                      if (version) void chooseVersion(player.seat, version._id)
                    }}
                  />
                  {chosenDeck && chosenDeck.versions.length > 1 ? (
                    <FilterChips
                      testID={`seat-${player.seat}-version`}
                      accessibilityLabel="Deck version"
                      chips={chosenDeck.versions.map((version) => ({
                        id: version._id,
                        label: versionLabel(version),
                      }))}
                      selectedId={player.deckVersionId ?? ""}
                      onSelect={(versionId) =>
                        void chooseVersion(
                          player.seat,
                          versionId as (typeof chosenDeck.versions)[number]["_id"],
                        )
                      }
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
      {inviteUrl || manualCode ? (
        <Button
          testID="share-invite-button"
          text="Share invite"
          style={$compactButton}
          onPress={shareInvite}
        />
      ) : null}
      {actionError ? (
        <Text
          testID="connected-action-error"
          accessibilityRole="alert"
          text={`${actionError} Check your connection and current lobby state, then try again.`}
        />
      ) : null}
      {lobby.isHost ? (
        <Button
          testID="start-connected-game-button"
          text="Start game"
          preset="reversed"
          style={$primaryAction}
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
        <Text text="Waiting for the host to start." style={$centeredText} />
      )}
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
          <Button
            text="Cancel"
            style={$compactButton}
            disabled={leaving}
            onPress={() => setLeaveAction(undefined)}
          />
          <Button
            testID={`confirm-connected-lobby-${leaveAction}-button`}
            text={leaveAction === "abandon" ? "Abandon lobby" : "Leave lobby"}
            preset="reversed"
            style={$compactButton}
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
              style={$secondaryAction}
              textStyle={$secondaryActionText}
              disabled={!isWebSocketConnected}
              onPress={() => setLeaveAction("leave")}
            />
          ) : null}
          {lobby.isHost ? (
            <Button
              testID="abandon-connected-lobby-button"
              text="Abandon lobby"
              style={$secondaryAction}
              textStyle={$secondaryActionText}
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

const $content: ViewStyle = { gap: 12 }
const $qr: ViewStyle = { alignItems: "center", marginVertical: 4 }
const $centeredText: TextStyle = { textAlign: "center" }
const $compactButton: ViewStyle = { minHeight: 48 }
const $primaryAction: ViewStyle = { minHeight: 52, marginTop: 4 }
const $secondaryAction: ViewStyle = {
  minHeight: 44,
  borderWidth: 0,
  backgroundColor: "transparent",
}
const $secondaryActionText: TextStyle = { textDecorationLine: "underline" }
const $confirmation = {
  gap: 8,
  padding: 12,
  marginVertical: 4,
  borderWidth: 1,
  borderColor: "#C03403",
  borderRadius: 8,
} as const
const $leaveActions = { gap: 8 } as const
const $players = { gap: 8 } as const
const $deckChoices = { gap: 4, minWidth: 120 } as const
const $reportAction: ViewStyle = { minHeight: 44, minWidth: 96 }
