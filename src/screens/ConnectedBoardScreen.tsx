import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { ActivityIndicator, ScrollView, Share, View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"
import { useUser } from "@clerk/expo"

import { AlertNote } from "@/components/AlertNote"
import type { AccountEntry } from "@/components/AppUtilityMenu"
import { Button } from "@/components/Button"
import { ChoiceButton, CHOICE_RADIUS } from "@/components/ChoiceButton"
import { DialogCard, $dialogActions, $dialogText, type DialogOrigin } from "@/components/DialogCard"
import { FloatingAppNavigation } from "@/components/FloatingAppNavigation"
import type { RadialMenuAction } from "@/components/GameRadialMenu"
import {
  getPlayerGridLayoutOptions,
  PlayerGrid,
  type PlayerGridProps,
} from "@/components/PlayerGrid"
import { PlayerLayoutPicker } from "@/components/PlayerLayoutPicker"
import { DrawMark, PlayerMark } from "@/components/PlayerMark"
import { ResultLiveRegion } from "@/components/ResultAnnouncer"
import { Screen } from "@/components/Screen"
import { Text, type TextProps } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { readPublicCloudConfig } from "@/features/auth/config"
import {
  boardSyncMenuSignal,
  boardSyncStatusText,
  useBoardSyncSignal,
  type BoardSyncSignal,
} from "@/features/connected/boardSyncSignal"
import {
  connectedBoardView,
  connectedLastStanding,
  connectedLives,
  type ConnectedBoardSeat,
  type ConnectedBoardView,
} from "@/features/connected/boardView"
import { InviteCard } from "@/features/connected/InviteCard"
import { buildInviteQrPayload, buildInviteUrl } from "@/features/connected/inviteLinks"
import type { PendingLifeAction } from "@/features/connected/model"
import { removeResumeEntryEverywhere } from "@/features/connected/persistence"
import {
  PlayerActionsDialog,
  type ReportablePlayer,
} from "@/features/connected/PlayerActionsDialog"
import { treacheryRoleLabel, TreacheryRoleDialog } from "@/features/connected/TreacheryRoleDialog"
import { useConnectedGame, type ConnectedGameRuntime } from "@/features/connected/useConnectedGame"
import { asPlayerId, MAX_COMMANDER_DAMAGE } from "@/features/game/domain"
import { GameBoardStage } from "@/features/game/GameBoardStage"
import { LifeLogContext, type LifeLogSource } from "@/features/game/LifeLog"
import type { PlayerGridLayoutVariant } from "@/features/game/playerLayouts"
import {
  counterChangeLabel,
  counterValueLabel,
  playFormatLabel,
  playSystemRules,
  storedPlaySystem,
  supportsCommanderDamage,
} from "@/features/game/playSystems"
import type { TableRuntime } from "@/features/game/tableRuntime"
import type { GamePlayer, PlayerId } from "@/features/game/types"
import { useDice } from "@/features/game/useDice"
import { useMenuButtonStyle } from "@/features/game/useMenuButtonStyle"
import { useSeatColors } from "@/features/game/useSeatColors"
import { gameRules, openRules } from "@/features/rules/gameRules"
import { prefetchRules } from "@/features/rules/rulesSource"
import type { TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { isGameUnavailableError } from "@/utils/convexError"
import { useElapsedSince } from "@/utils/useElapsedSince"
import { usePageBackgroundColor } from "@/utils/usePageBackgroundColor"
import { useStoreReview } from "@/utils/useStoreReview"
import { useStructurallyStable } from "@/utils/useStructurallyStable"

import { shownMarkShape } from "../../convex/lib/appearance"

type ConnectedBoardScreenProps = {
  publicId: string
  initialInviteOpen?: boolean
  onGameEnded?: (publicId: string) => void
  onRematch?: (rematchPublicId: string) => void
  onGameAbandoned?: () => void
  onBack?: () => void
  onHistory?: () => void
  onRules?: () => void
  onDecks?: () => void
  onSettings?: () => void
  onAccount?: () => void
  accountEntry?: AccountEntry
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
                tx="common:tryAgain"
                preset="reversed"
                style={themed($statusAction)}
                textStyle={themed($statusActionText)}
                onPress={state.retry}
              />
            ) : null}
            {onBack ? (
              <Button
                testID="back-from-connected-board-button"
                accessibilityLabel={translate("connected:gate.backToLocalPlay")}
                tx="common:back"
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
        state={{ status: "loading", message: translate("connected:board.checkingSession") }}
        onBack={props.onBack}
      />
    )
  const ownerId = user?.id ?? hintedUserId
  if (!ownerId)
    return (
      <ConnectedBoardShell
        state={{
          status: "unavailable",
          message: translate("connected:board.sessionUnavailable"),
        }}
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
                ? { status: "unavailable", message: translate("connected:gameGone") }
                : {
                    status: "unavailable",
                    message: translate("connected:board.unavailable"),
                    retry,
                  }
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
      <ConvexConnectedBoard key={runtimeKey} {...props} ownerId={ownerId} />
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
  onHistory?: () => void
  onRules?: () => void
  onDecks?: () => void
  onSettings?: () => void
  onAccount?: () => void
  accountEntry?: AccountEntry
  onGameEnded?: (publicId: string) => void
  onRematch?: (rematchPublicId: string) => void
  onGameAbandoned?: () => void
  view: ConnectedBoardReadyView
  controls: ConnectedBoardControls
  ownerId: string
  cloud: boolean
}

type FinishBlocker = (typeof FINISH_BLOCKERS)[keyof typeof FINISH_BLOCKERS]

type ConnectedBoardReadyView = {
  game: ConnectedBoardView
  syncSignal: BoardSyncSignal
  offlineSince?: number
  finishBlocker?: FinishBlocker
  failed: ConnectedGameRuntime["failed"]
  changeError?: string
  finishError?: string
  finishing: boolean
}

type ConnectedBoardControls = Pick<
  ConnectedGameRuntime,
  | "changeLife"
  | "submitCommanderDamage"
  | "resolveCommanderDamageClaim"
  | "finish"
  | "abandon"
  | "dismissFailed"
> & {
  current: () => ConnectedGameRuntime
}

type BoardSeat = Omit<GamePlayer, "life">

const ConnectedLivesContext = createContext<Readonly<Record<string, number>>>({})
const ConnectedUnsentContext = createContext(0)
const ConnectedTableContext = createContext<TableRuntime | undefined>(undefined)

function toBoardSeat(player: ConnectedBoardSeat): BoardSeat {
  // why: your own hidden role stays off the board, since the table can see your screen.
  const role =
    player.role && (player.roleRevealed || !player.controlledByMe) ? player.role : undefined
  return {
    id: asPlayerId(player.playerId),
    name: role ? `${player.displayName} · ${treacheryRoleLabel(role)}` : player.displayName,
    color: player.color,
    ...(shownMarkShape(player) ? { shape: shownMarkShape(player) } : {}),
    seat: player.seat,
  }
}

function finishBlockerFor(runtime: ConnectedGameRuntime): FinishBlocker | undefined {
  return runtime.connectionStatus === "offline"
    ? FINISH_BLOCKERS.offline
    : runtime.pending.length > 0
      ? FINISH_BLOCKERS.sending
      : runtime.failed.length > 0
        ? FINISH_BLOCKERS.rejected
        : undefined
}

const NO_LIVES: Readonly<Record<string, number>> = {}

interface ConnectedBoardRuntimeProps {
  publicId: string
  initialInviteOpen?: boolean
  onGameEnded?: (publicId: string) => void
  onRematch?: (rematchPublicId: string) => void
  onGameAbandoned?: () => void
  onBack?: () => void
  onHistory?: () => void
  onRules?: () => void
  onDecks?: () => void
  onSettings?: () => void
  onAccount?: () => void
  accountEntry?: AccountEntry
  ownerId: string
  // why: report, block, and the life log read or write Convex by game and seat id, which a nearby game doesn't have.
  cloud?: boolean
}

function ConvexConnectedBoard(props: ConnectedBoardRuntimeProps) {
  const runtime = useConnectedGame(props.publicId, props.ownerId)
  return <ConnectedBoardWithRuntime {...props} runtime={runtime} />
}

export function ConnectedBoardWithRuntime({
  publicId,
  initialInviteOpen,
  onGameEnded,
  onRematch,
  onGameAbandoned,
  onBack,
  onHistory,
  onRules,
  onDecks,
  onSettings,
  onAccount,
  accountEntry,
  ownerId,
  cloud = true,
  runtime,
}: ConnectedBoardRuntimeProps & { runtime: ConnectedGameRuntime }) {
  useKeepAwake("count-connected-game", { suppressDeactivateWarnings: true })
  const { signal: syncSignal, offlineSince } = useBoardSyncSignal({
    connectionStatus: runtime.connectionStatus,
    unsent: runtime.pending.length,
    oldestUnsentAt: runtime.pending[0]?.queuedAt,
    rejected: runtime.failed.length,
    needsAttention: Boolean(runtime.changeError),
  })
  const finishBlocker = finishBlockerFor(runtime)
  const view = useStructurallyStable<ConnectedBoardReadyView | null>(
    runtime.status === "ready"
      ? {
          game: connectedBoardView(runtime.projection),
          syncSignal,
          offlineSince,
          finishBlocker:
            finishBlocker === FINISH_BLOCKERS.sending &&
            (syncSignal.kind === "live" || syncSignal.kind === "caughtUp")
              ? undefined
              : finishBlocker,
          failed: runtime.failed,
          changeError: runtime.changeError,
          finishError: runtime.finishError,
          finishing: runtime.finishing,
        }
      : null,
  )
  const lives = useStructurallyStable(
    runtime.status === "ready" ? connectedLives(runtime.projection) : NO_LIVES,
  )
  const { pending } = runtime
  const lifeLog = useMemo(
    (): LifeLogSource | undefined => (cloud ? { kind: "connected", publicId, pending } : undefined),
    [cloud, publicId, pending],
  )
  const tableState = useStructurallyStable(runtime.table)
  const {
    tableRules,
    adjustCounter,
    takeDesignation,
    releaseDesignation,
    placePokemon,
    updatePokemon,
    adjustPokemonDamage,
    switchActive,
    removePokemon,
    knockOut,
    undoKnockout,
    setPokemonCondition,
    checkupPokemon,
  } = runtime
  const table = useMemo(
    (): TableRuntime => ({
      table: tableState,
      tableRules,
      adjustCounter,
      takeDesignation,
      releaseDesignation,
      placePokemon,
      updatePokemon,
      adjustPokemonDamage,
      switchActive,
      removePokemon,
      knockOut,
      undoKnockout,
      setPokemonCondition,
      checkupPokemon,
    }),
    [
      tableState,
      tableRules,
      adjustCounter,
      takeDesignation,
      releaseDesignation,
      placePokemon,
      updatePokemon,
      adjustPokemonDamage,
      switchActive,
      removePokemon,
      knockOut,
      undoKnockout,
      setPokemonCondition,
      checkupPokemon,
    ],
  )
  const latest = useRef(runtime)
  useLayoutEffect(() => {
    latest.current = runtime
  })
  const {
    changeLife,
    submitCommanderDamage,
    resolveCommanderDamageClaim,
    finish,
    abandon,
    dismissFailed,
  } = runtime
  const controls = useMemo(
    (): ConnectedBoardControls => ({
      changeLife,
      submitCommanderDamage,
      resolveCommanderDamageClaim,
      finish,
      abandon,
      dismissFailed,
      current: () => latest.current,
    }),
    [
      abandon,
      changeLife,
      dismissFailed,
      finish,
      resolveCommanderDamageClaim,
      submitCommanderDamage,
    ],
  )
  if (runtime.status === "loading")
    return (
      <ConnectedBoardShell
        state={{ status: "loading", message: translate("connected:board.loading") }}
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
  if (!view) return null
  return (
    <ConnectedLivesContext.Provider value={lives}>
      <ConnectedTableContext.Provider value={table}>
        <ConnectedUnsentContext.Provider value={runtime.pending.length}>
          <LifeLogContext.Provider value={lifeLog}>
            <ConnectedBoardReady
              publicId={publicId}
              initialInviteOpen={initialInviteOpen}
              onBack={onBack}
              onHistory={onHistory}
              onRules={onRules}
              onDecks={onDecks}
              onSettings={onSettings}
              onAccount={onAccount}
              accountEntry={accountEntry}
              onGameEnded={onGameEnded}
              onRematch={onRematch}
              onGameAbandoned={onGameAbandoned}
              view={view}
              controls={controls}
              ownerId={ownerId}
              cloud={cloud}
            />
          </LifeLogContext.Provider>
        </ConnectedUnsentContext.Provider>
      </ConnectedTableContext.Provider>
    </ConnectedLivesContext.Provider>
  )
}

const ConnectedBoardReady = memo(function ConnectedBoardReady({
  publicId,
  initialInviteOpen,
  onBack,
  onHistory,
  onRules,
  onDecks,
  onSettings,
  onAccount,
  accountEntry,
  onGameEnded,
  onRematch,
  onGameAbandoned,
  view,
  controls,
  ownerId,
  cloud,
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
  const [roleOpen, setRoleOpen] = useState(false)
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
  const game = view.game
  const { syncSignal, offlineSince, finishBlocker } = view
  const terminalStatus = game.status
  const rematchPublicId = game.rematchPublicId
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
    game.status === "finished" &&
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

  const system = game.system
  const rules = gameRules(system)
  useEffect(() => {
    if (rules?.kind === "text") prefetchRules(rules)
  }, [rules])
  const active = game.status === "active"
  const finished = game.status === "finished"

  const controlled = useMemo(
    () =>
      new Set(
        game.players.filter((player) => player.controlledByMe).map((player) => player.playerId),
      ),
    [game.players],
  )
  const players: BoardSeat[] = useMemo(
    () => [
      ...game.players.filter((player) => !controlled.has(player.playerId)).map(toBoardSeat),
      ...game.players.filter((player) => controlled.has(player.playerId)).map(toBoardSeat),
    ],
    [controlled, game.players],
  )
  // why: dice stay on this device; other seats never see these rolls.
  const dice = useDice(players, publicId, system)
  const diceTools = useMemo(
    () =>
      dice.tools.map((tool) => ({
        ...tool,
        onPress: () => {
          setMenuOpen(false)
          tool.onPress()
        },
      })),
    [dice.tools],
  )
  const layoutVariant =
    layoutSelection?.playerCount === players.length
      ? layoutSelection.layout
      : connectedBoardLayoutVariant(players.length)
  const commanderDamageEnabled =
    supportsCommanderDamage(system, game.format || game.ruleset) &&
    game.commanderDamage !== undefined
  const commanderTotals = game.commanderDamage?.totals ?? []
  const failedActionLabel = (event: PendingLifeAction["event"]) => {
    if (event.type === "life.changed")
      return translate(`connected:board.failedAction.life.${playSystemRules(system).id}`, {
        delta: `${event.delta > 0 ? "+" : ""}${event.delta}`,
      })
    if (event.type === "commanderDamage.submitted")
      return translate("connected:board.failedAction.commanderDamage", {
        delta: `${event.delta > 0 ? "+" : ""}${event.delta}`,
      })
    if (event.type === "table.action") return translate("connected:board.failedAction.table")
    return translate(
      event.accepted
        ? "connected:board.failedAction.confirmCommanderDamage"
        : "connected:board.failedAction.declineCommanderDamage",
    )
  }
  const displayNameOf = (playerId: string) =>
    game.players.find((candidate) => candidate.playerId === playerId)?.displayName ??
    translate("connected:board.anotherSeat")
  const incomingCommanderDamage = (player: BoardSeat): Record<PlayerId, number> =>
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
    if (
      !active ||
      controls.current().connectionStatus !== "connected" ||
      !controlled.has(player.id)
    )
      return
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
    controls.submitCommanderDamage(armedCommander.playerId, changes)
    setArmedCommander(null)
    setInspectedPlayerId(null)
  }
  const finishResultSelected = winnerPlayerIds.length > 0 || drawSelected

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
        await Share.share({
          message: translate("connected:invite.shareMessage", { url: inviteUrl }),
          url: inviteUrl,
        })
      else
        await Share.share({
          message: translate("connected:invite.shareMessageCode", { code: invitation.manualCode }),
        })
    } catch (cause) {
      setInviteError(
        cause instanceof Error ? cause.message : translate("connected:invite.shareFailed"),
      )
    }
  }

  function leaveAbandonedGame() {
    setAbandonedOpen(false)
    if (onGameAbandoned) onGameAbandoned()
    else onBack?.()
  }

  const canEnd = active && game.isHost && !view.finishing
  const myRole = cloud
    ? game.players.find((player) => player.controlledByMe && player.role)
    : undefined
  const radialActions: RadialMenuAction[] = useMemo(
    () => [
      {
        kind: "layout",
        label: translate("connected:board.menu.layout"),
        disabled: layoutOptions.length < 2,
        onPress: (event) => {
          captureMenuDialogOrigin(event)
          setMenuOpen(false)
          setLayoutPickerOpen(true)
        },
      },
      { kind: "dice", label: translate("connected:board.menu.dice"), tools: diceTools },
      ...(cloud
        ? [
            {
              kind: "players",
              label: translate("connected:board.menu.players"),
              onPress: (event?: GestureResponderEvent) => {
                captureMenuDialogOrigin(event)
                setMenuOpen(false)
                setPlayerActionsOpen(true)
              },
            } satisfies RadialMenuAction,
          ]
        : []),
      rules
        ? {
            kind: "rules",
            label: translate("connected:board.menu.rules"),
            disabled: rules.kind === "text" && !onRules,
            onPress: () => {
              setMenuOpen(false)
              openRules(rules, onRules)
            },
          }
        : {
            kind: "history",
            label: translate("connected:board.menu.history"),
            disabled: !onHistory,
            onPress: () => {
              setMenuOpen(false)
              onHistory?.()
            },
          },
      {
        kind: "end-game",
        label: translate("connected:board.menu.end"),
        detail: canEnd && finishBlocker ? translate(finishBlocker.petal) : undefined,
        blocked: canEnd && Boolean(finishBlocker),
        disabled: !canEnd,
        onPress: (event) => {
          captureMenuDialogOrigin(event)
          setMenuOpen(false)
          const runtime = controls.current()
          if (finishBlockerFor(runtime)) {
            setStatusOpen(true)
            return
          }
          const projection = runtime.status === "ready" ? runtime.projection : undefined
          const outcome = projection?.treacheryOutcome
          const standing = projection && !outcome ? connectedLastStanding(projection) : undefined
          setDrawSelected(outcome?.kind === "draw")
          setWinnerPlayerIds(
            outcome?.kind === "win" ? outcome.winnerPlayerIds : standing ? [standing] : [],
          )
          setConfirmingFinish(true)
        },
      },
    ],
    [
      canEnd,
      captureMenuDialogOrigin,
      controls,
      diceTools,
      finishBlocker,
      layoutOptions.length,
      cloud,
      onHistory,
      onRules,
      rules,
    ],
  )
  const seatColors = useSeatColors(players)
  const diceOpen = dice.open
  const closeDice = dice.close
  const exitAction = useMemo(
    () =>
      diceOpen
        ? { label: translate("connected:board.menu.closeDice"), onPress: closeDice }
        : armedCommander || inspectedPlayerId
          ? {
              label: translate("connected:board.menu.exitCommanderDamage"),
              onPress: exitCommanderDamage,
            }
          : undefined,
    [armedCommander, closeDice, diceOpen, inspectedPlayerId, exitCommanderDamage],
  )

  const inviteDialogOpen = invitation !== undefined && inviteOpen
  const overlayOpen =
    menuOpen ||
    statusOpen ||
    layoutPickerOpen ||
    confirmingFinish ||
    playerActionsOpen ||
    roleOpen ||
    inviteDialogOpen ||
    abandonedOpen
  const reportablePlayers: ReportablePlayer[] = game.players.map((player) => ({
    playerId: player.playerId,
    seat: player.seat,
    displayName: player.displayName,
    color: player.color,
    ...(shownMarkShape(player) ? { shape: shownMarkShape(player) } : {}),
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
          <ConnectedLifeGrid
            boardOrientation={boardOrientation}
            seats={players}
            system={system}
            lifeStep={game.lifeStep}
            layoutVariant={layoutVariant}
            disabled={!active || overlayOpen}
            isPlayerDisabled={(player) => !controlled.has(player.id)}
            isPlayerOwned={(player) => controlled.has(player.id)}
            isPlayerFoil={(player) =>
              Boolean(game.players.find((candidate) => candidate.playerId === player.id)?.foil)
            }
            isPlayerEliminated={(player) =>
              commanderDamageEnabled &&
              Boolean(
                game.players.find((candidate) => candidate.playerId === player.id)
                  ?.eliminatedByCommanderDamage,
              )
            }
            getStaleSince={(player) => (controlled.has(player.id) ? undefined : offlineSince)}
            getSeatDeck={(player) => {
              const versionId = controlled.has(player.id)
                ? game.players.find((candidate) => candidate.playerId === player.id)?.deckVersionId
                : undefined
              return versionId ? { ownerId, versionId } : undefined
            }}
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
                              onConfirm: () => controls.resolveCommanderDamageClaim(claim, true),
                              onDecline: () => controls.resolveCommanderDamageClaim(claim, false),
                            }))
                        : [],
                    onPressSword: toggleCommanderSword,
                    onStage: stageCommanderDamage,
                  }
                : undefined
            }
            dice={dice.grid}
            onChange={controls.changeLife}
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
          heldAction: diceOpen ? "dice" : undefined,
          onToggle: toggleMenu,
          onClose: closeMenu,
        }}
        windowOverlay={
          menuOpen && onDecks && onHistory && onSettings && onAccount ? (
            <FloatingAppNavigation
              destination="decks"
              accountEntry={accountEntry}
              onDestination={onDecks}
              onHistory={onHistory}
              onSettings={onSettings}
              onAccount={onAccount}
            />
          ) : null
        }
      />
      <ResultLiveRegion testID="dice-announcer" message={dice.webMessage} />

      {inviteDialogOpen && invitation ? (
        <DialogCard
          visible
          wide
          placement="bottom"
          origin={menuDialogOrigin}
          onClose={() => setInviteOpen(false)}
          backdropTestID="invite-backdrop"
          backdropAccessibilityLabel={translate("connected:invite.close")}
          dialogTestID="invite-dialog"
          accessibilityViewIsModal
        >
          <Text preset="subheading" tx="connected:invite.title" style={themed($dialogText)} />
          <InviteCard
            qrPayload={buildInviteQrPayload(invitation.token, invitation.manualCode)}
            manualCode={invitation.manualCode}
            onShare={() => void shareInvite()}
          />
          {inviteError ? <AlertNote text={inviteError} /> : null}
          <Button tx="common:close" onPress={() => setInviteOpen(false)} />
        </DialogCard>
      ) : null}

      {layoutPickerOpen ? (
        <DialogCard
          visible
          onClose={() => setLayoutPickerOpen(false)}
          origin={menuDialogOrigin}
          backdropTestID="connected-layout-backdrop"
          backdropAccessibilityLabel={translate("connected:board.closeLayout")}
          dialogTestID="connected-layout-dialog"
          accessibilityViewIsModal
          wide
          style={themed($boardDialog)}
        >
          <Text tx="connected:board.menu.layout" preset="subheading" style={themed($dialogText)} />
          <PlayerLayoutPicker
            playerCount={players.length}
            value={layoutVariant}
            testID="connected-layout"
            onChange={(layout) => {
              setLayoutSelection({ playerCount: players.length, layout })
              setLayoutPickerOpen(false)
            }}
          />
          <Button tx="common:cancel" onPress={() => setLayoutPickerOpen(false)} />
        </DialogCard>
      ) : null}

      {statusOpen ? (
        <DialogCard
          visible
          onClose={() => setStatusOpen(false)}
          origin={menuDialogOrigin}
          backdropTestID="connected-status-backdrop"
          backdropAccessibilityLabel={translate("connected:board.status.close")}
          dialogTestID="connected-status-dialog"
          accessibilityViewIsModal
          wide
          style={themed($boardDialog)}
        >
          <ElapsedText
            since={finished ? undefined : offlineSince}
            text={(elapsed) =>
              finished
                ? translate("connected:board.status.summary")
                : elapsed !== undefined
                  ? translate("connected:board.status.offlineFor", { elapsed })
                  : syncSignal.kind === "slow"
                    ? translate("connected:board.status.slow")
                    : syncSignal.kind === "catchingUp"
                      ? translate("connected:board.status.backOnline")
                      : syncSignal.kind === "attention"
                        ? (syncStatusText ?? translate("connected:board.status.connectedGame"))
                        : translate("connected:board.status.connected")
            }
            preset="subheading"
            style={themed($dialogText)}
          />
          <Text
            text={
              finished
                ? translate("connected:board.status.finalChanges", {
                    changes: counterChangeLabel(system, game.finalEventSequence ?? 0),
                  })
                : translate("connected:board.status.startsWith", {
                    format: storedPlaySystem(system)
                      ? playFormatLabel(system, game.format || game.ruleset)
                      : translate("systems:noSystem"),
                    value: counterValueLabel(system, game.startingLife),
                  })
            }
            size="xs"
            style={themed($muted)}
          />
          {finished ? null : (
            <View testID="connected-sync-details" style={themed($syncRows)}>
              <UnsentChangesRow offline={syncSignal.kind === "offline"} />
              <SyncRow
                label={translate("connected:board.status.otherPlayers")}
                since={offlineSince}
                value={(elapsed) =>
                  elapsed !== undefined
                    ? translate("connected:board.status.updatedAgo", { elapsed })
                    : syncSignal.kind === "slow"
                      ? translate("connected:board.status.mayArriveLate")
                      : translate("connected:board.status.live")
                }
              />
              <FinishAvailabilityRow blocker={finishBlocker} />
            </View>
          )}
          <ScrollView style={themed($statusScroll)} contentContainerStyle={themed($statusList)}>
            {view.failed.map((failure) => (
              <View
                key={failure.action.event.operationId}
                testID="connected-failed-action"
                accessibilityRole="alert"
                style={themed($failure)}
              >
                <Text text={`${failedActionLabel(failure.action.event)}: ${failure.reason}`} />
                <Button
                  tx="connected:board.status.dismissFailure"
                  onPress={() => controls.dismissFailed(failure.action.event.operationId)}
                />
              </View>
            ))}
            {view.changeError ? (
              <Text
                testID="connected-change-error"
                accessibilityRole="alert"
                text={view.changeError}
              />
            ) : null}
            {view.finishError ? (
              <Text
                testID="connected-finish-error"
                accessibilityRole="alert"
                text={view.finishError}
              />
            ) : null}
            {!active && !finished ? (
              <Text
                accessibilityRole="alert"
                tx={
                  game.status === "lobby"
                    ? "connected:board.status.readOnlyLobby"
                    : "connected:board.status.readOnlyAbandoned"
                }
              />
            ) : null}
          </ScrollView>
          <Button tx="common:close" onPress={() => setStatusOpen(false)} />
        </DialogCard>
      ) : null}

      {playerActionsOpen ? (
        <PlayerActionsDialog
          publicId={publicId}
          players={reportablePlayers}
          origin={menuDialogOrigin}
          onClose={() => setPlayerActionsOpen(false)}
          onRole={
            myRole
              ? () => {
                  setPlayerActionsOpen(false)
                  setRoleOpen(true)
                }
              : undefined
          }
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

      {roleOpen && myRole?.role ? (
        <TreacheryRoleDialog
          publicId={publicId}
          role={myRole.role}
          revealed={myRole.roleRevealed === true}
          canReveal={active}
          origin={menuDialogOrigin}
          onClose={() => setRoleOpen(false)}
        />
      ) : null}

      {abandonedOpen ? (
        <DialogCard
          visible
          onClose={() => setAbandonedOpen(false)}
          origin={menuDialogOrigin}
          backdropTestID="abandoned-game-backdrop"
          backdropAccessibilityLabel={translate("connected:board.abandoned.dismiss")}
          dialogTestID="abandoned-game-dialog"
          dialogAccessibilityRole="alert"
          wide
          style={themed($boardDialog)}
        >
          <Text
            tx="connected:board.abandoned.title"
            preset="subheading"
            style={themed($dialogText)}
          />
          <Text size="xs" tx="connected:board.abandoned.message" style={themed($muted)} />
          <Button tx="connected:board.abandoned.leave" onPress={leaveAbandonedGame} />
        </DialogCard>
      ) : null}

      {confirmingFinish ? (
        <DialogCard
          visible
          onClose={() => setConfirmingFinish(false)}
          closeDisabled={view.finishing}
          origin={menuDialogOrigin}
          backdropTestID="connected-finish-backdrop"
          backdropAccessibilityLabel={translate("connected:board.finish.cancel")}
          dialogTestID="connected-finish-confirmation"
          dialogAccessibilityRole="alert"
          style={themed($boardDialog)}
        >
          <View style={themed($dialogHeader)}>
            <Text tx="connected:board.finish.title" preset="subheading" />
            <Text size="xs" tx="connected:board.finish.subtitle" style={themed($dialogSubtitle)} />
          </View>
          <View style={themed($resultChoices)}>
            {game.players.map((player) => (
              <WinnerChoice
                key={player.playerId}
                player={player}
                system={system}
                selected={winnerPlayerIds.includes(player.playerId)}
                onPress={() => toggleWinner(player.playerId)}
              />
            ))}
            <ChoiceButton
              tx="connected:board.finish.draw"
              accentColor={colors.palette.neutral400}
              Leading={({ color }) => <DrawMark color={color} />}
              selected={drawSelected}
              onPress={selectDraw}
            />
          </View>
          {view.finishError ? (
            <AlertNote testID="connected-finish-error" text={view.finishError} />
          ) : null}
          <View style={themed($dialogActions)}>
            <Button
              testID="cancel-connected-finish-button"
              tx="common:cancel"
              disabled={view.finishing}
              style={themed($dialogAction)}
              onPress={() => setConfirmingFinish(false)}
            />
            <Button
              testID="confirm-connected-finish-button"
              tx={
                view.finishing
                  ? "play:ending"
                  : finishResultSelected
                    ? "play:finish"
                    : "play:abandon"
              }
              preset={finishResultSelected ? "reversed" : "filled"}
              disabled={view.finishing || Boolean(finishBlocker)}
              style={themed($dialogAction)}
              onPress={async () => {
                if (finishSubmitInFlight.current) return
                finishSubmitInFlight.current = true
                try {
                  const withResult = finishResultSelected
                  const ended = withResult
                    ? await controls.finish(
                        winnerPlayerIds.length > 0
                          ? { kind: "win" as const, winnerPlayerIds }
                          : { kind: "draw" as const },
                      )
                    : await controls.abandon()
                  if (!ended) return
                  setConfirmingFinish(false)
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
  offline: {
    petal: "connected:board.finishBlocker.offline.petal",
    detail: "connected:board.finishBlocker.offline.detail",
  },
  sending: {
    petal: "connected:board.finishBlocker.sending.petal",
    detail: "connected:board.finishBlocker.sending.detail",
  },
  rejected: {
    petal: "connected:board.finishBlocker.rejected.petal",
    detail: "connected:board.finishBlocker.rejected.detail",
  },
} as const satisfies Record<string, { petal: TxKeyPath; detail: TxKeyPath }>

function ConnectedLifeGrid({
  seats,
  ...grid
}: Omit<PlayerGridProps, "players"> & { seats: BoardSeat[] }) {
  const lives = useContext(ConnectedLivesContext)
  const players = useMemo(
    () => seats.map((seat): GamePlayer => ({ ...seat, life: lives[seat.id] ?? 0 })),
    [lives, seats],
  )
  const table = useContext(ConnectedTableContext)
  return <PlayerGrid {...grid} players={players} table={table} />
}

function WinnerChoice({
  player,
  system,
  selected,
  onPress,
}: {
  player: ConnectedBoardSeat
  system: ConnectedBoardView["system"]
  selected: boolean
  onPress: () => void
}) {
  const life = counterValueLabel(system, useContext(ConnectedLivesContext)[player.playerId] ?? 0)
  return (
    <ChoiceButton
      text={player.displayName}
      detail={life}
      accentColor={player.color}
      Leading={({ color }) => (
        <PlayerMark
          seatNumber={player.seat}
          shape={shownMarkShape(player)}
          foil={player.foil}
          color={color}
          size={28}
        />
      )}
      accessibilityLabel={translate(
        selected ? "connected:board.finish.winnerOption" : "connected:board.finish.playerOption",
        { name: player.displayName, life },
      )}
      selected={selected}
      onPress={onPress}
    />
  )
}

function UnsentChangesRow({ offline }: { offline: boolean }) {
  const unsent = useContext(ConnectedUnsentContext)
  return (
    <SyncRow
      label={translate("connected:board.status.yourChanges")}
      value={() =>
        unsent === 0
          ? translate("connected:board.status.allSent")
          : offline
            ? translate("connected:board.status.savedOffline", { unsent })
            : translate("connected:board.status.sending", { unsent })
      }
    />
  )
}

/** why: the board's blocker leaves out a brief send in progress, which this row still reports. */
function FinishAvailabilityRow({ blocker }: { blocker?: FinishBlocker }) {
  const unsent = useContext(ConnectedUnsentContext)
  const shown = blocker ?? (unsent > 0 ? FINISH_BLOCKERS.sending : undefined)
  return (
    <SyncRow
      label={translate("connected:board.status.finishGame")}
      value={() =>
        shown ? translate(shown.detail) : translate("connected:board.status.finishAvailable")
      }
    />
  )
}

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
