import { useState } from "react"
import { View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"
import { useUser } from "@clerk/expo"

import { Button } from "@/components/Button"
import { ConnectionBadge } from "@/components/ConnectionBadge"
import { Header } from "@/components/Header"
import { PlayerGrid } from "@/components/PlayerGrid"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useConnectedGame } from "@/features/connected/useConnectedGame"
import { asPlayerId } from "@/features/game/domain"
import type { GamePlayer } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function ConnectedBoardScreen(props: {
  publicId: string
  onBack?: () => void
  onHistory?: () => void
}) {
  const { isLoaded, user } = useUser()
  if (!isLoaded || !user?.id)
    return (
      <Screen preset="auto">
        <Header
          title="Connected game"
          leftTx={props.onBack ? "common:back" : undefined}
          onLeftPress={props.onBack}
        />
        <Text text="Loading your connected-game session…" />
      </Screen>
    )
  const ownerId = user.id
  return <ConnectedBoardRuntime key={`${ownerId}:${props.publicId}`} {...props} ownerId={ownerId} />
}

function ConnectedBoardRuntime({
  publicId,
  onBack,
  onHistory,
  ownerId,
}: {
  publicId: string
  onBack?: () => void
  onHistory?: () => void
  ownerId: string
}) {
  useKeepAwake("count-connected-game")
  const { themed } = useAppTheme()
  const runtime = useConnectedGame(publicId, ownerId)
  const [confirmingFinish, setConfirmingFinish] = useState(false)
  const game = runtime.projection
  if (!game)
    return (
      <Screen preset="auto">
        <Header
          title="Connected game"
          leftTx={onBack ? "common:back" : undefined}
          onLeftPress={onBack}
        />
        <Text text="Loading connected board…" />
      </Screen>
    )

  const players: GamePlayer[] = game.players.map((player) => ({
    id: asPlayerId(player.playerId),
    name: player.displayName,
    color: player.color,
    life: player.currentLife,
    seat: player.seat,
  }))
  const controlled = new Set(
    game.players.filter((player) => player.controlledByMe).map((player) => player.playerId),
  )
  const active = game.status === "active"
  const finished = game.status === "finished"
  const finishBlockedReason =
    runtime.connectionStatus === "offline"
      ? "Reconnect before finishing; this operation is online-only."
      : runtime.pending.length > 0
        ? `Wait for ${runtime.pending.length} pending ${runtime.pending.length === 1 ? "change" : "changes"} to sync before finishing.`
        : runtime.failed.length > 0
          ? "Review failed life changes before finishing."
          : undefined

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top", "bottom"]}
      ScrollViewProps={{ testID: "connected-game-board-scroll" }}
      contentContainerStyle={themed($screen)}
    >
      <Header
        title={finished ? "Connected summary" : "Connected game"}
        leftTx={onBack ? "common:back" : undefined}
        onLeftPress={onBack}
      />
      <View style={themed($statusRow)}>
        <ConnectionBadge
          status={runtime.connectionStatus}
          pendingCount={runtime.pending.length}
          failedCount={runtime.failed.length}
        />
        <Text
          text={
            finished
              ? `${game.eventSequence} accepted life changes · final`
              : `${game.ruleset} · ${game.startingLife} starting life`
          }
          size="xs"
          style={themed($muted)}
        />
      </View>
      {runtime.failed.map((failure) => (
        <View
          key={failure.action.event.operationId}
          testID="connected-failed-action"
          accessibilityRole="alert"
          style={themed($failure)}
        >
          <Text
            text={`A ${failure.action.event.delta > 0 ? "+" : ""}${failure.action.event.delta} life change could not sync: ${failure.reason}`}
          />
          <Button
            text="Dismiss after reviewing"
            onPress={() => runtime.dismissFailed(failure.action.event.operationId)}
          />
        </View>
      ))}
      {runtime.changeError ? (
        <Text
          testID="connected-change-error"
          accessibilityRole="alert"
          text={runtime.changeError}
        />
      ) : null}
      {runtime.finishError ? (
        <Text
          testID="connected-finish-error"
          accessibilityRole="alert"
          text={runtime.finishError}
        />
      ) : null}
      {!active && !finished ? (
        <Text
          accessibilityRole="alert"
          text={`This game is ${game.status} and is read-only on the board.`}
        />
      ) : null}
      <PlayerGrid
        players={players}
        disabled={!active || confirmingFinish}
        isPlayerDisabled={(player) => !controlled.has(player.id)}
        getPendingCount={(player) =>
          runtime.pending.filter((action) => action.event.playerId === player.id).length
        }
        onChange={(playerId, delta) => runtime.changeLife(playerId, delta)}
      />
      <View style={themed($actions)}>
        {active && game.isHost ? (
          <>
            {finishBlockedReason ? (
              <Text accessibilityRole="alert" text={finishBlockedReason} />
            ) : null}
            {confirmingFinish ? (
              <View
                testID="connected-finish-confirmation"
                accessibilityRole="alert"
                style={themed($confirmation)}
              >
                <Text
                  weight="bold"
                  text="Finish this connected game and save an immutable final summary?"
                  style={themed($confirmationText)}
                />
                <Button
                  testID="cancel-connected-finish-button"
                  text="Cancel"
                  disabled={runtime.finishing}
                  onPress={() => setConfirmingFinish(false)}
                />
                <Button
                  testID="confirm-connected-finish-button"
                  text={runtime.finishing ? "Finishing…" : "Finish game"}
                  preset="reversed"
                  disabled={runtime.finishing || Boolean(finishBlockedReason)}
                  onPress={() => {
                    void runtime.finish().finally(() => setConfirmingFinish(false))
                  }}
                />
              </View>
            ) : (
              <Button
                testID="finish-connected-game-button"
                text="Finish game"
                disabled={runtime.finishing || Boolean(finishBlockedReason)}
                onPress={() => setConfirmingFinish(true)}
              />
            )}
          </>
        ) : null}
        {finished && onHistory ? <Button text="Connected history" onPress={onHistory} /> : null}
      </View>
    </Screen>
  )
}

const $screen: ThemedStyle<any> = ({ spacing }) => ({ flexGrow: 1, gap: spacing.sm })
const $statusRow: ThemedStyle<any> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.md,
})
const $muted: ThemedStyle<any> = ({ colors }) => ({ color: colors.textDim })
const $failure: ThemedStyle<any> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  marginHorizontal: spacing.md,
  padding: spacing.sm,
  borderWidth: 1,
  borderColor: colors.error,
  borderRadius: spacing.sm,
})
const $actions: ThemedStyle<any> = ({ spacing }) => ({ padding: spacing.sm })
const $confirmation: ThemedStyle<any> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  flexWrap: "wrap",
  gap: spacing.xs,
  padding: spacing.sm,
  borderWidth: 1,
  borderColor: colors.error,
  borderRadius: spacing.sm,
})
const $confirmationText: ThemedStyle<any> = () => ({ flexGrow: 1, flexShrink: 1 })
