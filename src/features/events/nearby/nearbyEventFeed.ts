import { hubStandings, hubView, type HubEvent, type HubTable } from "./hubEvent"
import type { NearbyPatchMessage, NearbyViewMessage } from "./nearbyEventProtocol"
import type { PlayerStanding } from "../../../../convex/lib/events/model"
import { standingsThroughRound } from "../eventLogic"
import type { EventView } from "../eventSource"

interface Feed {
  readonly seq: number
  readonly view: EventView
  readonly standings: readonly PlayerStanding[]
}

export interface HostFeed extends Feed {
  readonly event: HubEvent
  readonly scored: readonly HubTable[]
}

type Item = { readonly id: string }

function listPatch<T extends Item>(before: readonly T[], after: readonly T[]) {
  const was = new Map(before.map((item) => [item.id, JSON.stringify(item)]))
  const kept = new Set(after.map((item) => item.id))
  const set = after.filter((item) => was.get(item.id) !== JSON.stringify(item))
  const gone = before.filter((item) => !kept.has(item.id)).map((item) => item.id)
  return set.length > 0 || gone.length > 0 ? { set, gone } : undefined
}

function applyList<T extends Item>(
  items: readonly T[],
  patch: { readonly set: readonly T[]; readonly gone: readonly string[] },
) {
  const gone = new Set(patch.gone)
  const changed = new Map(patch.set.map((item) => [item.id, item]))
  const known = new Set(items.map((item) => item.id))
  return [
    ...items.filter((item) => !gone.has(item.id)).map((item) => changed.get(item.id) ?? item),
    ...patch.set.filter((item) => !known.has(item.id)),
  ]
}

const sameItems = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item, index) => item === b[index])

const NO_STANDINGS: readonly PlayerStanding[] = []

function standingsFor(
  previous: HostFeed | undefined,
  event: HubEvent,
  through: number,
  scored: readonly HubTable[],
) {
  // why: each check-in grows a list of zero-point rows that screens hide until round 1 is in, and resending it to every guest came to about 94 MB while 124 players joined.
  if (through === 0) return NO_STANDINGS
  if (previous?.event.players === event.players && sameItems(previous.scored, scored))
    return previous.standings
  const standings = hubStandings(event, through)
  // why: confirming a result already counted rebuilds equal standings, which would resend about 17 KB to every guest.
  return previous && JSON.stringify(standings) === JSON.stringify(previous.standings)
    ? previous.standings
    : standings
}

export function nextHostFeed(
  previous: HostFeed | undefined,
  event: HubEvent,
): { feed: HostFeed; patch?: NearbyPatchMessage } {
  if (previous?.event === event) return { feed: previous }
  const view = hubView(event, { organizer: false, playerId: null })
  const through = standingsThroughRound(view)
  const scored = event.tables.filter((table) => table.round <= through)
  const standings = standingsFor(previous, event, through, scored)
  const feed = { event, scored, view, standings, seq: (previous?.seq ?? 0) + 1 }
  if (!previous) return { feed }
  const { players, tables, isOrganizer: _, myPlayerId: __, ...fields } = view
  return {
    feed,
    patch: {
      t: "patch",
      seq: feed.seq,
      view: fields,
      players: listPatch(previous.view.players, players),
      tables: listPatch(previous.view.tables, tables),
      standings: standings === previous.standings ? undefined : standings,
    },
  }
}

export const guestViewMessage = (feed: Feed, playerId: string): NearbyViewMessage => ({
  t: "view",
  seq: feed.seq,
  view: { ...feed.view, myPlayerId: playerId },
  standings: feed.standings,
})

export function applyHostMessage(
  feed: Feed | undefined,
  message: NearbyViewMessage | NearbyPatchMessage,
): Feed | undefined {
  if (message.t === "view")
    return { seq: message.seq ?? 0, view: message.view, standings: message.standings }
  if (!feed || message.seq !== feed.seq + 1) return undefined
  return {
    seq: message.seq,
    view: {
      ...feed.view,
      ...message.view,
      players: message.players ? applyList(feed.view.players, message.players) : feed.view.players,
      tables: message.tables
        ? applyList(feed.view.tables, message.tables).sort((a, b) => a.table - b.table)
        : feed.view.tables,
    },
    standings: message.standings ?? feed.standings,
  }
}
