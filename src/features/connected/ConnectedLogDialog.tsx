import { createContext, useContext, useMemo, type ReactElement } from "react"
import { usePaginatedQuery } from "convex/react"

import type { DialogOrigin } from "@/components/DialogCard"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { GameLogDialog } from "@/features/game/GameLogDialog"
import type { GameModeRow } from "@/features/game/LifeLog"
import type { GamePlayer } from "@/features/game/types"
import { translate } from "@/i18n/translate"

import {
  connectedLogEvents,
  connectedLogInputs,
  connectedLogUndo,
  type CounterTable,
} from "./connectedLog"
import type { PendingLifeAction } from "./model"
import type { ConnectedGameRuntime } from "./useConnectedRuntime"
import { api } from "../../../convex/_generated/api"
import type { ConnectedLogEvent } from "../../../convex/lib/gameLog"
import { CONNECTED_EVENT_PAGE_MAX_ITEMS } from "../../../convex/lib/pagination"
import type { Turn, TurnGroups } from "../../../convex/lib/turns"

export interface ConnectedLogFeedState {
  events: readonly ConnectedLogEvent[]
  more?: () => void
}

/** why: Convex pages the log and a nearby host sends it on request, so each authority brings its own feed. */
export type ConnectedLogFeed = (props: {
  publicId: string
  children: (feed: ConnectedLogFeedState) => ReactElement
}) => ReactElement | null

/** why: unsent changes and lives move on every tap, so only the open log reads them, not the memoized board. */
export const ConnectedLogContext = createContext<
  | {
      pending: readonly PendingLifeAction[]
      lives: Readonly<Record<string, number>>
      undoLife: ConnectedGameRuntime["undoLife"]
      undoTable: ConnectedGameRuntime["undoTable"]
    }
  | undefined
>(undefined)

const NO_EVENTS: readonly ConnectedLogEvent[] = []
const NO_PENDING: readonly PendingLifeAction[] = []

export const CloudLogFeed: ConnectedLogFeed = ({ publicId, children }) => (
  <ConvexQueryBoundary resetKey={publicId} fallback={() => children({ events: NO_EVENTS })}>
    <CloudLogPages publicId={publicId}>{children}</CloudLogPages>
  </ConvexQueryBoundary>
)

const CloudLogPages: ConnectedLogFeed = ({ publicId, children }) => {
  const { results, status, loadMore } = usePaginatedQuery(
    api.games.connectedEvents,
    { publicId },
    { initialNumItems: CONNECTED_EVENT_PAGE_MAX_ITEMS },
  )
  return children({
    events: results,
    more: status === "CanLoadMore" ? () => loadMore(CONNECTED_EVENT_PAGE_MAX_ITEMS) : undefined,
  })
}

type Seat = Pick<GamePlayer, "id" | "name" | "color" | "shape">

export function ConnectedLogDialog({
  publicId,
  Feed,
  seats,
  turn,
  groups,
  sharedLife,
  counterTable,
  modes,
  turnsShown,
  origin,
  onUndoTurn,
  onClose,
}: {
  publicId: string
  Feed: ConnectedLogFeed
  seats: readonly Seat[]
  turn?: Turn
  groups?: TurnGroups
  sharedLife?: boolean
  counterTable?: CounterTable
  modes?: readonly GameModeRow[]
  turnsShown: boolean
  origin?: DialogOrigin
  onUndoTurn: (playerId: string, turnOperationId: string) => void
  onClose: () => void
}) {
  return (
    <Feed publicId={publicId}>
      {(feed) => (
        <ConnectedLog
          publicId={publicId}
          feed={feed}
          seats={seats}
          turn={turn}
          groups={groups}
          sharedLife={sharedLife}
          counterTable={counterTable}
          modes={modes}
          turnsShown={turnsShown}
          origin={origin}
          onUndoTurn={onUndoTurn}
          onClose={onClose}
        />
      )}
    </Feed>
  )
}

function ConnectedLog({
  publicId,
  feed,
  seats,
  turn,
  groups,
  sharedLife,
  counterTable,
  modes,
  turnsShown,
  origin,
  onUndoTurn,
  onClose,
}: Omit<Parameters<typeof ConnectedLogDialog>[0], "Feed"> & { feed: ConnectedLogFeedState }) {
  const context = useContext(ConnectedLogContext)
  const pending = context?.pending ?? NO_PENDING
  const lives = context?.lives
  const players = useMemo(
    () => seats.map((seat) => ({ ...seat, life: lives?.[seat.id] ?? 0 })),
    [lives, seats],
  )
  const events = useMemo(
    () => connectedLogEvents(feed.events, pending, publicId),
    [feed.events, pending, publicId],
  )
  const inputs = useMemo(
    () => connectedLogInputs(events, publicId, turn, counterTable),
    [counterTable, events, publicId, turn],
  )
  const undo = connectedLogUndo(events, players, publicId, turn, {
    turns: turnsShown,
    table: counterTable,
  })
  return (
    <GameLogDialog
      players={players}
      events={inputs.events}
      turns={turnsShown ? inputs.turns : undefined}
      groups={groups}
      sharedLife={sharedLife}
      counters={inputs.counters}
      modes={modes}
      canUndo={undo !== undefined}
      undoLabel={translate("board:log.undoMine")}
      origin={origin}
      onMore={feed.more}
      onUndo={() => {
        if (undo?.kind === "turn") onUndoTurn(undo.playerId, undo.turnOperationId)
        else if (undo?.kind === "counter") context?.undoTable(undo.changes)
        else if (undo) context?.undoLife(undo.changes)
      }}
      onClose={onClose}
    />
  )
}
