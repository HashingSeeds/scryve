import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { ActivityIndicator, ScrollView, Share, View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"
import { useUser } from "@clerk/expo"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { ChoiceButton, CHOICE_RADIUS } from "@/components/ChoiceButton"
import { DialogCard, $dialogActions, $dialogText, type DialogOrigin } from "@/components/DialogCard"
import { FloatingAppNavigation } from "@/components/FloatingAppNavigation"
import type { RadialMenuAction } from "@/components/GameRadialMenu"
import { getPlayerGridLayoutOptions, PlayerGrid } from "@/components/PlayerGrid"
import { PlayerLayoutPicker } from "@/components/PlayerLayoutPicker"
import { DrawMark, PlayerMark } from "@/components/PlayerMark"
import { Screen } from "@/components/Screen"
import { Text, type TextProps } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { readPublicCloudConfig } from "@/features/auth/config"
import {
  boardSyncMenuSignal,
  boardSyncStatusText,
  useBoardSyncSignal,
} from "@/features/connected/boardSyncSignal"
import { InviteCard } from "@/features/connected/InviteCard"
import { buildInviteQrPayload, buildInviteUrl } from "@/features/connected/inviteLinks"
import type { ConnectedPlayerProjection } from "@/features/connected/model"
import { removeResumeEntryEverywhere } from "@/features/connected/persistence"
import {
  PlayerActionsDialog,
  type ReportablePlayer,
} from "@/features/connected/PlayerActionsDialog"
import { useConnectedGame, type ConnectedGameRuntime } from "@/features/connected/useConnectedGame"
import { asPlayerId, MAX_COMMANDER_DAMAGE } from "@/features/game/domain"
import { GameBoardStage } from "@/features/game/GameBoardStage"
import type { PlayerGridLayoutVariant } from "@/features/game/playerLayouts"
import {
  counterChangeLabel,
  counterValueLabel,
  playFormatLabel,
  playSystemRules,
  supportsCommanderDamage,
} from "@/features/game/playSystems"
import type { GamePlayer, PlayerId } from "@/features/game/types"
import { useMenuButtonStyle } from "@/features/game/useMenuButtonStyle"
import { useSeatColors } from "@/features/game/useSeatColors"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { isGameUnavailableError } from "@/utils/convexError"
import { useElapsedSince } from "@/utils/useElapsedSince"
import { usePageBackgroundColor } from "@/utils/usePageBackgroundColor"
import { useStoreReview } from "@/utils/useStoreReview"

import { isPlayerMarkShape } from "../../convex/lib/appearance"

type ConnectedBoardScreenProps = {
  publicId: string
  initialInviteOpen?: boolean
  onGameEnded?: (publicId: string) => void
  onRematch?: (rematchPublicId: string) => void
  onGameAbandoned?: () => void
  onSetup?: () => void
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
  const {
    theme: { colors },
  } = useAppTheme()
  usePageBackgroundColor(colors.board.background)
  const { isLoaded, user } = useUser()
  const { sessionHint } = useAuthAccess()
  const hintedUserId = isLoaded ? undefined : sessionHint?.userId
  if (!isLoaded && !hintedUserId)
    return (
      <ConnectedBoardShell
        state={{ status: "loading", message: "Checking connected session…" }}
        onBack={props.onBack}
      />
    )
  const ownerId = user?.id ?? hintedUserId
  if (!ownerId)
    return (
      <ConnectedBoardShell
        state={{ status: "unavailable", message: "Connected session unavailable" }}
        onBack={props.onBack}
      />
    )
  const runtimeKey = `${ownerId}:${props.publicId}`
  return (
    <ConvexQueryBoundary
      resetKey={runtimeKey}
      fallback={({ error, retry }) => {
        const gone = isGameUnavailableError(error)
        return (
          <ConnectedBoardShell
            state={
              gone
                ? { status: "unavailable", message: "This game no longer exists." }
                : { status: "unavailable", message: "Connected board unavailable", retry }
            }
            onBack={
              props.onBack
                ? () => {
                    if (gone) removeResumeEntryEverywhere(props.publicId)
                    props.onBack?.()
                  }
                : undefined
            }
          />
        )
      }}
    >
      <ConnectedBoardRuntime key={runtimeKey} {...props} ownerId={ownerId} />
    </ConvexQueryBoundary>
  )
}

export function connectedBoardLayoutVariant(playerCount: number): PlayerGridLayoutVariant {
  if (playerCount === 3) return "featured-last"
  if (playerCount === 4 || playerCount >= 6) return "tabletop"
  return "auto"
}

type ConnectedBoardReadyProps = {
  publicId: string
  initialInviteOpen?: boolean
  onBack?: () => void
  onSetup?: () => void
  onHistory?: () => void
  onDecks?: () => void
  onSettings?: () => void
  onAccount?: () => void
  accountLabel?: "Account" | "Sign in"
  onGameEnded?: (publicId: string) => void
  onRematch?: (rematchPublicId: string) => void
  onGameAbandoned?: () => void
  runtime: Extract<ConnectedGameRuntime, { status: "ready" }>
}

function toBoardPlayer(player: ConnectedPlayerProjection): GamePlayer {
  return {
    id: asPlayerId(player.playerId),
    name: player.displayName,
    color: player.color,
    ...(isPlayerMarkShape(player.shape) ? { shape: player.shape } : {}),
    life: player.currentLife,
    seat: player.seat,
  }
}

function ConnectedBoardRuntime({
  publicId,
  initialInviteOpen,
  onGameEnded,
  onRematch,
  onGameAbandoned,
  onSetup,
  onBack,
  onHistory,
  onDecks,
  onSettings,
  onAccount,
  accountLabel,
  ownerId,
}: {
  publicId: string
  initialInviteOpen?: boolean
  onGameEnded?: (publicId: string) => void
  onRematch?: (rematchPublicId: string) => void
  onGameAbandoned?: () => void
  onSetup?: () => void
  onBack?: () => void
  onHistory?: () => void
  onDecks?: () => void
  onSettings?: () => void
  onAccount?: () => void
  accountLabel?: "Account" | "Sign in"
  ownerId: string
}) {
  useKeepAwake("count-connected-game", { suppressDeactivateWarnings: true })
  const runtime = useConnectedGame(publicId, ownerId)
  if (runtime.status === "loading")
    return (
      <ConnectedBoardShell
        state={{ status: "loading", message: "Loading connected board…" }}
        onBack={onBack}
      />
    )
  if (runtime.status === "unavailable")
    return (
      <ConnectedBoardShell
        state={{ status: "unavailable", message: runtime.message }}
        onBack={onBack}
      />
    )
  return (
    <ConnectedBoardReady
      publicId={publicId}
      initialInviteOpen={initialInviteOpen}
      onBack={onBack}
      onSetup={onSetup}
      onHistory={onHistory}
      onDecks={onDecks}
      onSettings={onSettings}
      onAccount={onAccount}
      accountLabel={accountLabel}
      onGameEnded={onGameEnded}
      onRematch={onRematch}
      onGameAbandoned={onGameAbandoned}
      runtime={runtime}
    />
  )
}

/** why: memoized so query resubscribes in `ConnectedBoardRuntime` that leave the runtime unchanged skip the whole board. */
const ConnectedBoardReady = memo(function ConnectedBoardReady({
  publicId,
  initialInviteOpen,
  onBack,
  onSetup,
  onHistory,
  onDecks,
  onSettings,
  onAccount,
  accountLabel,
  onGameEnded,
  onRematch,
  onGameAbandoned,
  runtime,
}: ConnectedBoardReadyProps) {
  const menuButtonStyle = useMenuButtonStyle()
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [confirmingFinish, setConfirmingFinish] = useState(false)
  const [playerActionsOpen, setPlayerActionsOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(initialInviteOpen ?? false)
  const [inviteError, setInviteError] = useState<string>()
  const [winnerPlayerIds, setWinnerPlayerIds] = useState<string[]>([])
  const [drawSelected, setDrawSelected] = useState(false)
  const [layoutSelection, setLayoutSelection] = useState<{
    playerCount: number
    layout: PlayerGridLayoutVariant
  }>()
  const [menuDialogOrigin, setMenuDialogOrigin] = useState<DialogOrigin>()
  const [armedCommander, setArmedCommander] = useState<{
    playerId: PlayerId
    staged: Partial<Record<PlayerId, number>>
  } | null>(null)
  const [inspectedPlayerId, setInspectedPlayerId] = useState<PlayerId | null>(null)
  const finishSubmitInFlight = useRef(false)
  const [abandonedOpen, setAbandonedOpen] = useState(false)
  const navigatedTerminal = useRef(false)
  const terminalStatus = runtime.status === "ready" ? runtime.projection.status : undefined
  const rematchPublicId = runtime.projection.rematchPublicId
  useEffect(() => {
    if (terminalStatus === "finished") {
      if (navigatedTerminal.current) return
      navigatedTerminal.current = true
      if (rematchPublicId && onRematch) onRematch(rematchPublicId)
      else onGameEnded?.(publicId)
    } else if (terminalStatus === "abandoned" && !navigatedTerminal.current) {
      setAbandonedOpen(true)
    }
  }, [terminalStatus, rematchPublicId, onRematch, onGameEnded, publicId])
  useStoreReview(
    runtime.projection.status === "finished" &&
      !menuOpen &&
      !statusOpen &&
      !layoutPickerOpen &&
      !confirmingFinish &&
      !playerActionsOpen,
  )

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

  const captureMenuDialogOrigin = useCallback((event?: GestureResponderEvent) => {
    setMenuDialogOrigin(
      event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : undefined,
    )
  }, [])
  const toggleMenu = useCallback(() => {
    setMenuOpen((current) => !current)
  }, [])
  const closeMenu = useCallback(() => {
    setMenuOpen(false)
  }, [])
  const exitCommanderDamage = useCallback(() => {
    setArmedCommander(null)
    setInspectedPlayerId(null)
  }, [])

  const game = runtime.projection
  const system = game.system
  const counter = playSystemRules(system).counter
  const active = game.status === "active"
  const finished = game.status === "finished"

  const controlled = useMemo(
    () =>
      new Set(
        game.players.filter((player) => player.controlledByMe).map((player) => player.playerId),
      ),
    [game.players],
  )
  const players: GamePlayer[] = useMemo(
    () => [
      ...game.players.filter((player) => !controlled.has(player.playerId)).map(toBoardPlayer),
      ...game.players.filter((player) => controlled.has(player.playerId)).map(toBoardPlayer),
    ],
    [controlled, game.players],
  )
  const layoutVariant =
    layoutSelection?.playerCount === players.length
      ? layoutSelection.layout
      : connectedBoardLayoutVariant(players.length)
  const commanderDamageEnabled =
    supportsCommanderDamage(system, game.format || game.ruleset) &&
    game.commanderDamage !== undefined
  const commanderTotals = game.commanderDamage?.totals ?? []
  const failedActionLabel = (event: (typeof runtime.pending)[number]["event"]) => {
    if (event.type === "life.changed")
      return `A ${event.delta > 0 ? "+" : ""}${event.delta} ${counter.label} change could not sync`
    if (event.type === "commanderDamage.submitted")
      return `A ${event.delta > 0 ? "+" : ""}${event.delta} commander damage assignment could not sync`
    return `${event.accepted ? "Confirming" : "Declining"} commander damage could not sync`
  }
  const displayNameOf = (playerId: string) =>
    game.players.find((candidate) => candidate.playerId === playerId)?.displayName ?? "Another seat"
  const incomingCommanderDamage = (player: GamePlayer): Record<PlayerId, number> =>
    Object.fromEntries(
      players
        .filter(({ id }) => id !== player.id)
        .map((source) => [
          source.id,
          commanderTotals.find(
            (total) => total.fromPlayerId === source.id && total.toPlayerId === player.id,
          )?.total ?? 0,
        ]),
    ) as Record<PlayerId, number>
  function toggleCommanderSword(player: GamePlayer) {
    if (!active || runtime.connectionStatus !== "connected" || !controlled.has(player.id)) return
    setInspectedPlayerId(null)
    if (armedCommander?.playerId === player.id) {
      sendCommanderDamage()
      return
    }
    setArmedCommander({ playerId: player.id, staged: {} })
  }
  function stageCommanderDamage(target: GamePlayer, step: number) {
    setArmedCommander((current) => {
      if (!current || current.playerId === target.id) return current
      const recorded = incomingCommanderDamage(target)[current.playerId] ?? 0
      const next = Math.max(
        -recorded,
        Math.min(MAX_COMMANDER_DAMAGE - recorded, (current.staged[target.id] ?? 0) + step),
      )
      const staged = { ...current.staged }
      if (next === 0) delete staged[target.id]
      else staged[target.id] = next
      return { ...current, staged }
    })
  }
  function sendCommanderDamage() {
    if (!armedCommander) return
    const changes = Object.entries(armedCommander.staged).flatMap(([toPlayerId, delta]) =>
      delta === undefined || delta === 0 ? [] : [{ toPlayerId, delta }],
    )
    if (!changes.length) return
    runtime.submitCommanderDamage(armedCommander.playerId, changes)
    setArmedCommander(null)
    setInspectedPlayerId(null)
  }
  const finishResultSelected = winnerPlayerIds.length > 0 || drawSelected

  const finishBlocker =
    runtime.connectionStatus === "offline"
      ? FINISH_BLOCKERS.offline
      : runtime.pending.length > 0
        ? FINISH_BLOCKERS.sending
        : runtime.failed.length > 0
          ? FINISH_BLOCKERS.rejected
          : undefined
  const { signal: syncSignal, offlineSince } = useBoardSyncSignal({
    connectionStatus: runtime.connectionStatus,
    unsent: runtime.pending.length,
    oldestUnsentAt: runtime.pending[0]?.queuedAt,
    rejected: runtime.failed.length,
    needsAttention: Boolean(runtime.changeError),
  })
  const syncStatusText = boardSyncStatusText(syncSignal)
  const openSyncStatus = useCallback(() => {
    setMenuOpen(false)
    setStatusOpen(true)
  }, [])
  const layoutOptions = getPlayerGridLayoutOptions(players.length)

  /**
   * Only the host is served an invitation, and only while seats are still open, so the
   * invite action exists exactly when there is something to hand out.
   */
  const invitation = active ? game.invitation : undefined
  const inviteOrigin = readPublicCloudConfig()
  const inviteUrl =
    invitation && inviteOrigin.configured
      ? buildInviteUrl(inviteOrigin.value.inviteOrigin, invitation.token)
      : undefined

  async function shareInvite() {
    if (!invitation) return
    try {
      setInviteError(undefined)
      if (inviteUrl)
        await Share.share({ message: `Join my Scryve game: ${inviteUrl}`, url: inviteUrl })
      else await Share.share({ message: `Join my Scryve game with code ${invitation.manualCode}` })
    } catch (cause) {
      setInviteError(cause instanceof Error ? cause.message : "Could not open sharing")
    }
  }

  function leaveAbandonedGame() {
    setAbandonedOpen(false)
    if (onGameAbandoned) onGameAbandoned()
    else onBack?.()
  }

  const canEnd = active && game.isHost && !runtime.finishing
  const radialActions: RadialMenuAction[] = useMemo(
    () => [
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
        disabled: !onSetup,
        onPress: () => {
          setMenuOpen(false)
          onSetup?.()
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
        detail: canEnd ? finishBlocker?.petal : undefined,
        blocked: canEnd && Boolean(finishBlocker),
        disabled: !canEnd,
        onPress: (event) => {
          captureMenuDialogOrigin(event)
          setMenuOpen(false)
          if (finishBlocker) setStatusOpen(true)
          else setConfirmingFinish(true)
        },
      },
    ],
    [canEnd, captureMenuDialogOrigin, finishBlocker, layoutOptions.length, onHistory, onSetup],
  )
  const seatColors = useSeatColors(players)
  const exitAction = useMemo(
    () =>
      armedCommander || inspectedPlayerId
        ? { label: "Exit commander damage", onPress: exitCommanderDamage }
        : undefined,
    [armedCommander, inspectedPlayerId, exitCommanderDamage],
  )

  const inviteDialogOpen = invitation !== undefined && inviteOpen
  const overlayOpen =
    menuOpen ||
    statusOpen ||
    layoutPickerOpen ||
    confirmingFinish ||
    playerActionsOpen ||
    inviteDialogOpen ||
    abandonedOpen
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
      <GameBoardStage
        testID="connected-game-board"
        playerCount={players.length}
        layoutVariant={layoutVariant}
        renderGrid={(boardOrientation) => (
          <PlayerGrid
            boardOrientation={boardOrientation}
            players={players}
            system={system}
            lifeStep={game.lifeStep}
            layoutVariant={layoutVariant}
            disabled={!active || overlayOpen}
            isPlayerDisabled={(player) => !controlled.has(player.id)}
            isPlayerOwned={(player) => controlled.has(player.id)}
            isPlayerEliminated={(player) =>
              commanderDamageEnabled &&
              Boolean(
                game.players.find((candidate) => candidate.playerId === player.id)
                  ?.eliminatedByCommanderDamage,
              )
            }
            getStaleSince={(player) => (controlled.has(player.id) ? undefined : offlineSince)}
            commanderDamage={
              commanderDamageEnabled
                ? {
                    incomingFor: incomingCommanderDamage,
                    armedPlayerId: armedCommander?.playerId ?? null,
                    inspection: { playerId: inspectedPlayerId, onChange: setInspectedPlayerId },
                    staging: {
                      stagedFor: (player) => armedCommander?.staged[player.id] ?? 0,
                      stagedTargets: armedCommander
                        ? Object.values(armedCommander.staged).filter((delta) => delta !== 0).length
                        : 0,
                      onSend: sendCommanderDamage,
                      onCancel: () => setArmedCommander(null),
                    },
                    pendingFor: (player) =>
                      controlled.has(player.id)
                        ? (game.commanderDamage?.pendingClaims ?? [])
                            .filter((claim) => claim.toPlayerId === player.id)
                            .map((claim) => ({
                              claimId: claim.claimId,
                              attackerName: displayNameOf(claim.fromPlayerId),
                              delta: claim.delta,
                              onConfirm: () => runtime.resolveCommanderDamageClaim(claim, true),
                              onDecline: () => runtime.resolveCommanderDamageClaim(claim, false),
                            }))
                        : [],
                    onPressSword: toggleCommanderSword,
                    onStage: stageCommanderDamage,
                  }
                : undefined
            }
            onChange={(playerId, delta) => runtime.changeLife(playerId, delta)}
          />
        )}
        menu={{
          open: menuOpen,
          actions: radialActions,
          variant: menuButtonStyle,
          seatColors,
          exitAction,
          signal: boardSyncMenuSignal(syncSignal),
          statusLine:
            syncStatusText && syncSignal.kind !== "live"
              ? { text: syncStatusText, tone: syncSignal.kind, onPress: openSyncStatus }
              : undefined,
          onToggle: toggleMenu,
          onClose: closeMenu,
        }}
        windowOverlay={
          menuOpen && onDecks && onSettings && onAccount ? (
            <FloatingAppNavigation
              destinationLabel="Decks"
              accountLabel={accountLabel}
              onDestination={onDecks}
              onSettings={onSettings}
              onAccount={onAccount}
            />
          ) : null
        }
      />

      {inviteDialogOpen && invitation ? (
        <DialogCard
          visible
          wide
          placement="bottom"
          origin={menuDialogOrigin}
          onClose={() => setInviteOpen(false)}
          backdropTestID="invite-backdrop"
          backdropAccessibilityLabel="Close invite"
          dialogTestID="invite-dialog"
          accessibilityViewIsModal
        >
          <Text preset="subheading" text="Invite players" style={themed($dialogText)} />
          <InviteCard
            qrPayload={buildInviteQrPayload(invitation.token, invitation.manualCode)}
            manualCode={invitation.manualCode}
            onShare={() => void shareInvite()}
          />
          {inviteError ? <AlertNote text={inviteError} /> : null}
          <Button text="Close" onPress={() => setInviteOpen(false)} />
        </DialogCard>
      ) : null}

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
          <PlayerLayoutPicker
            playerCount={players.length}
            value={layoutVariant}
            testID="connected-layout"
            onChange={(layout) => {
              setLayoutSelection({ playerCount: players.length, layout })
              setLayoutPickerOpen(false)
            }}
          />
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
          <ElapsedText
            since={finished ? undefined : offlineSince}
            text={(elapsed) =>
              finished
                ? "Connected summary"
                : elapsed !== undefined
                  ? `Offline for ${elapsed}`
                  : syncSignal.kind === "slow"
                    ? "Slow connection"
                    : syncSignal.kind === "catchingUp"
                      ? "Back online"
                      : syncSignal.kind === "attention"
                        ? (syncStatusText ?? "Connected game")
                        : "Connected"
            }
            preset="subheading"
            style={themed($dialogText)}
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
          {finished ? null : (
            <View testID="connected-sync-details" style={themed($syncRows)}>
              <SyncRow
                label="Your changes"
                value={() =>
                  runtime.pending.length === 0
                    ? "All sent"
                    : syncSignal.kind === "offline"
                      ? `${runtime.pending.length} saved on this device. They send when you reconnect.`
                      : `Sending ${runtime.pending.length}`
                }
              />
              <SyncRow
                label="Other players"
                since={offlineSince}
                value={(elapsed) =>
                  elapsed !== undefined
                    ? `Updated ${elapsed} ago`
                    : syncSignal.kind === "slow"
                      ? "May arrive late"
                      : "Live"
                }
              />
              <SyncRow label="Finish game" value={() => finishBlocker?.detail ?? "Available"} />
            </View>
          )}
          <ScrollView style={themed($statusScroll)} contentContainerStyle={themed($statusList)}>
            {runtime.failed.map((failure) => (
              <View
                key={failure.action.event.operationId}
                testID="connected-failed-action"
                accessibilityRole="alert"
                style={themed($failure)}
              >
                <Text text={`${failedActionLabel(failure.action.event)}: ${failure.reason}`} />
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
          onInvite={
            invitation
              ? () => {
                  setPlayerActionsOpen(false)
                  setInviteOpen(true)
                }
              : undefined
          }
        />
      ) : null}

      {abandonedOpen ? (
        <DialogCard
          visible
          onClose={() => setAbandonedOpen(false)}
          origin={menuDialogOrigin}
          backdropTestID="abandoned-game-backdrop"
          backdropAccessibilityLabel="Dismiss game ended notice"
          dialogTestID="abandoned-game-dialog"
          dialogAccessibilityRole="alert"
          wide
          style={themed($boardDialog)}
        >
          <Text text="Game ended" preset="subheading" style={themed($dialogText)} />
          <Text
            size="xs"
            text="The host ended this game. Its board stays read-only."
            style={themed($muted)}
          />
          <Button text="Leave" onPress={leaveAbandonedGame} />
        </DialogCard>
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
              disabled={runtime.finishing || Boolean(finishBlocker)}
              style={themed($dialogAction)}
              onPress={async () => {
                if (finishSubmitInFlight.current) return
                finishSubmitInFlight.current = true
                try {
                  const withResult = finishResultSelected
                  const ended = withResult
                    ? await runtime.finish(
                        winnerPlayerIds.length > 0
                          ? { kind: "win" as const, winnerPlayerIds }
                          : { kind: "draw" as const },
                      )
                    : await runtime.abandon()
                  if (!ended) return
                  setConfirmingFinish(false)
                  // why: the finished projection carries any rematch, so the host follows it like every other board.
                  if (withResult && onRematch) return
                  navigatedTerminal.current = true
                  if (withResult) {
                    if (onGameEnded) setTimeout(() => onGameEnded(publicId), 0)
                  } else if (onGameAbandoned) {
                    setTimeout(onGameAbandoned, 0)
                  } else if (onGameEnded) {
                    setTimeout(() => onGameEnded(publicId), 0)
                  }
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
})

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  width: "100%",
  backgroundColor: colors.board.background,
})
const $board: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
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
const FINISH_BLOCKERS = {
  offline: { petal: "needs connection", detail: "Needs a connection" },
  sending: { petal: "sending changes", detail: "After your changes send" },
  rejected: { petal: "review first", detail: "Review the changes below first" },
} as const

function ElapsedText({
  since,
  text,
  ...props
}: Omit<TextProps, "text"> & {
  since: number | undefined
  text: (elapsed: string | undefined) => string
}) {
  const elapsed = useElapsedSince(since)
  return <Text {...props} text={text(elapsed)} />
}

function SyncRow({
  label,
  since,
  value,
}: {
  label: string
  since?: number
  value: (elapsed: string | undefined) => string
}) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($syncRow)}>
      <Text text={label} size="xs" style={[themed($muted), $syncLabel]} />
      <ElapsedText since={since} text={value} size="xs" style={themed($syncValue)} />
    </View>
  )
}

const $syncRows: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderTopWidth: 1,
  borderTopColor: colors.board.border,
})
const $syncRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  gap: spacing.md,
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.board.border,
})
const $syncLabel: TextStyle = { flexShrink: 0 }
const $syncValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  flexShrink: 1,
  textAlign: "right",
  color: colors.board.text,
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
