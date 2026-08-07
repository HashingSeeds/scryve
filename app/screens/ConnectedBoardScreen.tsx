import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"
import { useUser } from "@clerk/expo"

import { Button } from "@/components/Button"
import { ConnectionBadge } from "@/components/ConnectionBadge"
import { GameRadialMenu, type RadialMenuAction } from "@/components/GameRadialMenu"
import { Header } from "@/components/Header"
import {
  getPlayerGridLayout,
  getPlayerGridLayoutOptions,
  getPlayerGridMenuAnchor,
  PlayerGrid,
  type PlayerGridLayoutVariant,
} from "@/components/PlayerGrid"
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
  const { width, height, fontScale } = useWindowDimensions()
  const runtime = useConnectedGame(publicId, ownerId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [confirmingFinish, setConfirmingFinish] = useState(false)
  const [layoutVariant, setLayoutVariant] = useState<PlayerGridLayoutVariant>("auto")
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
  const layoutOptions = getPlayerGridLayoutOptions(players.length)
  const gridLayout = getPlayerGridLayout({
    playerCount: players.length,
    width,
    height,
    fontScale,
    layoutVariant,
  })
  const menuAnchor = getPlayerGridMenuAnchor(players.length, gridLayout)
  const radialActions: RadialMenuAction[] = [
    {
      id: "connected-layout",
      label: "Layout",
      glyph: "▦",
      color: "#FBC878",
      onPress: () => {
        setMenuOpen(false)
        setLayoutPickerOpen(true)
      },
    },
    {
      id: "connected-status",
      label: runtime.connectionStatus === "connected" ? "Status" : runtime.connectionStatus,
      glyph: "●",
      color:
        runtime.connectionStatus === "connected"
          ? "#55C894"
          : runtime.connectionStatus === "offline"
            ? "#D96767"
            : "#FBC878",
      onPress: () => {
        setMenuOpen(false)
        setStatusOpen(true)
      },
    },
  ]
  if (onBack) {
    radialActions.push({
      id: "connected-back",
      label: "Back",
      glyph: "←",
      color: "#7DB7E8",
      onPress: () => {
        setMenuOpen(false)
        onBack()
      },
    })
  }
  if (active && game.isHost) {
    radialActions.push({
      id: "finish-connected-game",
      label: "End game",
      glyph: "✓",
      color: "#D96767",
      disabled: runtime.finishing || Boolean(finishBlockedReason),
      onPress: () => {
        setMenuOpen(false)
        setConfirmingFinish(true)
      },
    })
  } else if (finished && onHistory) {
    radialActions.push({
      id: "connected-history",
      label: "History",
      glyph: "↶",
      color: "#A995E8",
      onPress: () => {
        setMenuOpen(false)
        onHistory()
      },
    })
  }

  const overlayOpen = menuOpen || statusOpen || layoutPickerOpen || confirmingFinish

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={[]}
      SystemBarsProps={{ hidden: true }}
      contentContainerStyle={themed($screen)}
    >
      <View testID="connected-game-board" style={themed($board)}>
        <PlayerGrid
          players={players}
          layoutVariant={layoutVariant}
          disabled={!active || overlayOpen}
          isPlayerDisabled={(player) => !controlled.has(player.id)}
          isPlayerOwned={(player) => controlled.has(player.id)}
          getPendingCount={(player) =>
            runtime.pending.filter((action) => action.event.playerId === player.id).length
          }
          onChange={(playerId, delta) => runtime.changeLife(playerId, delta)}
        />
        <GameRadialMenu
          open={menuOpen}
          anchor={menuAnchor}
          compact={players.length > 2}
          actions={radialActions}
          onToggle={() => setMenuOpen((current) => !current)}
          onClose={() => setMenuOpen(false)}
        />
      </View>

      {layoutPickerOpen ? (
        <Modal transparent animationType="fade" onRequestClose={() => setLayoutPickerOpen(false)}>
          <Pressable
            testID="connected-layout-backdrop"
            accessibilityRole="button"
            accessibilityLabel="Close layout chooser"
            style={themed($dialogBackdrop)}
            onPress={() => setLayoutPickerOpen(false)}
          >
            <Pressable
              testID="connected-layout-dialog"
              accessibilityViewIsModal
              style={[themed($dialog), themed($wideDialog)]}
              onPress={() => {}}
            >
              <Text text="Layout" preset="subheading" style={themed($dialogText)} />
              <View style={themed($layoutOptions)}>
                {layoutOptions.map((option) => (
                  <Button
                    key={option.variant}
                    testID={`connected-layout-${option.variant}`}
                    text={option.label}
                    accessibilityState={{ selected: layoutVariant === option.variant }}
                    preset={layoutVariant === option.variant ? "reversed" : "default"}
                    style={themed($layoutOption)}
                    onPress={() => {
                      setLayoutVariant(option.variant)
                      setLayoutPickerOpen(false)
                    }}
                  />
                ))}
              </View>
              <Button text="Cancel" onPress={() => setLayoutPickerOpen(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {statusOpen ? (
        <Modal transparent animationType="fade" onRequestClose={() => setStatusOpen(false)}>
          <Pressable
            testID="connected-status-backdrop"
            accessibilityRole="button"
            accessibilityLabel="Close connected-game status"
            style={themed($dialogBackdrop)}
            onPress={() => setStatusOpen(false)}
          >
            <Pressable
              testID="connected-status-dialog"
              accessibilityViewIsModal
              style={[themed($dialog), themed($wideDialog)]}
              onPress={() => {}}
            >
              <Text
                text={finished ? "Connected summary" : "Connected game"}
                preset="subheading"
                style={themed($dialogText)}
              />
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
              <ScrollView style={themed($statusScroll)} contentContainerStyle={themed($statusList)}>
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
                {finishBlockedReason ? (
                  <Text accessibilityRole="alert" text={finishBlockedReason} />
                ) : null}
              </ScrollView>
              <Button text="Close" onPress={() => setStatusOpen(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {confirmingFinish ? (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => !runtime.finishing && setConfirmingFinish(false)}
        >
          <Pressable
            testID="connected-finish-backdrop"
            accessibilityRole="button"
            accessibilityLabel="Cancel ending the connected game"
            style={themed($dialogBackdrop)}
            onPress={() => !runtime.finishing && setConfirmingFinish(false)}
          >
            <Pressable
              testID="connected-finish-confirmation"
              accessibilityRole="alert"
              style={themed($dialog)}
              onPress={() => {}}
            >
              <Text
                weight="bold"
                text="End this connected game and save an immutable final summary?"
                style={themed($dialogText)}
              />
              <View style={themed($dialogActions)}>
                <Button
                  testID="cancel-connected-finish-button"
                  text="Cancel"
                  disabled={runtime.finishing}
                  style={themed($dialogButton)}
                  onPress={() => setConfirmingFinish(false)}
                />
                <Button
                  testID="confirm-connected-finish-button"
                  text={runtime.finishing ? "Ending…" : "End game"}
                  preset="reversed"
                  disabled={runtime.finishing || Boolean(finishBlockedReason)}
                  style={themed($dialogButton)}
                  onPress={() => {
                    void runtime.finish().finally(() => setConfirmingFinish(false))
                  }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $board: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $dialogBackdrop: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  padding: spacing.lg,
  backgroundColor: colors.palette.overlay50,
})
const $dialog: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: "100%",
  maxWidth: 420,
  maxHeight: "82%",
  gap: spacing.md,
  padding: spacing.lg,
  borderRadius: spacing.lg,
  borderWidth: 1,
  borderColor: colors.separator,
  backgroundColor: colors.background,
  shadowColor: colors.palette.neutral900,
  shadowOffset: { width: 0, height: spacing.xxs },
  shadowOpacity: 0.35,
  shadowRadius: spacing.md,
  elevation: 16,
})
const $wideDialog: ThemedStyle<ViewStyle> = () => ({ maxWidth: 520 })
const $dialogText: ThemedStyle<TextStyle> = () => ({ textAlign: "center" })
const $dialogActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
const $dialogButton: ThemedStyle<ViewStyle> = () => ({ flex: 1, minHeight: 48 })
const $layoutOptions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $layoutOption: ThemedStyle<ViewStyle> = () => ({
  minWidth: 96,
  minHeight: 44,
  flexGrow: 1,
})
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})
const $statusScroll: ThemedStyle<ViewStyle> = () => ({ flexGrow: 0 })
const $statusList: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $failure: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  padding: spacing.sm,
  borderWidth: 1,
  borderColor: colors.error,
  borderRadius: spacing.sm,
})
