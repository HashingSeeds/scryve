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
import type { Turn, TurnGroups } from "../../../convex/lib/turns"

export interface BoardModesInput {
  modes: TableModes | undefined
  turn: Turn | undefined
  groups: TurnGroups | undefined
  players: readonly { id: string; name: string }[]
  controls: (playerId: string) => boolean
  act: (action: ModeAction) => boolean
}

export interface PlanarView {
  card?: ModeCard
  phenomenon: boolean
  cost: number
  roller?: string
  activeId?: string
  lastRoll?: { face: PlanarFace; at: number }
  roll: () => void
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

/** why: local and connected boards read the same modes, so seat control is the only thing that differs between them. */
export function useBoardModes({ modes, turn, groups, players, controls, act }: BoardModesInput) {
  const [dialog, setDialog] = useState<ModeDialog>()
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
  const log = modes?.log ?? []
  const lastRolled = [...log].reverse().find((entry) => entry.kind === "rolled")

  const planar: PlanarView | undefined = planechase
    ? {
        card: faceUpPlane(planechase),
        phenomenon: faceUpPlane(planechase)?.kind === "phenomenon",
        cost: rollCost(planechase, turn, roller ?? turn?.playerId ?? ""),
        roller,
        activeId: turn?.playerId,
        lastRoll: lastRolled?.face ? { face: lastRolled.face, at: lastRolled.at } : undefined,
        roll: () => {
          if (roller)
            act({ kind: "planar.rolled", playerId: roller, face: PLANAR_DIE[randomIndex(6)] })
        },
        walk: () => {
          if (actor) act({ kind: "planar.walked", playerId: actor })
        },
        reset: () => {
          if (actor) act({ kind: "planar.reset", playerId: actor })
        },
        manualReset: !turn,
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
    activeId: turn?.playerId,
    log: rows,
    nameOf,
    dialog,
    openDialog: setDialog,
  }
}

export type BoardModes = ReturnType<typeof useBoardModes>
