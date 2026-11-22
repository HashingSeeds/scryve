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
import type { TextStyle, ViewStyle } from "react-native"
import { ActivityIndicator, AppState, Platform, ScrollView, Share, View } from "react-native"
import { useUser } from "@clerk/expo"
import { useMutation } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import type { AccountEntry } from "@/components/AppUtilityMenu"
import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { DialogCard, $dialogActions, $dialogText } from "@/components/DialogCard"
import { PlayerGrid, type PlayerGridProps } from "@/components/PlayerGrid"
import { DrawMark } from "@/components/PlayerMark"
import { Screen } from "@/components/Screen"
import { Sheet } from "@/components/Sheet"
import { $sheetScroll, $sheetScrollContent } from "@/components/sheetStyles"
import { TeamMarks } from "@/components/TeamMarks"
import { Text, type TextProps } from "@/components/Text"
import { useSheetPresence } from "@/components/useSheetPresence"
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
  connectedStandingWinners,
  connectedTeams,
  connectedLives,
  connectedOutState,
  outPlayerIds,
  type ConnectedOutGame,
  type ConnectedBoardSeat,
  type ConnectedBoardView,
} from "@/features/connected/boardView"
import {
  CloudLogFeed,
  ConnectedLogContext,
  ConnectedLogDialog,
  type ConnectedLogFeed,
} from "@/features/connected/ConnectedLogDialog"
import { InviteCard } from "@/features/connected/InviteCard"
import { buildInviteQrPayload, buildInviteUrl } from "@/features/connected/inviteLinks"
import { loadLayoutChoice, saveLayoutChoice } from "@/features/connected/layoutChoice"
import type { PendingLifeAction } from "@/features/connected/model"
import { removeResumeEntryEverywhere } from "@/features/connected/persistence"
import {
  PlayerActionsDialog,
  type ReportablePlayer,
} from "@/features/connected/PlayerActionsDialog"
import type { PeerLatency } from "@/features/connected/syncLatency"
import { SyncStatsOverlay } from "@/features/connected/SyncStatsOverlay"
import { treacheryRoleLabel, TreacheryRoleDialog } from "@/features/connected/TreacheryRoleDialog"
import { useConnectedGame, type ConnectedGameRuntime } from "@/features/connected/useConnectedGame"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { isSharedDeckKey } from "@/features/decks/sharedDecks"
import {
  CLAIM_CHIP,
  MULLIGAN_RULE,
  mulliganStep,
  systemDice,
  type DiceSeatChip,
  type DiceSeatView,
  type MulliganAction,
  type TurnChipState,
} from "@/features/game/dice"
import { asPlayerId, matchContextLabel } from "@/features/game/domain"
import { firstPlayerFlips } from "@/features/game/FirstPlayerChoice"
import { GameBoard, useBoardChrome } from "@/features/game/GameBoard"
import { LifeLogContext, type LifeLogSource } from "@/features/game/LifeLog"
import { MatchEndDialog } from "@/features/game/LocalMatchEndDialog"
import { localGameRepository } from "@/features/game/localPersistence"
import { MatchScoreDialog } from "@/features/game/MatchScoreDialog"
import { defaultConnectedLayout, playerGridLayoutForCount } from "@/features/game/playerLayouts"
import {
  counterChangeLabel,
  counterValueLabel,
  playFormatLabel,
  playSystemRules,
  storedPlaySystem,
  playCommanderLethal,
} from "@/features/game/playSystems"
import type { TableRuntime } from "@/features/game/tableRuntime"
import {
  teamChoices,
  teamIncoming,
  teamMembers,
  teamName,
  teamValueLabel,
} from "@/features/game/teams"
import {
  reportTurnsGame,
  TurnDialog,
  useChessMinutes,
  useTurnsEnabled,
} from "@/features/game/TurnDialog"
import { PASS_UNDO_MS } from "@/features/game/turnTab"
import type { CommanderSlot, GamePlayer, MatchSeatOutcome, PlayerId } from "@/features/game/types"
import { useCommanderAttack } from "@/features/game/useCommanderAttack"
import { NearbyPlayersDialog } from "@/features/lan/NearbyPlayersDialog"
import { modeChipBeside } from "@/features/modes/modeChipBeside"
import { modeLogRow } from "@/features/modes/modeLogRow"
import { ModesDialog } from "@/features/modes/ModesDialog"
import { bagWithPlane, modeSeamFor, teamSeat } from "@/features/modes/modeSeamFor"
import { useBoardModes } from "@/features/modes/useBoardModes"
import type { TxKeyPath } from "@/i18n"
import { formatSigned, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $tableDirection, textEnd } from "@/theme/direction"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage, isGameUnavailableError } from "@/utils/convexError"
import { useElapsedSince } from "@/utils/useElapsedSince"
import { usePageBackgroundColor } from "@/utils/usePageBackgroundColor"
import { useStoreReview } from "@/utils/useStoreReview"
import { useStructurallyStable } from "@/utils/useStructurallyStable"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { shownMarkShape } from "../../convex/lib/appearance"
import { mulliganHandSize } from "../../convex/lib/mulligans"
import type { SystemId } from "../../convex/lib/systems"
import { isTeamVariant } from "../../convex/lib/teamVariants"
import { nextTurnSeat, sharesTurn, turnGroupOf, turnLead } from "../../convex/lib/turns"

type ConnectedBoardScreenProps = {
  publicId: string
  initialInviteOpen?: boolean
  onGameEnded?: (publicId: string) => void
  onRematch?: (rematchPublicId: string) => void
  onGameAbandoned?: () => void
  // why: called after a guest leaves on the server, so the route only has to navigate.
  onLeave?: () => void
  onBack?: () => void
  onHistory?: () => void
  onRules?: (system: SystemId, ruleId?: string) => void
  onDecks?: () => void
  onSettings?: () => void
  onSupport?: () => void
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
      fullWidth
      safeAreaEdges={[]}
      SystemBarsProps={{ hidden: true }}
      contentContainerStyle={themed($screen)}
    >
      <View testID="connected-game-board" dir="ltr" style={themed($board)}>
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

type ConnectedBoardReadyProps = {
  publicId: string
  initialInviteOpen?: boolean
  onBack?: () => void
  onHistory?: () => void
  onRules?: (system: SystemId, ruleId?: string) => void
  onDecks?: () => void
  onSettings?: () => void
  onSupport?: () => void
  onAccount?: () => void
  accountEntry?: AccountEntry
  onGameEnded?: (publicId: string) => void
  onRematch?: (rematchPublicId: string) => void
  onGameAbandoned?: () => void
  onLeave?: () => unknown
  view: ConnectedBoardReadyView
  controls: ConnectedBoardControls
  ownerId: string
  cloud: boolean
  partners: boolean
  awayPlayerIds?: readonly string[]
  onRevealRole?: () => Promise<unknown>
  onEndMatch?: EndMatch
  roleRevealOnline: boolean
  turns: boolean
  logFeed?: ConnectedLogFeed
  pregame?: PregameActions
}

export interface PregameActions {
  rollFirst: () => void
  chooseFirst: (playerId: string) => void
  keepHand: (seat: number, mulligans: number) => void
}

type EndMatch = (seats: { seat: number; outcome: MatchSeatOutcome }[]) => Promise<unknown>

type FinishBlocker = (typeof FINISH_BLOCKERS)[keyof typeof FINISH_BLOCKERS]

type ConnectedBoardReadyView = {
  game: ConnectedBoardView
  out: readonly string[]
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
  "changeLife" | "submitCommanderDamage" | "finish" | "abandon" | "dismissFailed"
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
    name: role ? joinParts([player.displayName, treacheryRoleLabel(role)]) : player.displayName,
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
  // why: a guest can't end the game, so the host's End slot leaves it instead. A rejection shows in the confirm dialog.
  onLeave?: () => unknown
  onBack?: () => void
  onHistory?: () => void
  onRules?: (system: SystemId, ruleId?: string) => void
  onDecks?: () => void
  onSettings?: () => void
  onSupport?: () => void
  onAccount?: () => void
  accountEntry?: AccountEntry
  ownerId: string
  // why: report, block, and the life log read or write Convex by game and seat id, which a nearby game doesn't have.
  cloud?: boolean
  /** why: a nearby host from before the game log can't send one, so its guests get no Log. */
  logFeed?: ConnectedLogFeed
  partners?: boolean
  turns?: boolean
  turnedConditions?: boolean
  awayPlayerIds?: readonly string[]
  onRevealRole?: () => Promise<unknown>
  onEndMatch?: EndMatch
  roleRevealOnline?: boolean
  pregame?: PregameActions
}

function ConvexConnectedBoard(props: ConnectedBoardRuntimeProps) {
  const runtime = useConnectedGame(props.publicId, props.ownerId)
  const reveal = useMutation(api.games.revealMyRole)
  const leaveGame = useMutation(api.games.leaveMyGame)
  const endMatch = useMutation(api.games.endMatch)
  const rollFirst = useMutation(api.games.rollFirstPlayer)
  const chooseFirst = useMutation(api.games.chooseFirstPlayer)
  const keepHand = useMutation(api.games.keepHand)
  const online = useConvexOnline()
  const { publicId, onLeave } = props
  const onRevealRole = useCallback(
    () => reveal({ publicId, deviceId: localGameRepository.getDeviceId() }),
    [publicId, reveal],
  )
  const leave = useCallback(async () => {
    if (!online) throw new Error(translate("connected:host.reconnectToExit"))
    await leaveGame({ publicId, deviceId: localGameRepository.getDeviceId() })
    removeResumeEntryEverywhere(publicId)
    onLeave?.()
  }, [leaveGame, onLeave, online, publicId])
  const pregame = useMemo(
    (): PregameActions => ({
      rollFirst: () => void rollFirst({ publicId }).catch(() => undefined),
      chooseFirst: (playerId) =>
        void chooseFirst({ publicId, playerId: playerId as Id<"gamePlayers"> }).catch(
          () => undefined,
        ),
      keepHand: (seat, mulligans) =>
        void keepHand({ publicId, seat, mulligans }).catch(() => undefined),
    }),
    [chooseFirst, keepHand, publicId, rollFirst],
  )
  return (
    <ConnectedBoardWithRuntime
      {...props}
      runtime={runtime}
      pregame={pregame}
      onRevealRole={onRevealRole}
      onEndMatch={(seats) => endMatch({ publicId, seats })}
      roleRevealOnline={online}
      onLeave={onLeave ? leave : undefined}
    />
  )
}

/** why: a frame after the layout effect is when the new totals reach the screen, which is what the other players are waiting for. */
function usePaintTiming({ latency, projection }: ConnectedGameRuntime) {
  const eventSequence = projection?.eventSequence
  useEffect(() => {
    const away = (state: string) => state === "background" || state === "inactive"
    latency.setPaused(away(AppState.currentState))
    const subscription = AppState.addEventListener("change", (state) =>
      latency.setPaused(away(state)),
    )
    return () => subscription.remove()
  }, [latency])
  useLayoutEffect(() => {
    if (eventSequence === undefined) return
    const frame = requestAnimationFrame(() => latency.painted(eventSequence))
    return () => cancelAnimationFrame(frame)
  }, [eventSequence, latency])
}

export function ConnectedBoardWithRuntime({
  publicId,
  initialInviteOpen,
  onGameEnded,
  onRematch,
  onGameAbandoned,
  onLeave,
  onBack,
  onHistory,
  onRules,
  onDecks,
  onSettings,
  onSupport,
  onAccount,
  accountEntry,
  ownerId,
  cloud = true,
  logFeed = cloud ? CloudLogFeed : undefined,
  partners = cloud,
  turns = cloud,
  turnedConditions = true,
  awayPlayerIds,
  onRevealRole,
  onEndMatch,
  roleRevealOnline = false,
  pregame,
  runtime,
  peerLatency,
}: ConnectedBoardRuntimeProps & {
  runtime: ConnectedGameRuntime
  peerLatency?: () => PeerLatency[]
}) {
  usePaintTiming(runtime)
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
          out: outPlayerIds(runtime.projection),
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
  const lifeTeams = useStructurallyStable(
    runtime.status === "ready" ? connectedTeams(runtime.projection) : undefined,
  )
  const lifeLog = useMemo(
    (): LifeLogSource | undefined =>
      cloud
        ? { kind: "connected", publicId, pending, ...(lifeTeams ? { teams: lifeTeams } : {}) }
        : undefined,
    [cloud, publicId, pending, lifeTeams],
  )
  const { undoLife, undoTable, undoCommander } = runtime
  const logContext = useMemo(
    () => ({ pending, lives, undoLife, undoTable, undoCommander }),
    [pending, lives, undoLife, undoTable, undoCommander],
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
    passTurn,
    setTurn,
    undoTurn,
    setBank,
    startTurn,
    modeAction,
  } = runtime
  const table = useMemo(
    (): TableRuntime => ({
      table: tableState,
      tableRules,
      turnedConditions,
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
      passTurn,
      setTurn,
      undoTurn,
      setBank,
      startTurn,
      modeAction,
    }),
    [
      tableState,
      tableRules,
      turnedConditions,
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
      passTurn,
      setTurn,
      undoTurn,
      setBank,
      startTurn,
      modeAction,
    ],
  )
  const latest = useRef(runtime)
  useLayoutEffect(() => {
    latest.current = runtime
  })
  const { changeLife, submitCommanderDamage, finish, abandon, dismissFailed } = runtime
  const controls = useMemo(
    (): ConnectedBoardControls => ({
      changeLife,
      submitCommanderDamage,
      finish,
      abandon,
      dismissFailed,
      current: () => latest.current,
    }),
    [abandon, changeLife, dismissFailed, finish, submitCommanderDamage],
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
            <ConnectedLogContext.Provider value={logContext}>
              <ConnectedBoardReady
                publicId={publicId}
                initialInviteOpen={initialInviteOpen}
                onBack={onBack}
                onHistory={onHistory}
                onRules={onRules}
                onDecks={onDecks}
                onSettings={onSettings}
                onSupport={onSupport}
                onAccount={onAccount}
                accountEntry={accountEntry}
                onGameEnded={onGameEnded}
                onRematch={onRematch}
                onGameAbandoned={onGameAbandoned}
                onLeave={onLeave}
                view={view}
                controls={controls}
                ownerId={ownerId}
                cloud={cloud}
                partners={partners}
                awayPlayerIds={awayPlayerIds}
                onRevealRole={onRevealRole}
                onEndMatch={onEndMatch}
                roleRevealOnline={roleRevealOnline}
                turns={turns}
                logFeed={logFeed}
                pregame={pregame}
              />
            </ConnectedLogContext.Provider>
            <SyncStatsOverlay latency={runtime.latency} peers={peerLatency} />
          </LifeLogContext.Provider>
        </ConnectedUnsentContext.Provider>
      </ConnectedTableContext.Provider>
    </ConnectedLivesContext.Provider>
  )
}

type BoardOverlay =
  | "status"
  | "match"
  | "finish"
  | "leave"
  | "players"
  // why: iOS can't present the invite sheet until the player actions Modal has faded out.
  | "inviteAfterPlayers"
  | "invite"
  | "role"
  | "turn"
  | "log"

const GRID_LOCKING_OVERLAYS: ReadonlySet<BoardOverlay> = new Set([
  "status",
  "match",
  "finish",
  "players",
  "inviteAfterPlayers",
  "role",
])

const ConnectedBoardReady = memo(function ConnectedBoardReady({
  publicId,
  initialInviteOpen,
  onBack,
  onHistory,
  onRules,
  onDecks,
  onSettings,
  onSupport,
  onAccount,
  accountEntry,
  onGameEnded,
  onRematch,
  onGameAbandoned,
  onLeave,
  view,
  controls,
  ownerId,
  cloud,
  partners,
  awayPlayerIds = [],
  onRevealRole,
  onEndMatch,
  roleRevealOnline,
  turns,
  logFeed,
  pregame,
}: ConnectedBoardReadyProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const [overlay, setOverlay] = useState<BoardOverlay | undefined>(
    initialInviteOpen ? "invite" : undefined,
  )
  const close = useCallback(
    (shown: BoardOverlay) => setOverlay((current) => (current === shown ? undefined : current)),
    [],
  )
  const [abandonedOpen, setAbandonedOpen] = useState(false)
  const [matchEnding, setMatchEnding] = useState<"choosing" | "sending">()
  const [matchEndError, setMatchEndError] = useState<string>()
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string>()
  const [inviteError, setInviteError] = useState<string>()
  const [winnerPlayerIds, setWinnerPlayerIds] = useState<string[]>([])
  const [drawSelected, setDrawSelected] = useState(false)
  const [layoutChoice, setLayoutChoice] = useState(() => loadLayoutChoice(publicId))
  const finishSubmitInFlight = useRef(false)
  const navigatedTerminal = useRef(false)
  const game = view.game
  const { syncSignal, offlineSince, finishBlocker } = view
  const terminalStatus = game.status
  const rematchPublicId = game.rematchPublicId
  const table = useContext(ConnectedTableContext)
  const turn = turns ? table?.table.turn : undefined
  const turnGroups = table?.table.turnGroups
  const tablePlayers = table?.table.players
  const tableCounters = table?.tableRules.counters
  const sharesCounters = isTeamVariant(game.variant)
  const counterTable = useMemo(
    () => ({
      players: tablePlayers,
      counterKey: (playerId: string, counterId: string) =>
        sharesCounters && tableCounters?.some(({ id, shared }) => id === counterId && shared)
          ? `${turnLead(turnGroups, playerId)}:${counterId}`
          : `${playerId}:${counterId}`,
    }),
    [tablePlayers, tableCounters, sharesCounters, turnGroups],
  )
  const [turnsEnabled] = useTurnsEnabled(localGameRepository)
  const [chessMinutes] = useChessMinutes(localGameRepository)
  const chessAppliedTo = useRef<string>(undefined)
  const openLog = useCallback(() => setOverlay("log"), [])
  const [passUndo, setPassUndo] = useState<{ operationId: string; passerId: string }>()
  useEffect(() => {
    if (!passUndo) return
    const expire = setTimeout(() => setPassUndo(undefined), PASS_UNDO_MS)
    return () => clearTimeout(expire)
  }, [passUndo])
  const endedTurn = useRef(turn)
  useLayoutEffect(() => {
    endedTurn.current = turn
  })
  const leaveFinished = useCallback(() => {
    if (rematchPublicId && onRematch) onRematch(rematchPublicId)
    else onGameEnded?.(publicId)
  }, [rematchPublicId, onRematch, onGameEnded, publicId])
  const tabOn = turns && turnsEnabled
  const playerCount = game.players.length
  useEffect(() => {
    if (terminalStatus === "finished") {
      if (navigatedTerminal.current) return
      navigatedTerminal.current = true
      reportTurnsGame({
        turnsEnabled: tabOn,
        turn: endedTurn.current,
        playerCount,
        mode: "connected",
      })
      leaveFinished()
    } else if (terminalStatus === "abandoned" && !navigatedTerminal.current) {
      setAbandonedOpen(true)
    }
  }, [terminalStatus, leaveFinished, tabOn, playerCount])
  const named = game.players.map(({ playerId, displayName }) => ({
    id: playerId,
    name: displayName,
  }))
  function toggleWinner(playerId: string) {
    setDrawSelected(false)
    const team = teamMembers(named, turnGroups, playerId).map(({ id }) => id)
    setWinnerPlayerIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => !team.includes(id))
        : [...current, ...team],
    )
  }

  function selectDraw() {
    setWinnerPlayerIds([])
    setDrawSelected((current) => !current)
  }

  const system = game.system
  const active = game.status === "active"
  const finished = game.status === "finished"

  const anySeat = game.lifeEditing === "anyone"
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
  const teams = useMemo(() => {
    const groups = connectedTeams({ variant: game.variant, table: table?.table })
    return (
      groups &&
      [...groups].sort(
        (a, b) =>
          Number(a.some((id) => controlled.has(id))) - Number(b.some((id) => controlled.has(id))),
      )
    )
  }, [controlled, game.variant, table?.table])
  const cellCount = teams?.length ?? players.length
  const layoutVariant =
    layoutChoice?.playerCount === cellCount
      ? layoutChoice.layout
      : playerGridLayoutForCount(
          cellCount,
          game.layout,
          teams ? "auto" : defaultConnectedLayout(players.length),
        )
  const commanderLethal = playCommanderLethal(system, game.format || game.ruleset)
  const commanderDamageEnabled = commanderLethal !== undefined && game.commanderDamage !== undefined
  const commanderTotals = game.commanderDamage?.totals ?? []
  const failedActionLabel = (event: PendingLifeAction["event"]) => {
    if (event.type === "life.changed")
      return translate(`connected:board.failedAction.life.${playSystemRules(system).id}`, {
        delta: formatSigned(event.delta),
      })
    if (event.type === "commanderDamage.submitted")
      return translate("connected:board.failedAction.commanderDamage", {
        delta: formatSigned(event.delta),
      })
    if (event.type === "table.action") return translate("connected:board.failedAction.table")
    return translate(
      event.accepted
        ? "connected:board.failedAction.confirmCommanderDamage"
        : "connected:board.failedAction.declineCommanderDamage",
    )
  }
  const seatDeck = (playerId: PlayerId) => {
    const versionId = controlled.has(playerId)
      ? game.players.find((candidate) => candidate.playerId === playerId)?.deckVersionId
      : undefined
    return isSharedDeckKey(versionId)
      ? { sharedDeckKey: versionId }
      : versionId
        ? { ownerId, versionId }
        : undefined
  }
  const commanderPort = {
    incoming: teamIncoming(
      teams,
      (to: PlayerId, commander?: CommanderSlot) =>
        Object.fromEntries(
          players
            .filter(({ id }) => id !== to)
            .map((source) => [
              source.id,
              commanderTotals.find(
                (total) =>
                  total.fromPlayerId === source.id &&
                  total.toPlayerId === to &&
                  total.commander === commander,
              )?.total ?? 0,
            ]),
        ) as Record<PlayerId, number>,
    ),
    commit: controls.submitCommanderDamage,
  }
  const attack = useCommanderAttack(commanderPort, {
    seatDeck,
    singleCommander: !partners,
    buffered: true,
  })
  const attackDispatch = attack.dispatch
  function toggleCommanderSword(player: GamePlayer) {
    if (
      !active ||
      controls.current().connectionStatus !== "connected" ||
      !(anySeat || controlled.has(player.id))
    )
      return
    attackDispatch({ type: "press", playerId: player.id })
  }
  const finishResultSelected = winnerPlayerIds.length > 0 || drawSelected

  const syncStatusText = boardSyncStatusText(syncSignal)

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

  const match = game.match
  const matchSeats = game.players.map((player) => {
    const scored = match?.seats.find(({ seat }) => seat === player.seat)
    return {
      id: player.playerId,
      seat: player.seat,
      name: player.displayName,
      color: player.color,
      shape: shownMarkShape(player),
      wins: scored?.gamesWon ?? 0,
      out: view.out.includes(player.playerId),
    }
  })
  const matchDraws = match?.seats[0]?.gamesDrawn ?? 0
  const matchLine = match
    ? matchContextLabel({
        match: {
          gameNumber: match.gameNumber,
          wins: matchSeats.map(({ wins }) => wins),
          draws: matchDraws,
        },
      })
    : undefined
  async function endMatch(outcomes: MatchSeatOutcome[]) {
    if (!onEndMatch) return
    setMatchEnding("sending")
    setMatchEndError(undefined)
    try {
      await onEndMatch(matchSeats.map(({ seat }, index) => ({ seat, outcome: outcomes[index] })))
      setMatchEnding(undefined)
    } catch (cause) {
      setMatchEndError(convexErrorMessage(cause, translate("board:matchEnd.failed")))
      setMatchEnding("choosing")
    }
  }

  function leaveAbandonedGame() {
    setAbandonedOpen(false)
    if (onGameAbandoned) onGameAbandoned()
    else onBack?.()
  }

  const canEnd = active && game.isHost && !view.finishing
  const leave = !game.isHost ? onLeave : undefined
  async function confirmLeave() {
    if (!leave || leaving) return
    setLeaving(true)
    setLeaveError(undefined)
    // why: success navigates off the board, so the dialog stays busy instead of offering a second leave.
    try {
      await leave()
    } catch (cause) {
      setLeaveError(
        convexErrorMessage(
          cause,
          cause instanceof Error ? cause.message : translate("connected:host.exitFailed"),
        ),
      )
      setLeaving(false)
    }
  }
  const myRole = onRevealRole
    ? game.players.find((player) => player.controlledByMe && player.role)
    : undefined
  const chrome = useBoardChrome({
    // why: dice stay on this device; other seats never see these rolls.
    gameId: publicId,
    system,
    players,
    teams,
    layout: {
      value: layoutVariant,
      onChange: (layout) => {
        const choice = { playerCount: cellCount, layout }
        setLayoutChoice(choice)
        saveLayoutChoice(publicId, choice)
      },
    },
    petals: [
      {
        kind: "players",
        label: translate("connected:board.menu.players"),
        onPress: () => setOverlay("players"),
      },
      leave
        ? {
            kind: "end-game",
            label: translate("connected:board.menu.leave"),
            onPress: () => {
              setLeaveError(undefined)
              setOverlay("leave")
            },
          }
        : {
            kind: "end-game",
            label: translate("connected:board.menu.end"),
            detail: canEnd && finishBlocker ? translate(finishBlocker.petal) : undefined,
            blocked: canEnd && Boolean(finishBlocker),
            disabled: !canEnd,
            onPress: () => {
              const runtime = controls.current()
              if (finishBlockerFor(runtime)) {
                setOverlay("status")
                return
              }
              const projection = runtime.status === "ready" ? runtime.projection : undefined
              const outcome = projection?.treacheryOutcome
              const standing =
                projection && !outcome ? connectedStandingWinners(projection) : undefined
              setDrawSelected(outcome?.kind === "draw")
              setWinnerPlayerIds(
                outcome?.kind === "win" ? outcome.winnerPlayerIds : (standing ?? []),
              )
              setOverlay("finish")
            },
          },
    ],
    attack,
    signal: boardSyncMenuSignal(syncSignal),
    statusLine:
      syncStatusText && syncSignal.kind !== "live"
        ? { text: syncStatusText, tone: syncSignal.kind, onPress: () => setOverlay("status") }
        : match && matchLine
          ? {
              text: translate("board:match.statusLine", {
                context: matchLine,
                bestOf: match.bestOf,
              }),
              tone: "caughtUp",
              onPress: () => setOverlay("match"),
            }
          : undefined,
    accountEntry,
    onRules,
    onDecks,
    onHistory,
    onSettings,
    onSupport,
    onAccount,
    onLog: logFeed ? openLog : undefined,
  })
  const { menuOpen, dice, dialogOrigin: menuDialogOrigin } = chrome
  const logSeats = useMemo(
    () => [...game.players].sort((left, right) => left.seat - right.seat).map(toBoardSeat),
    [game.players],
  )
  // why: the chess clock is the host's setup choice, so only the host's device sets the bank, through any seat it holds; whoever goes first may be on a device that chose otherwise.
  const hostSeat = game.isHost ? [...controlled][0] : undefined
  useEffect(() => {
    if (!chessMinutes || !table || !turn || turn.number !== 1 || turn.bank) return
    if (!hostSeat || chessAppliedTo.current === turn.operationId) return
    chessAppliedTo.current = turn.operationId
    table.setBank(hostSeat, chessMinutes * 60_000)
  }, [chessMinutes, table, turn, hostSeat])
  const turnSeats = [...game.players]
    .sort((left, right) => left.seat - right.seat)
    .map((player) => ({
      playerId: player.playerId,
      seatNumber: player.seat,
      name: player.displayName,
      color: player.color,
      shape: shownMarkShape(player),
    }))
  // why: any device holding a seat in the active group may act for it, and the engine checks the acting seat shares the turn.
  const actingSeat = turn && turnGroupOf(turnGroups, turn.playerId).find((id) => controlled.has(id))
  const myTurn = actingSeat !== undefined
  const undoSeat =
    turn?.previous &&
    turnGroupOf(turnGroups, turn.previous.playerId).find((id) => controlled.has(id))
  function nextPlayerId() {
    if (!turn) return undefined
    return nextTurnSeat(
      turnSeats.map(({ playerId }) => playerId),
      turn.playerId,
      (id) => view.out.includes(id),
      turnGroups,
    )
  }
  function passTo(next: string) {
    if (!turn || !actingSeat || !table) return
    const operationId = table.passTurn(actingSeat, next)
    if (!operationId) return
    setPassUndo({ operationId, passerId: actingSeat })
  }
  const turnsOn = tabOn && active && table !== undefined
  const boardModes = useBoardModes({
    modes: active ? table?.table.modes : undefined,
    turn: table?.table.turn,
    groups: turnGroups,
    players: turnSeats.map(({ playerId, name }) => ({ id: playerId, name })),
    controls: (playerId) => controlled.has(playerId),
    act: (action) => table?.modeAction(action) ?? false,
    turnsOn,
  })
  const dieOnChip = turnsOn && !!turn && !!boardModes.planar
  const turnChip: TurnChipState | undefined =
    turnsOn && turn
      ? {
          turn,
          canPress: myTurn,
          nameOf: (playerId) => teamName(named, turnGroups, playerId),
          seatOf: (playerId) => turnSeats.find((seat) => seat.playerId === playerId),
          passLabelShown: localGameRepository.passLabelShown(),
          onStart: () => actingSeat && table?.startTurn(actingSeat),
          onPass: (next) => {
            localGameRepository.notePass()
            passTo(next)
          },
          onLongPress: () => setOverlay("turn"),
        }
      : undefined
  const handSize = mulliganHandSize(system)
  const { firstPlayer } = game
  const firstPlayerId = firstPlayer?.playerId
  const pregameOpen = active && !game.played && pregame !== undefined
  const chooser = pregameOpen && !firstPlayerId ? firstPlayer?.chooser : undefined
  const seatsInOrder = [...game.players].sort((left, right) => left.seat - right.seat)
  const firstPlayerOffer: DiceSeatView | undefined =
    pregameOpen && firstPlayer?.mode && !firstPlayerId && !chooser
      ? firstPlayer.mode === "pick"
        ? { kind: "pickOffer" }
        : {
            kind: "rollOffer",
            tool: firstPlayerFlips(system, seatsInOrder.length) ? "coin" : systemDice(system).die,
          }
      : undefined
  const rollsShown = useRollsShown(pregameOpen ? firstPlayer?.rolls : undefined)
  const mulliganSeat =
    pregameOpen &&
    game.freeMulligans &&
    handSize !== undefined &&
    !isTeamVariant(game.variant) &&
    !(firstPlayer?.mode && !firstPlayerId)
      ? seatsInOrder.find(
          (seat) =>
            controlled.has(seat.playerId) && seat.deckVersionId && seat.mulligans === undefined,
        )
      : undefined
  const draftKey = `${publicId}:${mulliganSeat?.playerId ?? ""}`
  const [mulliganDraft, setMulliganDraft] = useState<{
    key: string
    taken: number
    help: boolean
    skipped: boolean
  }>()
  const mulligan =
    mulliganDraft?.key === draftKey
      ? mulliganDraft
      : { key: draftKey, taken: 0, help: false, skipped: false }
  function pregameView(playerId: string): DiceSeatView | undefined {
    const rolls = rollsShown ? firstPlayer?.rolls : undefined
    const rolled = rolls?.[playerId]
    if (rolled !== undefined) {
      const winner = firstPlayerId ?? firstPlayer?.chooser?.playerId
      return {
        kind: "rolloff",
        die: systemDice(system).die,
        value: rolled,
        attempt: 1,
        status: playerId !== winner ? "lost" : firstPlayerId ? "won" : "chooses",
      }
    }
    if (firstPlayerOffer) return firstPlayerOffer
    // why: a chooser on an app from before first player never answers, so other seats stay playable and the first change starts the game.
    if (chooser)
      return chooser.playerId === playerId && controlled.has(playerId)
        ? { kind: "choice", reason: chooser.reason }
        : undefined
    if (playerId !== mulliganSeat?.playerId || mulligan.skipped || !game.freeMulligans) return
    return handSize === undefined
      ? undefined
      : mulliganStep(mulligan.taken, game.freeMulligans, handSize, mulligan.help)
  }
  const autoTurn = useRef<string>(undefined)
  useEffect(() => {
    if (!turnsOn || turn || !firstPlayerId || !controlled.has(firstPlayerId)) return
    if (autoTurn.current === firstPlayerId) return
    autoTurn.current = firstPlayerId
    table?.setTurn(firstPlayerId, firstPlayerId)
  }, [controlled, firstPlayerId, table, turn, turnsOn])
  const firstPending = !!firstPlayerOffer || !!chooser
  const seatGrid = {
    ...dice.grid,
    bag: bagWithPlane(dice.grid.bag, boardModes),
    seatFor: (player: GamePlayer) => dice.grid.seatFor(player) ?? pregameView(player.id),
    onPressSeat: (player: GamePlayer) => {
      if (!firstPlayerOffer || dice.grid.seatFor(player)) return dice.grid.onPressSeat(player)
      if (firstPlayerOffer.kind === "rollOffer") return pregame?.rollFirst()
      pregame?.chooseFirst(player.id)
    },
    onChoose: (player: GamePlayer, order: "first" | "second") => {
      if (!chooser) return dice.grid.onChoose(player, order)
      const index = seatsInOrder.findIndex((seat) => seat.playerId === player.id)
      const next = seatsInOrder[(index + 1) % seatsInOrder.length]
      pregame?.chooseFirst(order === "first" ? player.id : (next?.playerId ?? player.id))
    },
    onMulligan: (action: MulliganAction) => {
      if (action === "keep")
        return mulliganSeat && pregame?.keepHand(mulliganSeat.seat, mulligan.taken)
      if (action === "rule") return system && onRules?.(system, MULLIGAN_RULE)
      setMulliganDraft({
        ...mulligan,
        ...(action === "mulligan" && handSize !== undefined
          ? { taken: Math.min(handSize, mulligan.taken + 1) }
          : {}),
        ...(action === "skip" ? { skipped: true } : {}),
        ...(action === "help" || action === "close" ? { help: action === "help" } : {}),
      })
    },
    chipsFor: (player: GamePlayer): DiceSeatChip[] => {
      const chips = dice.grid.chipsFor(player)
      if (turnChip && sharesTurn(turnGroups, turnChip.turn.playerId, player.id))
        return [
          ...chips.filter(({ kind }) => kind === "roll"),
          {
            kind: "turn",
            state: {
              ...turnChip,
              beside: modeChipBeside(boardModes, player.id, {
                dieOnChip,
                plays: (seat) => controlled.has(seat),
              }),
            },
          },
        ]
      if (passUndo && sharesTurn(turnGroups, passUndo.passerId, player.id))
        return [
          ...chips,
          {
            kind: "undoPass",
            onUndo: () => {
              table?.undoTurn(passUndo.passerId, passUndo.operationId)
              setPassUndo(undefined)
            },
          },
        ]
      const first: DiceSeatChip[] =
        pregameOpen && player.id === firstPlayerId && !rollsShown ? [{ kind: "first" }] : []
      return turnsOn && !turn && !firstPending && controlled.has(player.id)
        ? [...chips, ...first, CLAIM_CHIP]
        : [...chips, ...first]
    },
    onPressChip: (player: GamePlayer, chip: DiceSeatChip) => {
      if (chip.kind === "claim") {
        if (!turn) table?.setTurn(player.id, player.id)
        return
      }
      if (chip.kind === "first") return
      dice.grid.onPressChip(player, chip)
    },
  }
  useStoreReview(
    game.status === "finished" &&
      !menuOpen &&
      !chrome.layoutOpen &&
      overlay !== "status" &&
      overlay !== "finish" &&
      overlay !== "players",
  )

  const inviteDialogOpen = invitation !== undefined && overlay === "invite"
  const inviteSheet = useSheetPresence(inviteDialogOpen || undefined)
  // why: the invite sheet must stay mounted to animate out after its invitation is gone.
  const lastInvitation = useRef(invitation)
  if (invitation) lastInvitation.current = invitation
  const shownInvitation = lastInvitation.current
  useEffect(() => {
    if (overlay === "invite" && invitation === undefined) close("invite")
  }, [overlay, invitation, close])
  const overlayOpen =
    menuOpen ||
    chrome.layoutOpen ||
    inviteDialogOpen ||
    Boolean(inviteSheet.shown) ||
    abandonedOpen ||
    matchEnding !== undefined ||
    (overlay !== undefined && GRID_LOCKING_OVERLAYS.has(overlay))
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
      fullWidth
      safeAreaEdges={[]}
      SystemBarsProps={{ hidden: true }}
      contentContainerStyle={themed($screen)}
    >
      <GameBoard
        testID="connected-game-board"
        chrome={chrome}
        turns={
          turnChip
            ? { active: turnChip.turn.playerId, groups: turnGroups, nextOf: nextPlayerId }
            : undefined
        }
        seam={modeSeamFor(boardModes, {
          dieOnChip,
          turnChips: turnsOn && !!turn,
          slotOf: (playerId) => {
            if (teams) return teamSeat(teams, playerId)
            const slot = players.findIndex(({ id }) => id === playerId)
            return slot < 0 ? undefined : { slot }
          },
        })}
        renderGrid={(boardOrientation) => (
          <ConnectedLifeGrid
            boardOrientation={boardOrientation}
            seats={players}
            system={system}
            lifeStep={game.lifeStep}
            onOpenRule={(ruleId) => system && onRules?.(system, ruleId)}
            layoutVariant={layoutVariant}
            disabled={!active || overlayOpen}
            {...(anySeat
              ? {}
              : {
                  isPlayerDisabled: (player: GamePlayer) => !controlled.has(player.id),
                  isPlayerOwned: (player: GamePlayer) => controlled.has(player.id),
                })}
            isPlayerFoil={(player) =>
              Boolean(game.players.find((candidate) => candidate.playerId === player.id)?.foil)
            }
            outGame={game}
            getStaleSince={(player) => (controlled.has(player.id) ? undefined : offlineSince)}
            getSeatDeck={(player) => seatDeck(player.id)}
            commanderDamage={
              commanderDamageEnabled
                ? {
                    incomingFor: commanderPort.incoming,
                    lethal: commanderLethal,
                    attack,
                    onPressSword: toggleCommanderSword,
                  }
                : undefined
            }
            dice={seatGrid}
            teams={teams}
            onChange={(playerId, delta) => controls.changeLife(asPlayerId(playerId), delta)}
          />
        )}
      />

      {overlay === "turn" && table ? (
        <TurnDialog
          turn={turn}
          seats={turnSeats}
          pick={{
            canPick: (playerId) => (turn ? myTurn : controlled.has(playerId)),
            onPick: (playerId) => {
              table.setTurn(actingSeat ?? playerId, playerId)
              close("turn")
            },
          }}
          onUndo={
            turn && undoSeat
              ? () => {
                  table.undoTurn(undoSeat, turn.operationId)
                  setPassUndo(undefined)
                  close("turn")
                }
              : undefined
          }
          onBank={(() => {
            const mine = turnSeats.find(({ playerId }) => controlled.has(playerId))
            return turn && mine ? (bankMs) => table.setBank(mine.playerId, bankMs) : undefined
          })()}
          onClose={() => close("turn")}
        />
      ) : null}

      {overlay === "log" && logFeed ? (
        <ConnectedLogDialog
          publicId={publicId}
          Feed={logFeed}
          seats={logSeats}
          turn={table?.table.turn}
          groups={turnGroups}
          sharedLife={isTeamVariant(game.variant)}
          modes={boardModes.log.map(modeLogRow)}
          counterTable={counterTable}
          turnsShown={tabOn}
          origin={menuDialogOrigin}
          onUndoTurn={(playerId, operationId) => {
            table?.undoTurn(playerId, operationId)
            setPassUndo(undefined)
          }}
          onClose={() => close("log")}
        />
      ) : null}

      {inviteSheet.shown && shownInvitation ? (
        <Sheet
          visible={inviteSheet.visible}
          onClose={() => close("invite")}
          onDismissed={inviteSheet.onDismissed}
          testID="invite-dialog"
        >
          <Text preset="subheading" tx="connected:invite.title" style={themed($dialogText)} />
          <InviteCard
            qrPayload={buildInviteQrPayload(shownInvitation.token, shownInvitation.manualCode)}
            manualCode={shownInvitation.manualCode}
            onShare={() => void shareInvite()}
          />
          {inviteError ? <AlertNote text={inviteError} /> : null}
          <Button tx="common:close" onPress={() => close("invite")} />
        </Sheet>
      ) : null}

      {overlay === "status" ? (
        <DialogCard
          visible
          onClose={() => close("status")}
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
          <ScrollView
            style={themed($sheetScroll)}
            contentContainerStyle={themed([$sheetScrollContent, $statusList])}
          >
            {view.failed.map((failure) => (
              <View
                key={failure.action.event.operationId}
                testID="connected-failed-action"
                accessibilityRole="alert"
                style={themed($failure)}
              >
                <Text
                  text={translate("connected:board.failedAction.withReason", {
                    action: failedActionLabel(failure.action.event),
                    reason: failure.reason,
                  })}
                />
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
          <Button tx="common:close" onPress={() => close("status")} />
        </DialogCard>
      ) : null}

      {overlay === "players" && !cloud ? (
        <NearbyPlayersDialog
          players={reportablePlayers}
          awayPlayerIds={awayPlayerIds}
          origin={menuDialogOrigin}
          onClose={() => close("players")}
          onRole={
            myRole
              ? () => {
                  setOverlay("role")
                }
              : undefined
          }
        />
      ) : null}

      {(overlay === "players" || overlay === "inviteAfterPlayers") && cloud ? (
        <PlayerActionsDialog
          visible={overlay === "players"}
          onDismissed={overlay === "inviteAfterPlayers" ? () => setOverlay("invite") : undefined}
          publicId={publicId}
          players={reportablePlayers}
          origin={menuDialogOrigin}
          onClose={() => close("players")}
          onRole={
            myRole
              ? () => {
                  setOverlay("role")
                }
              : undefined
          }
          onInvite={
            invitation
              ? () => {
                  setOverlay(Platform.OS === "ios" ? "inviteAfterPlayers" : "invite")
                }
              : undefined
          }
        />
      ) : null}

      <ModesDialog modes={boardModes} />
      {overlay === "role" && myRole?.role && onRevealRole ? (
        <TreacheryRoleDialog
          role={myRole.role}
          revealed={myRole.roleRevealed === true}
          canReveal={active}
          online={roleRevealOnline}
          origin={menuDialogOrigin}
          onReveal={onRevealRole}
          onClose={() => close("role")}
        />
      ) : null}

      {overlay === "match" && match ? (
        <MatchScoreDialog
          bestOf={match.bestOf}
          gameNumber={match.gameNumber}
          seats={matchSeats}
          draws={matchDraws}
          onClose={() => close("match")}
        >
          {game.isHost && onEndMatch ? (
            <Button
              testID="end-match-button"
              tx="board:matchEnd.end"
              disabled={!match.canEnd}
              accessibilityHint={translate("board:match.endHint")}
              onPress={() => {
                close("match")
                setMatchEndError(undefined)
                setMatchEnding("choosing")
              }}
            />
          ) : null}
          <Button tx="common:close" onPress={() => close("match")} />
        </MatchScoreDialog>
      ) : null}

      {matchEnding && match ? (
        <MatchEndDialog
          score={{
            bestOf: match.bestOf,
            seats: matchSeats,
            draws: matchDraws,
            lastGameDrawn: false,
          }}
          failure={matchEndError}
          busy={matchEnding === "sending"}
          onClose={() => setMatchEnding(undefined)}
          onEnd={(outcomes) => void endMatch(outcomes)}
        />
      ) : null}

      {abandonedOpen && !inviteSheet.shown ? (
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

      {overlay === "finish" ? (
        <DialogCard
          visible
          onClose={() => close("finish")}
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
            <Text size="xs" tx="connected:board.finish.subtitle" tone="dim" />
          </View>
          <ScrollView
            style={themed($sheetScroll)}
            contentContainerStyle={themed([$sheetScrollContent, $resultChoices])}
          >
            {teamChoices(named, turnGroups).map(({ id }) => {
              const player = game.players.find(({ playerId }) => playerId === id)!
              return (
                <WinnerChoice
                  key={id}
                  player={player}
                  name={teamName(named, turnGroups, id) ?? player.displayName}
                  team={teamMembers(named, turnGroups, id).flatMap(
                    (member) => game.players.find(({ playerId }) => playerId === member.id) ?? [],
                  )}
                  system={system}
                  selected={winnerPlayerIds.includes(id)}
                  onPress={() => toggleWinner(id)}
                />
              )
            })}
            <ChoiceButton
              tx="connected:board.finish.draw"
              accentColor={colors.palette.neutral400}
              Leading={({ color }) => <DrawMark color={color} />}
              selected={drawSelected}
              onPress={selectDraw}
            />
          </ScrollView>
          {view.finishError ? (
            <AlertNote testID="connected-finish-error" text={view.finishError} />
          ) : null}
          <View style={themed($dialogActions)}>
            <Button
              testID="cancel-connected-finish-button"
              tx="common:cancel"
              disabled={view.finishing}
              style={themed($dialogAction)}
              onPress={() => close("finish")}
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
              preset={finishResultSelected ? "primary" : "secondary"}
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
                  close("finish")
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
      {overlay === "leave" && leave ? (
        <ConfirmDialog
          visible
          title={translate("play:newGame.leaveGameTitle")}
          backdropAccessibilityLabel={translate("play:newGame.cancelLeaveGame")}
          message={translate("play:newGame.leaveGameMessage")}
          confirmText={translate("play:newGame.leaveGameConfirm")}
          dialogTestID="connected-leave-confirmation"
          confirmTestID="confirm-connected-leave"
          cancelTestID="cancel-connected-leave"
          busy={leaving}
          notice={
            leaveError ? <AlertNote testID="connected-leave-error" text={leaveError} /> : null
          }
          onConfirm={confirmLeave}
          onClose={() => close("leave")}
        />
      ) : null}
    </Screen>
  )
})

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  width: "100%",
  backgroundColor: colors.board.background,
})
const $board: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%", ...$tableDirection })
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
  start: spacing.md,
  end: spacing.md,
  zIndex: 20,
  elevation: 20,
  alignItems: "center",
})
const $statusToast: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  maxWidth: 420,
  minHeight: 40,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
  borderWidth: 1,
  borderColor: colors.board.border,
  borderRadius: radius.sm,
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
const $resultChoices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $dialogAction: ThemedStyle<ViewStyle> = ({ radius }) => ({
  flex: 1,
  minHeight: 48,
  borderRadius: radius.xl,
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
  outGame,
  ...grid
}: Omit<PlayerGridProps, "players" | "outState"> & {
  seats: BoardSeat[]
  outGame: ConnectedOutGame
}) {
  const lives = useContext(ConnectedLivesContext)
  const players = useMemo(
    () => seats.map((seat): GamePlayer => ({ ...seat, life: lives[seat.id] ?? 0 })),
    [lives, seats],
  )
  const table = useContext(ConnectedTableContext)
  const outState = useMemo(
    () =>
      connectedOutState(
        { ...outGame, table: table?.table },
        players.map(({ id, life }) => ({ playerId: id, life })),
      ),
    [outGame, players, table],
  )
  return <PlayerGrid {...grid} players={players} table={table} outState={outState} />
}

function WinnerChoice({
  player,
  name,
  team,
  system,
  selected,
  onPress,
}: {
  player: ConnectedBoardSeat
  name: string
  team: readonly ConnectedBoardSeat[]
  system: ConnectedBoardView["system"]
  selected: boolean
  onPress: () => void
}) {
  const lives = useContext(ConnectedLivesContext)
  const members = team.map(({ playerId }) => playerId)
  const life = teamValueLabel(
    members.map((id) => ({ id, life: lives[id] ?? 0 })),
    [members],
    members[0],
    (value) => counterValueLabel(system, value),
  )
  return (
    <ChoiceButton
      text={name}
      TextProps={{ numberOfLines: 3 }}
      detail={life.shown}
      accentColor={player.color}
      Leading={({ color }) => (
        <TeamMarks
          marks={team.map((member) => ({
            seatNumber: member.seat,
            shape: shownMarkShape(member),
            foil: member.foil,
            color: member.color,
          }))}
          color={color}
          selected={selected}
        />
      )}
      accessibilityLabel={translate(
        selected ? "connected:board.finish.winnerOption" : "connected:board.finish.playerOption",
        { name, life: life.spoken },
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
  textAlign: textEnd,
  color: colors.board.text,
})
const $statusList: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $failure: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  gap: spacing.xs,
  padding: spacing.sm,
  borderWidth: 1,
  borderColor: colors.error,
  borderRadius: radius.xl,
})

const ROLLS_SHOWN_MS = 2500

/** why: every device sees the server's roll arrive, and each shows it for a moment before the 1st chip. */
function useRollsShown(rolls: Readonly<Record<string, number>> | undefined) {
  const key = rolls ? JSON.stringify(rolls) : undefined
  const [shown, setShown] = useState<string>()
  useEffect(() => {
    if (!key) return
    setShown(key)
    const timer = setTimeout(() => setShown(undefined), ROLLS_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [key])
  return key !== undefined && shown === key
}
