import { useEffect, useState } from "react"

import type { ConnectedBoardView } from "@/features/connected/boardView"
import {
  MULLIGAN_RULE,
  mulliganStep,
  systemDice,
  type DiceSeatView,
  type MulliganAction,
} from "@/features/game/dice"
import { firstPlayerFlips } from "@/features/game/FirstPlayerChoice"

import { maxMulligans, mulliganHandSize } from "../../../convex/lib/mulligans"
import type { SystemId } from "../../../convex/lib/systems"
import { isTeamVariant } from "../../../convex/lib/teamVariants"

export interface PregameActions {
  rollFirst: () => void
  chooseFirst: (playerId: string) => void
  keepHand: (seat: number, mulligans: number) => void
}

export function useConnectedPregame({
  publicId,
  game,
  controlled,
  actions,
  onRules,
}: {
  publicId: string
  game: ConnectedBoardView
  controlled: ReadonlySet<string>
  actions?: PregameActions
  onRules?: (system: SystemId, ruleId?: string) => void
}) {
  const { system, firstPlayer } = game
  const handSize = mulliganHandSize(system)
  const firstPlayerId = firstPlayer?.playerId
  const pregameOpen = game.status === "active" && !game.played && actions !== undefined
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

  function seatFor(playerId: string): DiceSeatView | undefined {
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
    if (chooser)
      return chooser.playerId === playerId && controlled.has(playerId)
        ? { kind: "choice", reason: chooser.reason }
        : undefined
    if (playerId !== mulliganSeat?.playerId || mulligan.skipped || !game.freeMulligans) return
    return handSize === undefined
      ? undefined
      : mulliganStep(mulligan.taken, game.freeMulligans, handSize, mulligan.help)
  }

  return {
    seatFor,
    pressOffer: firstPlayerOffer
      ? (playerId: string) =>
          firstPlayerOffer.kind === "rollOffer"
            ? actions?.rollFirst()
            : actions?.chooseFirst(playerId)
      : undefined,
    choose: chooser
      ? (playerId: string, order: "first" | "second") => {
          const index = seatsInOrder.findIndex((seat) => seat.playerId === playerId)
          const next = seatsInOrder[(index + 1) % seatsInOrder.length]
          actions?.chooseFirst(order === "first" ? playerId : (next?.playerId ?? playerId))
        }
      : undefined,
    mulligan: (action: MulliganAction) => {
      if (action === "keep")
        return mulliganSeat && actions?.keepHand(mulliganSeat.seat, mulligan.taken)
      if (action === "rule") return system && onRules?.(system, MULLIGAN_RULE)
      setMulliganDraft({
        ...mulligan,
        ...(action === "mulligan" && handSize !== undefined && game.freeMulligans
          ? { taken: Math.min(maxMulligans(game.freeMulligans, handSize), mulligan.taken + 1) }
          : {}),
        ...(action === "skip" ? { skipped: true } : {}),
        ...(action === "help" || action === "close" ? { help: action === "help" } : {}),
      })
    },
    showsFirstChip: (playerId: string) => pregameOpen && playerId === firstPlayerId && !rollsShown,
    choosingFirst: Boolean(firstPlayerOffer || chooser),
  }
}

const ROLLS_SHOWN_MS = 2500

function useRollsShown(rolls: Readonly<Record<string, number>> | undefined) {
  const key = rolls ? JSON.stringify(rolls) : undefined
  const [expired, setExpired] = useState<string>()
  useEffect(() => {
    if (!key) {
      setExpired(undefined)
      return
    }
    const timer = setTimeout(() => setExpired(key), ROLLS_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [key])
  return key !== undefined && expired !== key
}
