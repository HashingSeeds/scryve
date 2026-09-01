import { useRef, useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { ActivityIndicator, Pressable, ScrollView, useWindowDimensions, View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"
import { useUser } from "@clerk/expo"

import { AlertNote } from "@/components/AlertNote"
import { AppUtilityMenu } from "@/components/AppUtilityMenu"
import { Button } from "@/components/Button"
import { ChoiceButton, CHOICE_RADIUS } from "@/components/ChoiceButton"
import { ConnectionBadge } from "@/components/ConnectionBadge"
import { DialogCard, $dialogActions, $dialogText, type DialogOrigin } from "@/components/DialogCard"
import { GameRadialMenu, type RadialMenuAction } from "@/components/GameRadialMenu"
import {
  getPlayerGridLayout,
  getPlayerGridLayoutOptions,
  getPlayerGridMenuAnchor,
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
import {
  counterChangeLabel,
  counterValueLabel,
  playFormatLabel,
  playSystemId,
  playSystemRules,
} from "@/features/game/playSystems"
import type { GamePlayer } from "@/features/game/types"
import { useMenuButtonStyle } from "@/features/game/useMenuButtonStyle"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { isPlayerMarkShape } from "../../convex/lib/appearance"

type ConnectedBoardScreenProps = {
  publicId: string
  onBack?: () => void
  onHistory?: () => void
  onDecks?: () => void
  onSettings?: () => void
  onAccount?: () => void
  accountLabel?: "Account" | "Sign in"
}

type ConnectedBoardShellState =
  | { status: "loading"; message: string }
  | { status: "unavailable"; message: string; retry?: () => void }

function ConnectedBoardShell({
  state,
  onBack,
}: {
  state: ConnectedBoardShellState
  onBack?: () => void
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
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
          <View testID="connected-board-shell-surface" style={themed($shellSurface)} />
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
            {!unavailable ? <ActivityIndicator size="small" color={colors.board.text} /> : null}
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
  onHistory,
  onDecks,
  onSettings,
  onAccount,
  accountLabel,
  ownerId,
}: {
  publicId: string
  onBack?: () => void
  onHistory?: () => void
  onDecks?: () => void
  onSettings?: () => void
  onAccount?: () => void
  accountLabel?: "Account" | "Sign in"
  ownerId: string
}) {
  useKeepAwake("count-connected-game")
  const menuButtonStyle = useMenuButtonStyle()
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
  const system = playSystemId(game.system)
  const counter = playSystemRules(system).counter

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
  const finishResultSelected = winnerPlayerIds.length > 0 || drawSelected

  const finishBlockedReason =
    runtime.connectionStatus === "offline"
      ? "Reconnect before finishing; this operation is online-only."
      : runtime.pending.length > 0
        ? `Wait for ${runtime.pending.length} pending ${runtime.pending.length === 1 ? "change" : "changes"} to sync before finishing.`
        : runtime.failed.length > 0
          ? `Review failed ${counter.label} changes before finishing.`
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
      kind: "layout",
      label: "Layout",
      disabled: layoutOptions.length < 2,
      onPress: (event) => {
        captureMenuDialogOrigin(event)
        setMenuOpen(false)
        setLayoutPickerOpen(true)
      },
    },
    {
      kind: "players",
      label: "Players",
      onPress: (event) => {
        captureMenuDialogOrigin(event)
        setMenuOpen(false)
        setPlayerActionsOpen(true)
      },
    },
    {
      kind: "setup",
      label: "Setup",
      onPress: (event) => {
        captureMenuDialogOrigin(event)
        setMenuOpen(false)
        setStatusOpen(true)
      },
    },
    {
      kind: "history",
      label: "History",
      disabled: !onHistory,
      onPress: () => {
        setMenuOpen(false)
        onHistory?.()
      },
    },
    {
      kind: "end-game",
      label: "End",
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
          system={system}
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
          variant={menuButtonStyle}
          seatColors={players.map((player) => player.color)}
          onToggle={() => setMenuOpen((current) => !current)}
          onClose={() => setMenuOpen(false)}
        />
        {menuOpen && onDecks && onSettings && onAccount ? (
          <View pointerEvents="box-none" style={themed($cornerNavigation)}>
            <Pressable
              testID="open-decks-button"
              accessibilityRole="button"
              accessibilityLabel="Decks"
              style={themed($cornerButton)}
              onPress={onDecks}
            >
              <Text text="Decks" weight="bold" size="xs" />
            </Pressable>
            <AppUtilityMenu
              accountLabel={accountLabel}
              onSettings={onSettings}
              onAccount={onAccount}
            />
          </View>
        ) : null}
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
                ? `${counterChangeLabel(system, game.eventSequence)} accepted · final`
                : `${playFormatLabel(system, game.format || game.ruleset)} · starts with ${counterValueLabel(system, game.startingLife)}`
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
                  text={`A ${failure.action.event.delta > 0 ? "+" : ""}${failure.action.event.delta} ${counter.label} change could not sync: ${failure.reason}`}
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
                  detail={counterValueLabel(system, player.currentLife)}
                  accentColor={player.color}
                  Leading={({ color }) => (
                    <PlayerMark
                      seatNumber={player.seat}
                      shape={isPlayerMarkShape(player.shape) ? player.shape : undefined}
                      color={color}
                      size={28}
                    />
                  )}
                  accessibilityLabel={`${player.displayName}, ${counterValueLabel(system, player.currentLife)}${selected ? ", winner" : ""}`}
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
              tx="game:cancel"
              disabled={runtime.finishing}
              style={themed($dialogAction)}
              onPress={() => setConfirmingFinish(false)}
            />
            <Button
              testID="confirm-connected-finish-button"
              tx={
                runtime.finishing
                  ? "game:ending"
                  : finishResultSelected
                    ? "game:finish"
                    : "game:abandon"
              }
              preset={finishResultSelected ? "reversed" : "filled"}
              disabled={runtime.finishing || Boolean(finishBlockedReason)}
              style={themed($dialogAction)}
              onPress={async () => {
                if (finishSubmitInFlight.current) return
                finishSubmitInFlight.current = true
                try {
                  const ended = finishResultSelected
                    ? await runtime.finish(
                        winnerPlayerIds.length > 0
                          ? { kind: "win" as const, winnerPlayerIds }
                          : { kind: "draw" as const },
                      )
                    : await runtime.abandon()
                  if (ended) setConfirmingFinish(false)
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

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  width: "100%",
  backgroundColor: colors.board.background,
})
const $board: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $cornerNavigation: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  zIndex: 50,
  top: spacing.lg,
  left: spacing.md,
  right: spacing.md,
  flexDirection: "row",
  justifyContent: "space-between",
})
const $cornerButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 92,
  height: 44,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderColor: colors.separator,
  backgroundColor: colors.background,
  paddingHorizontal: spacing.sm,
})
const $shellGrid: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  width: "100%",
})
const $shellSurface: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  width: "100%",
  backgroundColor: colors.board.surface,
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
const $statusToast: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  maxWidth: 420,
  minHeight: 40,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
  borderWidth: 1,
  borderColor: colors.board.border,
  borderRadius: 4,
  backgroundColor: colors.board.surfaceRaised,
})
const $unavailableToast: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.error })
const $statusMessage: ThemedStyle<TextStyle> = ({ colors }) => ({
  flexShrink: 1,
  color: colors.board.text,
})
const $statusAction: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 32,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.xs,
  borderColor: colors.board.text,
  backgroundColor: colors.transparent,
})
const $statusActionText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.board.text,
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
