import { createContext, useContext, useMemo, type ReactElement } from "react"
import { usePaginatedQuery } from "convex/react"

import type { DialogOrigin } from "@/components/DialogCard"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { GameLogDialog } from "@/features/game/GameLogDialog"
import type { GamePlayer } from "@/features/game/types"
import { translate } from "@/i18n/translate"

import {
  connectedLogEvents,
  connectedLogInputs,
  connectedLogUndo,
  logPositions,
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

export type ConnectedLogFeed = (props: {
  publicId: string
  children: (feed: ConnectedLogFeedState) => ReactElement
}) => ReactElement | null

export const ConnectedLogContext = createContext<
  | {
      pending: readonly PendingLifeAction[]
      lives: Readonly<Record<string, number>>
      undoLife: ConnectedGameRuntime["undoLife"]
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
  const events = useMemo(() => [...results].reverse(), [results])
  return children({
    events,
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
  turnsShown,
  anyoneEdits,
  origin,
  onUndoTurn,
  onClose,
}: {
  publicId: string
  Feed: ConnectedLogFeed
  seats: readonly Seat[]
  turn?: Turn
  groups?: TurnGroups
  turnsShown: boolean
  anyoneEdits?: boolean
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
          turnsShown={turnsShown}
          anyoneEdits={anyoneEdits}
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
  turnsShown,
  anyoneEdits,
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
    () => connectedLogEvents(feed.events, pending, publicId, anyoneEdits),
    [anyoneEdits, feed.events, pending, publicId],
  )
  const inputs = useMemo(() => connectedLogInputs(events, publicId, turn), [events, publicId, turn])
  const positionOf = useMemo(() => logPositions(events), [events])
  const undo = connectedLogUndo(events, players, publicId, turn, { turns: turnsShown })
  return (
    <GameLogDialog
      players={players}
      events={inputs.events}
      turns={turnsShown ? inputs.turns : undefined}
      groups={groups}
      canUndo={undo !== undefined}
      undoLabel={translate("board:log.undoMine")}
      origin={origin}
      onMore={feed.more}
      positionOf={positionOf}
      onUndo={() => {
        if (undo?.kind === "turn") onUndoTurn(undo.playerId, undo.turnOperationId)
        else if (undo) context?.undoLife(undo.changes)
      }}
      onClose={onClose}
    />
  )
}
