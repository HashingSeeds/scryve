import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { randomUUID } from "expo-crypto"
import { type ConvexReactClient, useConvex, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { ConvexError } from "convex/values"

import { translate } from "@/i18n/translate"
import { captureAnalytics } from "@/utils/analytics"
import { convexErrorCode } from "@/utils/convexError"
import { ErrorType, reportCrash } from "@/utils/crashReporting"

import { deckVersionLabel } from "./deckCopy"
import { getDeckSyncController, isDeckSyncEnabled, type DeckSyncSnapshot } from "./decksSync"
import { useDeckMetadataWrites } from "./decksSyncWrites"
import { useDeckVersionWrites } from "./decksVersionWrites"
import {
  acknowledgeGuestDeckImport,
  deleteGuestDeck,
  guestDeckBringing,
  guestDeckRouteId,
  guestDeckVersions,
  loadGuestDeck,
  saveGuestDeck,
  useGuestDecks,
  type GuestDeck,
  type GuestDeckPayload,
  type NewGuestDeckVersion,
} from "./guestDeck"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export type DeckHome = "account" | "device"

const SAVE_TO_ACCOUNT_WAIT_MS = 5000

export type LocalDeckSyncResult =
  | { status: "synced"; deckId: Id<"decks"> }
  | { status: "limit_reached" }
  | { status: "version_limit"; versions: number; limit: number; premium: boolean }
  | { status: "conflict" }
  | { status: "other_account"; addAsNew: () => Promise<LocalDeckSyncResult> }
  | { status: "kept_newer_edits" }

type DeckSyncAction = "sync" | "move_to_device" | "add_as_new"

const syncOutcomes = {
  synced: "ok",
  conflict: "conflict",
  limit_reached: "limit",
  version_limit: "limit",
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

type AccountCards = FunctionReturnType<typeof api.decks.readVersion>["cards"]

function deviceCards(cards: AccountCards) {
  return cards.map(({ _id, _creationTime, deckVersionId: _version, ...card }) => card)
}

function deviceDeckPayload({ deck, cards }: FunctionReturnType<typeof api.decks.detail>) {
  return {
    name: deck.name,
    format: deck.format,
    game: deck.game,
    ...(deck.note ? { note: deck.note } : {}),
    cards: deviceCards(cards),
  }
}

// why: one detail read lists the versions, and moveToDevice checks each against it, so a version edited mid-read fails the move instead of arriving stale.
async function accountCopy(convex: ConvexReactClient, deckId: Id<"decks">) {
  const detail = await convex.query(api.decks.detail, { deckId })
  const latestId = detail.version?._id
  const versions: NewGuestDeckVersion[] = await Promise.all(
    detail.versions.map(async (version) => ({
      number: version.versionNumber,
      name: deckVersionLabel(version, version.versionNumber),
      ...(version.note ? { note: version.note } : {}),
      cards:
        version._id === latestId
          ? deviceCards(detail.cards)
          : deviceCards(
              (await convex.query(api.decks.readVersion, { deckId, versionId: version._id })).cards,
            ),
    })),
  )
  const bringing = detail.versions.find(
    (version) => version._id === detail.deck.bringingVersionId,
  )?.versionNumber
  return { detail, payload: deviceDeckPayload(detail), versions, bringing }
}

function listsOf(versions: readonly NewGuestDeckVersion[]) {
  return JSON.stringify(versions.map(({ name, note, cards }) => ({ name, note, cards })))
}

function sameAsAccount(local: GuestDeck, account: Awaited<ReturnType<typeof accountCopy>>) {
  return (
    JSON.stringify(local.deck) === JSON.stringify(account.payload) &&
    (account.versions.length === 0 ||
      listsOf(guestDeckVersions(local)) === listsOf(account.versions))
  )
}

function importedVersions(local: GuestDeck) {
  return local.versions
    ? {
        versions: guestDeckVersions(local).map(({ name, note, cards }) => ({
          name,
          ...(note ? { note } : {}),
          cards,
        })),
      }
    : {}
}

export function versionLimitMessage({
  versions,
  limit,
  premium,
}: Omit<Extract<LocalDeckSyncResult, { status: "version_limit" }>, "status">) {
  return premium
    ? translate("decks:localSync.version_limit")
    : translate("decks:localSync.versionLimit", { versions, limit, remove: versions - limit })
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
  const setBringing = useMutation(api.decks.setBringingVersion)
  // why: importGuest has no pick, so a device deck bringing an older version points the new account deck at the same position.
  const carryBringing = useCallback(
    async (deckId: Id<"decks">, local: GuestDeck) => {
      const position = guestDeckVersions(local).findIndex(
        (version) => version.number === guestDeckBringing(local),
      )
      if (!local.versions || position === local.versions.length - 1) return
      const { versions } = await convex.query(api.decks.detail, { deckId })
      const versionId = versions[position]?._id
      if (versionId) await setBringing({ deckId, versionId })
    },
    [convex, setBringing],
  )
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
              ...importedVersions(local),
              ...(local.movedFromAccount ? { movedFromAccount: true } : {}),
              deckKey: local.deckKey ?? local.localId,
              localId: local.guestLocalId ?? localId,
              localUpdatedAt: local.updatedAt,
            })
            if (response.status === "limit_reached") return { status: "limit_reached" }
            if (response.status === "version_limit")
              return {
                status: "version_limit",
                versions: response.capacity.used,
                limit: response.capacity.limit,
                premium: response.capacity.premium,
              }
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
                      ...importedVersions(local),
                      deckKey: newId,
                      localId: newId,
                      localUpdatedAt: local.updatedAt,
                    })
                    if (imported.status === "limit_reached") return { status: "limit_reached" }
                    if (imported.status === "version_limit")
                      return {
                        status: "version_limit",
                        versions: imported.capacity.used,
                        limit: imported.capacity.limit,
                        premium: imported.capacity.premium,
                      }
                    if (imported.status === "other_account") return { status: "conflict" }
                    // why: a retry would add a second copy, so a failed pick leaves the new deck bringing its latest version.
                    await carryBringing(imported.deckId, local).catch(() => undefined)
                    return { status: "synced", deckId: imported.deckId }
                  }),
              }
            }
            let receipt = response.localUpdatedAt
            if (local.movedFromAccount && receipt === null) {
              if (sameAsAccount(local, await accountCopy(convex, response.deckId)))
                receipt = local.updatedAt
            }
            // why: the device copy is the only record of the pick, so it is applied before the copy is dropped and a failure leaves the copy to retry.
            if (receipt === local.updatedAt) await carryBringing(response.deckId, local)
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
    [carryBringing, convex, importGuest],
  )

  const keepOnDevice = useCallback(
    (deckId: Id<"decks">) =>
      observeDeckSync("move_to_device", async () => {
        if (!ownerId) throw new Error("Sign in to move a synced deck to this device")
        const account = await accountCopy(convex, deckId)
        const { detail } = account
        const { deck: server } = detail
        const deckKey = server.deckKey
        const existing = localDecks.find((local) => (local.deckKey ?? local.localId) === deckKey)
        if (existing && !sameAsAccount(existing, account))
          throw new ConvexError({
            code: "sync_conflict",
            message: "Deck changed on another device",
          })
        const draft =
          existing ??
          saveGuestDeck(account.payload, {
            deckKey,
            guestLocalId: server.guestLocalId,
            movedFromAccount: true,
            now: server.guestUpdatedAt,
            versions: account.versions,
            bringing: account.bringing,
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
            expectedVersions: detail.versions.map((version) => ({
              id: version._id,
              updatedAt: version.updatedAt,
            })),
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
