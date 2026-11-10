import { useMemo, useState } from "react"

import { randomIndex } from "@/features/game/dice"

import { modeLogText } from "./modeCards"
import type { ModeCard } from "../../../convex/lib/modeDecks"
import {
  faceUpPlane,
  mayRoll,
  PLANAR_DIE,
  planarCards,
  rollCost,
  schemeCards,
  type ModeAction,
  type ModeLogEntry,
  type PlanarFace,
  type TableModes,
} from "../../../convex/lib/tableModes"
import { turnGroupOf, type Turn, type TurnGroups } from "../../../convex/lib/turns"

export interface BoardModesInput {
  modes: TableModes | undefined
  turn: Turn | undefined
  groups: TurnGroups | undefined
  players: readonly { id: string; name: string }[]
  controls: (playerId: string) => boolean
  act: (action: ModeAction) => boolean
  turnsOn: boolean
}

export interface PlanarDie {
  cost: number
  canRoll: boolean
  roll: () => void
}

export interface PlanarView extends PlanarDie {
  card?: ModeCard
  phenomenon: boolean
  roller?: string
  dieFor: (seat: string) => PlanarDie
  lastRoll?: { face: PlanarFace; at: number }
  walk: () => void
  reset: () => void
  manualReset: boolean
}

export interface SchemeView {
  archenemyId: string
  ownCards: boolean
  due: boolean
  mine: boolean
  ongoing: { index: number; card: ModeCard }[]
  shown?: ModeCard
  reveal: () => void
  abandon: (index: number) => void
}

export interface ModeLogRow {
  key: string
  text: string
  at: number
  entry: ModeLogEntry
}

export type ModeDialog = "planar" | "scheme"

export function useBoardModes({
  modes,
  turn,
  groups,
  players,
  controls,
  act,
  turnsOn,
}: BoardModesInput) {
  const [dialog, setDialog] = useState<ModeDialog>()
  const [opener, setOpener] = useState<string>()
  const planechase = modes?.planechase
  const archenemy = modes?.archenemy
  const nameOf = useMemo(() => {
    const names = new Map(players.map(({ id, name }) => [id, name]))
    return (playerId: string) => names.get(playerId) ?? ""
  }, [players])
  const cards = useMemo(
    () => ({ planar: planarCards(planechase?.decks), scheme: schemeCards(archenemy?.deck) }),
    [planechase?.decks, archenemy?.deck],
  )

  const roller = players.find(({ id }) => controls(id) && mayRoll(turn, groups, id))?.id
  const actor = roller ?? players.find(({ id }) => controls(id))?.id
  const dialogSeat =
    opener !== undefined && controls(opener) && mayRoll(turn, groups, opener) ? opener : roller
  const log = modes?.log ?? []
  const lastRolled = [...log].reverse().find((entry) => entry.kind === "rolled")

  const phenomenon = faceUpPlane(planechase)?.kind === "phenomenon"
  const dieFor = (seat: string | undefined): PlanarDie => ({
    cost: planechase && seat ? rollCost(planechase, turn, seat) : 0,
    canRoll: !!seat && controls(seat) && mayRoll(turn, groups, seat) && !phenomenon,
    roll: () => {
      if (seat) act({ kind: "planar.rolled", playerId: seat, face: PLANAR_DIE[randomIndex(6)] })
    },
  })
  const planar: PlanarView | undefined = planechase
    ? {
        ...dieFor(roller ?? lastRolled?.playerId),
        card: faceUpPlane(planechase),
        phenomenon,
        roller,
        dieFor,
        lastRoll: lastRolled?.face ? { face: lastRolled.face, at: lastRolled.at } : undefined,
        walk: () => {
          if (actor) act({ kind: "planar.walked", playerId: actor })
        },
        reset: () => {
          if (actor) act({ kind: "planar.reset", playerId: actor })
        },
        manualReset: !turn || !turnsOn,
      }
    : undefined

  const scheme: SchemeView | undefined = archenemy
    ? {
        archenemyId: archenemy.playerId,
        ownCards: !archenemy.deck,
        due:
          !!turn && turn.playerId === archenemy.playerId && archenemy.revealedTurn !== turn.number,
        mine: controls(archenemy.playerId),
        ongoing: (archenemy.ongoing ?? []).flatMap((index) => {
          const card = cards.scheme[index]
          return card ? [{ index, card }] : []
        }),
        shown: archenemy.shown === undefined ? undefined : cards.scheme[archenemy.shown],
        reveal: () => act({ kind: "scheme.revealed", playerId: archenemy.playerId }),
        abandon: (card) => act({ kind: "scheme.abandoned", playerId: archenemy.playerId, card }),
      }
    : undefined

  const rows: ModeLogRow[] = log
    .map((entry, index) => ({
      key: `${entry.at}-${index}`,
      text: modeLogText(entry, nameOf, cards),
      at: entry.at,
      entry,
    }))
    .reverse()

  return {
    planar,
    scheme,
    activeGroup: turn ? turnGroupOf(groups, turn.playerId) : [],
    log: rows,
    nameOf,
    dialog,
    dialogSeat,
    openDialog: (next: ModeDialog | undefined, seat?: string) => {
      setDialog(next)
      setOpener(seat)
    },
  }
}

export type BoardModes = ReturnType<typeof useBoardModes>
