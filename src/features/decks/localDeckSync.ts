import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { randomUUID } from "expo-crypto"
import { useConvex, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { ConvexError } from "convex/values"

import { translate } from "@/i18n/translate"
import { captureAnalytics } from "@/utils/analytics"
import { convexErrorCode } from "@/utils/convexError"
import { ErrorType, reportCrash } from "@/utils/crashReporting"

import { getDeckSyncController, isDeckSyncEnabled, type DeckSyncSnapshot } from "./decksSync"
import { useDeckMetadataWrites } from "./decksSyncWrites"
import { useDeckVersionWrites } from "./decksVersionWrites"
import {
  acknowledgeGuestDeckImport,
  deleteGuestDeck,
  guestDeckRouteId,
  loadGuestDeck,
  saveGuestDeck,
  useGuestDecks,
  type GuestDeckPayload,
} from "./guestDeck"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export type DeckHome = "account" | "device"

const SAVE_TO_ACCOUNT_WAIT_MS = 5000

export type LocalDeckSyncResult =
  | { status: "synced"; deckId: Id<"decks"> }
  | { status: "limit_reached" }
  | { status: "conflict" }
  | { status: "other_account"; addAsNew: () => Promise<LocalDeckSyncResult> }
  | { status: "kept_newer_edits" }

type DeckSyncAction = "sync" | "move_to_device" | "add_as_new"

const syncOutcomes = {
  synced: "ok",
  conflict: "conflict",
  limit_reached: "limit",
  other_account: "other_account",
  kept_newer_edits: "kept_newer_edits",
} as const

function reportSyncFailure(action: DeckSyncAction, code: string) {
  const error = new Error("Device deck operation failed")
  error.name = "LocalDeckSyncFailed"
  reportCrash(error, ErrorType.HANDLED, {
    tags: { action, code },
    fingerprint: ["local-deck-sync-failed", action],
  })
}

async function observeDeckSync<Result extends LocalDeckSyncResult | string>(
  action: DeckSyncAction,
  operation: () => Promise<Result>,
  automatic = false,
): Promise<Result> {
  try {
    const result = await operation()
    if (!automatic)
      captureAnalytics("deck_sync", {
        action,
        outcome: typeof result === "string" ? "ok" : syncOutcomes[result.status],
      })
    return result
  } catch (cause) {
    const code = convexErrorCode(cause)
    const outcome =
      code === "sync_conflict" || code === "conflict"
        ? "conflict"
        : code === "deck_limit_reached" || code === "limit_reached"
          ? "limit"
          : code === "other_account"
            ? "other_account"
            : "failed"
    const networkFailure =
      !(cause instanceof ConvexError) &&
      cause instanceof Error &&
      /offline|network|connection|failed to fetch|load failed|socket|timeout|timed out|aborted|interrupted/i.test(
        cause.message,
      )
    const expected = networkFailure || code === "unauthenticated" || code === "rate_limited"
    if (outcome === "failed" && !expected) reportSyncFailure(action, code ?? "unknown")
    if (!automatic) captureAnalytics("deck_sync", { action, outcome })
    throw cause
  }
}

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
    (localId: string, { automatic = false }: { automatic?: boolean } = {}) =>
      observeDeckSync<LocalDeckSyncResult>(
        "sync",
        async () => {
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
            if (response.status === "limit_reached" || response.status === "version_limit")
              return { status: "limit_reached" }
            if (response.status === "other_account") {
              const newId = randomUUID()
              return {
                status: "other_account",
                addAsNew: () =>
                  observeDeckSync<LocalDeckSyncResult>("add_as_new", async () => {
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
                    if (imported.status === "limit_reached" || imported.status === "version_limit")
                      return { status: "limit_reached" }
                    if (imported.status === "other_account") return { status: "conflict" }
                    return { status: "synced", deckId: imported.deckId }
                  }),
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
            if (code === "deck_archived" || code === "deck_key_conflict")
              reportSyncFailure("sync", code)
            if (
              code === "sync_conflict" ||
              code === "deck_archived" ||
              code === "deck_key_conflict"
            )
              return { status: "conflict" }
            throw cause
          } finally {
            setSyncing(localId, false)
          }
        },
        automatic,
      ),
    [convex, importGuest],
  )

  const keepOnDevice = useCallback(
    (deckId: Id<"decks">) =>
      observeDeckSync("move_to_device", async () => {
        if (!ownerId) throw new Error("Sign in to move a synced deck to this device")
        const detail = await convex.query(api.decks.detail, { deckId })
        const { deck: server } = detail
        const deckKey = server.deckKey
        const existing = localDecks.find((local) => (local.deckKey ?? local.localId) === deckKey)
        const copy = deviceDeckPayload(detail)
        if (existing && JSON.stringify(existing.deck) !== JSON.stringify(copy))
          throw new ConvexError({
            code: "sync_conflict",
            message: "Deck changed on another device",
          })
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
      }),
    [convex, localDecks, ownerId, moveToDevice],
  )

  return { sync, keepOnDevice }
}

// why: the deck lands on this device first, so a failed account save (full, offline, conflict) still keeps it.
export function useSaveNewDeck(ownerId: string | undefined) {
  const { sync } = useLocalDeckSync(ownerId)
  return useCallback(
    async (payload: GuestDeckPayload, home: DeckHome) => {
      const { localId } = saveGuestDeck(payload)
      if (home === "account" && ownerId) {
        // why: Convex holds a mutation through a dropped connection, so an unbounded wait would freeze the save; the sync keeps running and the device deck screen waits on it.
        const result = await Promise.race([
          sync(localId).catch(() => undefined),
          new Promise<undefined>((resolve) => setTimeout(resolve, SAVE_TO_ACCOUNT_WAIT_MS)),
        ])
        if (result?.status === "synced") return result.deckId
      }
      return guestDeckRouteId(localId)
    },
    [ownerId, sync],
  )
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
  const reported = useRef(new Set<string>())
  const [failed, setFailed] = useState(new Set<string>())
  const moving = useSyncExternalStore(
    subscribeSyncing,
    () => syncingLocalIds,
    () => syncingLocalIds,
  )
  const leftovers = useMemo(() => {
    const liveKeys = new Set(metadata.filter((deck) => !deck.deleted).map((deck) => deck.deckKey))
    return locals.filter((local) => liveKeys.has(local.deckKey ?? local.localId))
  }, [locals, metadata])
  useEffect(() => {
    if (!ready || loading || unavailable) return
    for (const local of leftovers) {
      const attempt = `${ownerId}:${local.localId}:${local.updatedAt}`
      if (moving.has(local.localId) || attempted.current.has(attempt)) continue
      attempted.current.add(attempt)
      void sync(local.localId, { automatic: true }).then(
        (result) => {
          if (result.status === "kept_newer_edits" && !reported.current.has(attempt)) {
            reported.current.add(attempt)
            const error = new Error("Device deck reconciliation kept newer edits")
            error.name = "LocalDeckReconcileKeptNewerEdits"
            reportCrash(error, ErrorType.HANDLED, {
              tags: { status: result.status },
              fingerprint: ["local-deck-reconcile-kept-newer-edits"],
            })
          }
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
