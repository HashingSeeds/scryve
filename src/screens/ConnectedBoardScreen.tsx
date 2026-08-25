import { useRef, useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { ActivityIndicator, ScrollView, useWindowDimensions, View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"
import { useUser } from "@clerk/expo"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { ChoiceButton, CHOICE_RADIUS } from "@/components/ChoiceButton"
import { ConnectionBadge } from "@/components/ConnectionBadge"
import { DialogCard, $dialogActions, $dialogText, type DialogOrigin } from "@/components/DialogCard"
import { GameRadialMenu, type RadialMenuAction } from "@/components/GameRadialMenu"
import {
  getPlayerGridLayout,
  getPlayerGridLayoutOptions,
  getPlayerGridMenuAnchor,
  getScreenCornerSquaringStyle,
  PlayerGrid,
  type PlayerGridLayoutVariant,
} from "@/components/PlayerGrid"
import { DrawMark, PlayerMark } from "@/components/PlayerMark"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { ConnectedBoardSyncToast } from "@/features/connected/ConnectedBoardSyncToast"
import {
  PlayerActionsDialog,
  type ReportablePlayer,
} from "@/features/connected/PlayerActionsDialog"
import { useConnectedGame } from "@/features/connected/useConnectedGame"
import { asPlayerId } from "@/features/game/domain"
import type { GamePlayer } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { isPlayerMarkShape } from "../../convex/lib/appearance"

type ConnectedBoardScreenProps = {
  publicId: string
  onBack?: () => void
  onHistory?: () => void
}

type ConnectedBoardShellState =
  | { status: "loading"; message: string }
  | { status: "unavailable"; message: string; retry?: () => void }

const BOARD_SHELL_ROWS = [
  [0, 1],
  [2, 3],
]

function ConnectedBoardShell({
  state,
  onBack,
}: {
  state: ConnectedBoardShellState
  onBack?: () => void
}) {
  const { themed } = useAppTheme()
  const unavailable = state.status === "unavailable"

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={[]}
      SystemBarsProps={{ hidden: true }}
      contentContainerStyle={themed($screen)}
    >
      <View testID="connected-game-board" style={themed($board)}>
        <View
          testID="connected-board-shell"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={themed($shellGrid)}
        >
          {BOARD_SHELL_ROWS.map((row, rowIndex) => (
            <View key={rowIndex} style={themed($shellRow)}>
              {row.map((cell, columnIndex) => (
                <View
                  key={cell}
                  testID="connected-board-shell-cell"
                  style={[
                    themed($shellCell),
                    getScreenCornerSquaringStyle({
                      rows: BOARD_SHELL_ROWS,
                      rowIndex,
                      columnIndex,
                    }),
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
        <View
          testID="connected-board-status-layer"
          pointerEvents="box-none"
          style={themed($toastLayer)}
        >
          <View
            testID={
              unavailable ? "connected-board-unavailable-status" : "connected-board-loading-status"
            }
            accessibilityRole={unavailable ? "alert" : "progressbar"}
            accessibilityLabel={state.message}
            accessibilityLiveRegion={unavailable ? "assertive" : "polite"}
            style={themed([$statusToast, unavailable && $unavailableToast])}
          >
            {!unavailable ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
            <Text size="xs" weight="medium" text={state.message} style={themed($statusMessage)} />
            {unavailable && state.retry ? (
              <Button
                testID="retry-connected-board-button"
                text="Try again"
                preset="reversed"
                style={themed($statusAction)}
                textStyle={themed($statusActionText)}
                onPress={state.retry}
              />
            ) : null}
            {onBack ? (
              <Button
                testID="back-from-connected-board-button"
                accessibilityLabel="Back to local play"
                text="Back"
                style={themed($statusAction)}
                textStyle={themed($statusActionText)}
                onPress={onBack}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Screen>
  )
}

export function ConnectedBoardScreen(props: ConnectedBoardScreenProps) {
  const { isLoaded, user } = useUser()
  if (!isLoaded)
    return (
      <ConnectedBoardShell
        state={{ status: "loading", message: "Checking connected session…" }}
        onBack={props.onBack}
      />
    )
  if (!user?.id)
    return (
      <ConnectedBoardShell
        state={{ status: "unavailable", message: "Connected session unavailable" }}
        onBack={props.onBack}
      />
    )
  const ownerId = user.id
  const runtimeKey = `${ownerId}:${props.publicId}`
  return (
    <ConvexQueryBoundary
      resetKey={runtimeKey}
      fallback={({ retry }) => (
        <ConnectedBoardShell
          state={{ status: "unavailable", message: "Connected board unavailable", retry }}
          onBack={props.onBack}
        />
      )}
    >
      <ConnectedBoardRuntime key={runtimeKey} {...props} ownerId={ownerId} />
    </ConvexQueryBoundary>
  )
}

function ConnectedBoardRuntime({
  publicId,
  onBack,
  ownerId,
}: {
  publicId: string
  onBack?: () => void
  onHistory?: () => void
  ownerId: string
}) {
  useKeepAwake("count-connected-game")
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const { width, height, fontScale } = useWindowDimensions()
  const runtime = useConnectedGame(publicId, ownerId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [confirmingFinish, setConfirmingFinish] = useState(false)
  const [playerActionsOpen, setPlayerActionsOpen] = useState(false)
  const [winnerPlayerIds, setWinnerPlayerIds] = useState<string[]>([])
  const [drawSelected, setDrawSelected] = useState(false)
  const [layoutVariant, setLayoutVariant] = useState<PlayerGridLayoutVariant>("auto")
  const [menuDialogOrigin, setMenuDialogOrigin] = useState<DialogOrigin>()
  const finishSubmitInFlight = useRef(false)

  function toggleWinner(playerId: string) {
    setDrawSelected(false)
    setWinnerPlayerIds((current) =>
      current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId],
    )
  }

  function selectDraw() {
    setWinnerPlayerIds([])
    setDrawSelected((current) => !current)
  }

  function captureMenuDialogOrigin(event?: GestureResponderEvent) {
    setMenuDialogOrigin(
      event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : undefined,
    )
  }
  if (runtime.status === "loading")
    return (
      <ConnectedBoardShell
        state={{ status: "loading", message: "Loading connected board…" }}
        onBack={onBack}
      />
    )

  const game = runtime.projection

  const players: GamePlayer[] = game.players.map((player) => ({
    id: asPlayerId(player.playerId),
    name: player.displayName,
    color: player.color,
    ...(isPlayerMarkShape(player.shape) ? { shape: player.shape } : {}),
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
      color: "#FBC878",
      disabled: layoutOptions.length < 2,
      onPress: (event) => {
        captureMenuDialogOrigin(event)
        setMenuOpen(false)
        setLayoutPickerOpen(true)
      },
    },
    {
      id: "connected-players",
      label: "Players",
      color: "#55C894",
      onPress: (event) => {
        captureMenuDialogOrigin(event)
        setMenuOpen(false)
        setPlayerActionsOpen(true)
      },
    },
    {
      id: "connected-status",
      label: runtime.connectionStatus === "connected" ? "Status" : runtime.connectionStatus,
      color:
        runtime.connectionStatus === "connected"
          ? "#55C894"
          : runtime.connectionStatus === "offline"
            ? "#D96767"
            : "#FBC878",
      onPress: (event) => {
        captureMenuDialogOrigin(event)
        setMenuOpen(false)
        setStatusOpen(true)
      },
    },
    {
      id: "connected-back",
      label: "Home",
      color: "#7DB7E8",
      disabled: !onBack,
      onPress: () => {
        setMenuOpen(false)
        onBack?.()
      },
    },
    {
      id: "finish-connected-game",
      label: "End game",
      color: "#D96767",
      disabled: !active || !game.isHost || runtime.finishing || Boolean(finishBlockedReason),
      onPress: (event) => {
        captureMenuDialogOrigin(event)
        setMenuOpen(false)
        setConfirmingFinish(true)
      },
    },
  ]

  const overlayOpen =
    menuOpen || statusOpen || layoutPickerOpen || confirmingFinish || playerActionsOpen
  const reportablePlayers: ReportablePlayer[] = game.players.map((player) => ({
    playerId: player.playerId,
    seat: player.seat,
    displayName: player.displayName,
    color: player.color,
    ...(isPlayerMarkShape(player.shape) ? { shape: player.shape } : {}),
    controlledByMe: player.controlledByMe,
  }))

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
        <ConnectedBoardSyncToast
          connectionStatus={runtime.connectionStatus}
          pendingCount={runtime.pending.length}
          failedCount={runtime.failed.length}
          changeError={runtime.changeError}
          onReview={() => {
            setMenuOpen(false)
            setStatusOpen(true)
          }}
        />
      </View>

      {layoutPickerOpen ? (
        <DialogCard
          visible
          onClose={() => setLayoutPickerOpen(false)}
          origin={menuDialogOrigin}
          backdropTestID="connected-layout-backdrop"
          backdropAccessibilityLabel="Close layout chooser"
          dialogTestID="connected-layout-dialog"
          accessibilityViewIsModal
          wide
          style={themed($boardDialog)}
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
        </DialogCard>
      ) : null}

      {statusOpen ? (
        <DialogCard
          visible
          onClose={() => setStatusOpen(false)}
          origin={menuDialogOrigin}
          backdropTestID="connected-status-backdrop"
          backdropAccessibilityLabel="Close connected-game status"
          dialogTestID="connected-status-dialog"
          accessibilityViewIsModal
          wide
          style={themed($boardDialog)}
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
        </DialogCard>
      ) : null}

      {playerActionsOpen ? (
        <PlayerActionsDialog
          publicId={publicId}
          players={reportablePlayers}
          origin={menuDialogOrigin}
          onClose={() => setPlayerActionsOpen(false)}
        />
      ) : null}

      {confirmingFinish ? (
        <DialogCard
          visible
          onClose={() => setConfirmingFinish(false)}
          closeDisabled={runtime.finishing}
          origin={menuDialogOrigin}
          backdropTestID="connected-finish-backdrop"
          backdropAccessibilityLabel="Cancel ending the connected game"
          dialogTestID="connected-finish-confirmation"
          dialogAccessibilityRole="alert"
          style={themed($boardDialog)}
        >
          <View style={themed($dialogHeader)}>
            <Text text="Who won?" preset="subheading" />
            <Text
              size="xs"
              text="Skip to end without recording a result. The summary is final for everyone."
              style={themed($dialogSubtitle)}
            />
          </View>
          <View style={themed($resultChoices)}>
            {game.players.map((player) => {
              const selected = winnerPlayerIds.includes(player.playerId)
              return (
                <ChoiceButton
                  key={player.playerId}
                  text={player.displayName}
                  detail={`${player.currentLife} life`}
                  accentColor={player.color}
                  Leading={({ color }) => (
                    <PlayerMark
                      seatNumber={player.seat}
                      shape={isPlayerMarkShape(player.shape) ? player.shape : undefined}
                      color={color}
                      size={28}
                    />
                  )}
                  accessibilityLabel={`${player.displayName}, ${player.currentLife} life${selected ? ", winner" : ""}`}
                  selected={selected}
                  onPress={() => toggleWinner(player.playerId)}
                />
              )
            })}
            <ChoiceButton
              text="Draw"
              accentColor={colors.palette.neutral400}
              Leading={({ color }) => <DrawMark color={color} />}
              selected={drawSelected}
              onPress={selectDraw}
            />
          </View>
          {runtime.finishError ? (
            <AlertNote testID="connected-finish-error" text={runtime.finishError} />
          ) : null}
          <View style={themed($dialogActions)}>
            <Button
              testID="cancel-connected-finish-button"
              text="Cancel"
              disabled={runtime.finishing}
              style={themed($dialogAction)}
              onPress={() => setConfirmingFinish(false)}
            />
            <Button
              testID="confirm-connected-finish-button"
              text={runtime.finishing ? "Ending…" : "End game"}
              preset="reversed"
              disabled={runtime.finishing || Boolean(finishBlockedReason)}
              style={themed($dialogAction)}
              onPress={async () => {
                if (finishSubmitInFlight.current) return
                finishSubmitInFlight.current = true
                const result =
                  winnerPlayerIds.length > 0
                    ? { kind: "win" as const, winnerPlayerIds }
                    : { kind: drawSelected ? ("draw" as const) : ("unknown" as const) }
                try {
                  if (await runtime.finish(result)) setConfirmingFinish(false)
                } finally {
                  finishSubmitInFlight.current = false
                }
              }}
            />
          </View>
        </DialogCard>
      ) : null}
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  width: "100%",
  backgroundColor: "#000000",
})
const $board: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $shellGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  width: "100%",
  gap: spacing.xxs,
})
const $shellRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  gap: spacing.xxs,
})
const $shellCell: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  borderRadius: spacing.md,
  backgroundColor: "#151515",
})
const $toastLayer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  top: spacing.md,
  left: spacing.md,
  right: spacing.md,
  zIndex: 20,
  elevation: 20,
  alignItems: "center",
})
const $statusToast: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  maxWidth: 420,
  minHeight: 40,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
  borderWidth: 1,
  borderColor: "#444444",
  borderRadius: 4,
  backgroundColor: "#111111",
})
const $unavailableToast: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.error })
const $statusMessage: ThemedStyle<TextStyle> = () => ({
  flexShrink: 1,
  color: "#FFFFFF",
})
const $statusAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 32,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.xs,
  borderColor: "#FFFFFF",
  backgroundColor: "transparent",
})
const $statusActionText: ThemedStyle<TextStyle> = () => ({
  color: "#FFFFFF",
  fontSize: 13,
  lineHeight: 16,
})
const $boardDialog: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  maxHeight: "82%",
  gap: spacing.md,
})
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
const $dialogHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $dialogSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $resultChoices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $dialogAction: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 48,
  borderRadius: CHOICE_RADIUS,
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
