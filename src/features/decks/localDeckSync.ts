import { useCallback, useMemo, useSyncExternalStore } from "react"
import { useConvex, useMutation } from "convex/react"
import { ConvexError } from "convex/values"

import { convexErrorCode } from "@/utils/convexError"

import { isDeckSyncEnabled } from "./decksSync"
import { useDeckMetadataWrites } from "./decksSyncWrites"
import { useDeckVersionWrites } from "./decksVersionWrites"
import {
  acknowledgeGuestDeckImport,
  deleteGuestDeck,
  loadGuestDeck,
  loadGuestDecks,
  saveGuestDeck,
  type GuestDeck,
} from "./guestDeck"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export type LocalDeckSyncResult =
  | { status: "synced"; deckId: Id<"decks"> }
  | { status: "limit_reached" }
  | { status: "conflict" }
  | { status: "kept_newer_edits" }

// why: local decks are device-wide, so another account signed in here must import the deck instead of resyncing a row it does not own.
export function syncsBackFor(local: GuestDeck, ownerId: string | undefined) {
  return local.unsynced !== undefined && local.unsynced.ownerId === ownerId
}

let syncingLocalIds: ReadonlySet<string> = new Set()
const syncingListeners = new Set<() => void>()

function setSyncing(localId: string, syncing: boolean) {
  const next = new Set(syncingLocalIds)
  if (syncing) next.add(localId)
  else next.delete(localId)
  syncingLocalIds = next
  syncingListeners.forEach((listener) => listener())
}

function subscribeSyncing(listener: () => void) {
  syncingListeners.add(listener)
  return () => syncingListeners.delete(listener)
}

// why: a deck screen reopened while its sync runs must not save edits the server will never receive.
export function useLocalDeckSyncing(localId: string) {
  return useSyncExternalStore(
    subscribeSyncing,
    () => syncingLocalIds.has(localId),
    () => syncingLocalIds.has(localId),
  )
}

export function useLocalDeckSync(ownerId: string | undefined) {
  const convex = useConvex()
  const importGuest = useMutation(api.decks.importGuest)
  const resync = useMutation(api.decks.resync)
  const unsyncDeck = useMutation(api.decks.unsync)

  const unsyncOnServer = useCallback(
    async (deckId: Id<"decks">) => {
      if (!ownerId) throw new Error("Sign in to move a synced deck to this device")
      const { deckId: _, expectedRevision, versionId, ...copy } = await unsyncDeck({ deckId })
      return {
        copy,
        origin: { deckId, ownerId, expectedRevision, ...(versionId ? { versionId } : {}) },
      }
    },
    [ownerId, unsyncDeck],
  )

  const sync = useCallback(
    async (localId: string): Promise<LocalDeckSyncResult> => {
      const local = loadGuestDeck(localId)
      if (!local) return { status: "conflict" }
      setSyncing(localId, true)
      try {
        if (!syncsBackFor(local, ownerId) || !local.unsynced) {
          const response = await importGuest({
            ...local.deck,
            localId,
            localUpdatedAt: local.updatedAt,
          })
          if (response.status === "limit_reached") return { status: "limit_reached" }
          if (
            acknowledgeGuestDeckImport(localId, response.localUpdatedAt) ||
            !loadGuestDeck(localId)
          )
            return { status: "synced", deckId: response.deckId }
          return { status: "kept_newer_edits" }
        }
        const { deckId } = await resync({ ...local.deck, ...local.unsynced })
        const latest = loadGuestDeck(localId)
        if (latest && latest.updatedAt !== local.updatedAt) return { status: "kept_newer_edits" }
        if (latest) deleteGuestDeck(localId)
        return { status: "synced", deckId }
      } catch (cause) {
        const code = convexErrorCode(cause)
        if (code === "deck_limit_reached") return { status: "limit_reached" }
        if (code === "sync_conflict" || code === "deck_archived") return { status: "conflict" }
        throw cause
      } finally {
        setSyncing(localId, false)
      }
    },
    [importGuest, ownerId, resync],
  )

  const unsync = useCallback(
    async (deckId: Id<"decks">) => {
      if (!ownerId) throw new Error("Sign in to move a synced deck to this device")
      const detail = await convex.query(api.decks.detail, { deckId })
      const { deck: server, version } = detail
      // why: the copy is saved on this device before the server stops syncing, so a failed save loses nothing.
      const draft = saveGuestDeck(
        {
          name: server.name,
          format: server.format,
          game: server.game,
          ...(server.note ? { note: server.note } : {}),
          cards: detail.cards.map(
            ({ _id, _creationTime, deckVersionId: _version, ...card }) => card,
          ),
        },
        {
          unsynced: {
            deckId,
            ownerId,
            expectedRevision: (server.syncRevision ?? 0) + 1,
            ...(version ? { versionId: version._id } : {}),
          },
        },
      )
      let result: Awaited<ReturnType<typeof unsyncOnServer>>
      try {
        result = await unsyncOnServer(deckId)
      } catch (cause) {
        // why: a lost response may hide a committed unsync, so the draft stays unless the server refused.
        if (cause instanceof ConvexError) deleteGuestDeck(draft.localId)
        throw cause
      }
      const retried = loadGuestDecks().find(
        (local) =>
          local.localId !== draft.localId &&
          local.unsynced?.deckId === deckId &&
          local.unsynced.expectedRevision === result.origin.expectedRevision,
      )
      if (retried) {
        deleteGuestDeck(draft.localId)
        return retried.localId
      }
      saveGuestDeck(result.copy, { localId: draft.localId, unsynced: result.origin })
      return draft.localId
    },
    [convex, ownerId, unsyncOnServer],
  )

  return { sync, unsync }
}

// why: unsyncing snapshots the server copy, so a deck with edits still queued on this device would lose them.
export function useDecksWithQueuedEdits(ownerId: string | undefined, ready: boolean) {
  const syncEnabled = useMemo(() => isDeckSyncEnabled(), [])
  const metadata = useDeckMetadataWrites(syncEnabled, ownerId, ready)
  const versions = useDeckVersionWrites(syncEnabled, ownerId, ready)
  return useMemo(
    () =>
      new Set<string>([
        ...metadata.pending.map((write) => write.deckId),
        ...metadata.failures.map((failure) => failure.action.deckId),
        ...versions.pending.map((write) => write.deckId),
        ...versions.failures.map((failure) => failure.action.deckId),
      ]),
    [metadata.pending, metadata.failures, versions.pending, versions.failures],
  )
}
