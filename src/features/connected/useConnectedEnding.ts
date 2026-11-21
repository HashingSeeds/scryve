import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { connectedStandingWinners, type ConnectedBoardView } from "@/features/connected/boardView"
import type { ConnectedGameRuntime } from "@/features/connected/useConnectedGame"
import { teamMembers } from "@/features/game/teams"
import { reportTurnsGame } from "@/features/game/TurnDialog"
import type { MatchSeatOutcome } from "@/features/game/types"
import type { TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
import { convexErrorMessage } from "@/utils/convexError"

import type { Turn, TurnGroups } from "../../../convex/lib/turns"

export type EndMatch = (seats: { seat: number; outcome: MatchSeatOutcome }[]) => Promise<unknown>

export const FINISH_BLOCKERS = {
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

export type FinishBlocker = (typeof FINISH_BLOCKERS)[keyof typeof FINISH_BLOCKERS]

export function finishBlockerFor(runtime: ConnectedGameRuntime): FinishBlocker | undefined {
  return runtime.connectionStatus === "offline"
    ? FINISH_BLOCKERS.offline
    : runtime.pending.length > 0
      ? FINISH_BLOCKERS.sending
      : runtime.failed.length > 0
        ? FINISH_BLOCKERS.rejected
        : undefined
}

type EndingOverlay = "status" | "match" | "finish" | "leave"

export function useConnectedEnding({
  publicId,
  game,
  controls,
  overlay,
  named,
  turnGroups,
  turnsReport,
  matchSeats,
  onGameEnded,
  onRematch,
  onGameAbandoned,
  onBack,
  onLeave,
  onEndMatch,
}: {
  publicId: string
  game: ConnectedBoardView
  controls: Pick<ConnectedGameRuntime, "finish" | "abandon"> & {
    current: () => ConnectedGameRuntime
  }
  overlay: { open: (shown: EndingOverlay) => void; close: (shown: EndingOverlay) => void }
  named: readonly { id: string; name: string }[]
  turnGroups: TurnGroups | undefined
  turnsReport: { turnsEnabled: boolean; turn: Pick<Turn, "number"> | undefined }
  matchSeats: readonly { seat: number }[]
  onGameEnded?: (publicId: string) => void
  onRematch?: (rematchPublicId: string) => void
  onGameAbandoned?: () => void
  onBack?: () => void
  onLeave?: () => unknown
  onEndMatch?: EndMatch
}) {
  const { open, close } = overlay
  const [winnerPlayerIds, setWinnerPlayerIds] = useState<string[]>([])
  const [drawSelected, setDrawSelected] = useState(false)
  const finishSubmitInFlight = useRef(false)
  const navigatedTerminal = useRef(false)
  const [abandonedOpen, setAbandonedOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string>()
  const [matchEnding, setMatchEnding] = useState<"choosing" | "sending">()
  const [matchEndError, setMatchEndError] = useState<string>()

  const terminalStatus = game.status
  const rematchPublicId = game.rematchPublicId
  const playerCount = game.players.length
  const { turnsEnabled, turn } = turnsReport
  const endedTurn = useRef(turn)
  useLayoutEffect(() => {
    endedTurn.current = turn
  })
  const leaveFinished = useCallback(() => {
    if (rematchPublicId && onRematch) onRematch(rematchPublicId)
    else onGameEnded?.(publicId)
  }, [rematchPublicId, onRematch, onGameEnded, publicId])
  useEffect(() => {
    if (terminalStatus === "finished") {
      if (navigatedTerminal.current) return
      navigatedTerminal.current = true
      reportTurnsGame({ turnsEnabled, turn: endedTurn.current, playerCount, mode: "connected" })
      leaveFinished()
    } else if (terminalStatus === "abandoned" && !navigatedTerminal.current) {
      setAbandonedOpen(true)
    }
  }, [terminalStatus, leaveFinished, turnsEnabled, playerCount])

  const resultSelected = winnerPlayerIds.length > 0 || drawSelected
  const finish = {
    winnerPlayerIds,
    drawSelected,
    resultSelected,
    open: () => {
      const runtime = controls.current()
      if (finishBlockerFor(runtime)) return open("status")
      const projection = runtime.status === "ready" ? runtime.projection : undefined
      const outcome = projection?.treacheryOutcome
      const standing = projection && !outcome ? connectedStandingWinners(projection) : undefined
      setDrawSelected(outcome?.kind === "draw")
      setWinnerPlayerIds(outcome?.kind === "win" ? outcome.winnerPlayerIds : (standing ?? []))
      open("finish")
    },
    toggleWinner: (playerId: string) => {
      setDrawSelected(false)
      const team = teamMembers(named, turnGroups, playerId).map(({ id }) => id)
      setWinnerPlayerIds((current) =>
        current.includes(playerId)
          ? current.filter((id) => !team.includes(id))
          : [...current, ...team],
      )
    },
    toggleDraw: () => {
      setWinnerPlayerIds([])
      setDrawSelected((current) => !current)
    },
    submit: async () => {
      if (finishSubmitInFlight.current) return
      finishSubmitInFlight.current = true
      try {
        const withResult = resultSelected
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
    },
  }

  const guestLeave = !game.isHost ? onLeave : undefined
  const leave = guestLeave && {
    busy: leaving,
    error: leaveError,
    open: () => {
      setLeaveError(undefined)
      open("leave")
    },
    confirm: async () => {
      if (leaving) return
      setLeaving(true)
      setLeaveError(undefined)
      // why: success navigates off the board, so the dialog stays busy instead of offering a second leave.
      try {
        await guestLeave()
      } catch (cause) {
        setLeaveError(
          convexErrorMessage(
            cause,
            cause instanceof Error ? cause.message : translate("connected:host.exitFailed"),
          ),
        )
        setLeaving(false)
      }
    },
  }

  const matchEnd = {
    shown: matchEnding !== undefined,
    sending: matchEnding === "sending",
    error: matchEndError,
    open: () => {
      close("match")
      setMatchEndError(undefined)
      setMatchEnding("choosing")
    },
    dismiss: () => setMatchEnding(undefined),
    end: async (outcomes: MatchSeatOutcome[]) => {
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
    },
  }

  const abandoned = {
    shown: abandonedOpen,
    dismiss: () => setAbandonedOpen(false),
    leave: () => {
      setAbandonedOpen(false)
      if (onGameAbandoned) onGameAbandoned()
      else onBack?.()
    },
  }

  return { finish, leave, matchEnd, abandoned }
}
