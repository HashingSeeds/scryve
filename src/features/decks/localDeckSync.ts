import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { randomUUID } from "expo-crypto"
import { useConvex, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { ConvexError } from "convex/values"

import { translate } from "@/i18n/translate"
import { convexErrorCode } from "@/utils/convexError"

import { getDeckSyncController, isDeckSyncEnabled, type DeckSyncSnapshot } from "./decksSync"
import { useDeckMetadataWrites } from "./decksSyncWrites"
import { useDeckVersionWrites } from "./decksVersionWrites"
import {
  acknowledgeGuestDeckImport,
  deleteGuestDeck,
  loadGuestDeck,
  saveGuestDeck,
  useGuestDecks,
} from "./guestDeck"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export type LocalDeckSyncResult =
  | { status: "synced"; deckId: Id<"decks"> }
  | { status: "limit_reached" }
  | { status: "conflict" }
  | { status: "other_account"; addAsNew: () => Promise<LocalDeckSyncResult> }
  | { status: "kept_newer_edits" }

function deviceDeckPayload({ deck, cards }: FunctionReturnType<typeof api.decks.detail>) {
  return {
    name: deck.name,
    format: deck.format,
    game: deck.game,
    ...(deck.note ? { note: deck.note } : {}),
    cards: cards.map(({ _id, _creationTime, deckVersionId: _version, ...card }) => card),
  }
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
  const localDecks = useGuestDecks()
  const importGuest = useMutation(api.decks.importGuest)
  const moveToDevice = useMutation(api.decks.moveToDevice)
  const sync = useCallback(
    async (localId: string): Promise<LocalDeckSyncResult> => {
      const local = loadGuestDeck(localId)
      if (!local) return { status: "conflict" }
      setSyncing(localId, true)
      try {
        const response = await importGuest({
          name: local.deck.name,
          format: local.deck.format,
          game: local.deck.game,
          note: local.deck.note,
          cards: local.deck.cards,
          ...(local.movedFromAccount ? { movedFromAccount: true } : {}),
          deckKey: local.deckKey ?? local.localId,
          localId: local.guestLocalId ?? localId,
          localUpdatedAt: local.updatedAt,
        })
        if (response.status === "limit_reached") return { status: "limit_reached" }
        if (response.status === "other_account") {
          const newId = randomUUID()
          return {
            status: "other_account",
            addAsNew: async () => {
              const imported = await importGuest({
                name: local.deck.name,
                format: local.deck.format,
                game: local.deck.game,
                note: local.deck.note,
                cards: local.deck.cards,
                deckKey: newId,
                localId: newId,
                localUpdatedAt: local.updatedAt,
              })
              if (imported.status === "limit_reached") return { status: "limit_reached" }
              if (imported.status === "other_account") return { status: "conflict" }
              return { status: "synced", deckId: imported.deckId }
            },
          }
        }
        let receipt = response.localUpdatedAt
        if (local.movedFromAccount && receipt === null) {
          const detail = await convex.query(api.decks.detail, { deckId: response.deckId })
          if (JSON.stringify(deviceDeckPayload(detail)) === JSON.stringify(local.deck))
            receipt = local.updatedAt
        }
        if (acknowledgeGuestDeckImport(localId, receipt) || !loadGuestDeck(localId))
          return { status: "synced", deckId: response.deckId }
        return { status: "kept_newer_edits" }
      } catch (cause) {
        const code = convexErrorCode(cause)
        if (code === "deck_limit_reached") return { status: "limit_reached" }
        if (code === "sync_conflict" || code === "deck_archived" || code === "deck_key_conflict")
          return { status: "conflict" }
        throw cause
      } finally {
        setSyncing(localId, false)
      }
    },
    [convex, importGuest],
  )

  const keepOnDevice = useCallback(
    async (deckId: Id<"decks">) => {
      if (!ownerId) throw new Error("Sign in to move a synced deck to this device")
      const detail = await convex.query(api.decks.detail, { deckId })
      const { deck: server } = detail
      const deckKey = server.deckKey ?? server.syncId ?? String(server._id)
      const existing = localDecks.find((local) => (local.deckKey ?? local.localId) === deckKey)
      const copy = deviceDeckPayload(detail)
      if (existing && JSON.stringify(existing.deck) !== JSON.stringify(copy))
        throw new ConvexError({ code: "sync_conflict", message: "Deck changed on another device" })
      const draft =
        existing ??
        saveGuestDeck(copy, {
          deckKey,
          guestLocalId: server.guestLocalId,
          movedFromAccount: true,
          now: server.guestUpdatedAt,
        })
      setSyncing(draft.localId, true)
      try {
        const removed = await moveToDevice({
          deckId,
          expectedRevision: server.syncRevision ?? 0,
          expectedVersion: detail.version
            ? {
                id: detail.version._id,
                updatedAt: detail.version.updatedAt ?? detail.version.createdAt,
              }
            : null,
        })
        getDeckSyncController(convex, ownerId).acceptMetadata([removed])
      } catch (cause) {
        // why: a lost reply may hide a committed move; only a server refusal can discard the copy.
        if (!existing && cause instanceof ConvexError) deleteGuestDeck(draft.localId)
        if (convexErrorCode(cause) === "sync_conflict")
          throw new ConvexError({
            code: "sync_conflict",
            message: translate("decks:deckLimit.moveConflict"),
          })
        throw cause
      } finally {
        setSyncing(draft.localId, false)
      }
      return draft.localId
    },
    [convex, localDecks, ownerId, moveToDevice],
  )

  return { sync, keepOnDevice }
}

// why: moving snapshots the server copy, so a deck with edits still queued on this device would lose them.
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

export function useLocalDeckLeftovers(
  {
    metadata,
    loading,
    unavailable,
  }: Pick<DeckSyncSnapshot, "metadata" | "loading" | "unavailable">,
  ownerId: string | undefined,
  ready: boolean,
) {
  const locals = useGuestDecks()
  const { sync } = useLocalDeckSync(ownerId)
  const attempted = useRef(new Set<string>())
  const [failed, setFailed] = useState(new Set<string>())
  const moving = useSyncExternalStore(
    subscribeSyncing,
    () => syncingLocalIds,
    () => syncingLocalIds,
  )
  const leftovers = useMemo(() => {
    const liveKeys = new Set(
      metadata.filter((deck) => !deck.deleted).map((deck) => deck.deckKey ?? deck.id),
    )
    return locals.filter((local) => liveKeys.has(local.deckKey ?? local.localId))
  }, [locals, metadata])
  useEffect(() => {
    if (!ready || loading || unavailable) return
    for (const local of leftovers) {
      const attempt = `${ownerId}:${local.localId}:${local.updatedAt}`
      if (moving.has(local.localId) || attempted.current.has(attempt)) continue
      attempted.current.add(attempt)
      void sync(local.localId).then(
        (result) => {
          if (result.status !== "synced") setFailed((previous) => new Set(previous).add(attempt))
        },
        () => setFailed((previous) => new Set(previous).add(attempt)),
      )
    }
  }, [leftovers, moving, ownerId, ready, loading, unavailable, sync, failed])
  return {
    localIds: new Set(
      leftovers
        .filter((local) => {
          const attempt = `${ownerId}:${local.localId}:${local.updatedAt}`
          return (
            moving.has(local.localId) || (attempted.current.has(attempt) && !failed.has(attempt))
          )
        })
        .map((local) => local.localId),
    ),
    error: failed.size > 0,
    retry: () => {
      attempted.current.clear()
      setFailed(new Set())
    },
  }
}
