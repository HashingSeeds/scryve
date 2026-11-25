import { useSyncExternalStore } from "react"
import { randomUUID } from "expo-crypto"

import { localCardDb } from "@/storage/localDb"
import type { BinderKind, StoredBinder, StoredCollectionEntry } from "@/storage/localDbTypes"
import { onStorageClear } from "@/utils/storage"

import { catalogVersion, valueCollectionEntries, type ValuedCollectionEntry } from "./catalogSync"

export type { BinderKind, StoredBinder, StoredCollectionEntry }

const listeners = new Set<() => void>()
let revision = 0

function notify() {
  revision += 1
  for (const listener of listeners) listener()
}

// why: clearing storage empties the collection tables without a write here, so shelves and valuedCollection kept showing the old cards.
onStorageClear(notify)

export function subscribeCollection(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useCollectionRevision(): number {
  return useSyncExternalStore(
    subscribeCollection,
    () => revision,
    () => revision,
  )
}

export function listBinders(kind?: BinderKind): StoredBinder[] {
  return localCardDb.listBinders(kind)
}

export function createBinder(input: {
  kind: BinderKind
  name: string
  game?: string
  defaultSetCode?: string
  now?: number
}): StoredBinder {
  const now = input.now ?? Date.now()
  const binder: StoredBinder = {
    id: randomUUID(),
    kind: input.kind,
    name: input.name.trim(),
    ...(input.game ? { game: input.game } : {}),
    ...(input.defaultSetCode ? { defaultSetCode: input.defaultSetCode.toLowerCase() } : {}),
    createdAt: now,
    updatedAt: now,
  }
  localCardDb.upsertBinder(binder)
  notify()
  return binder
}

export function renameBinder(id: string, name: string, now = Date.now()): StoredBinder | undefined {
  const existing = localCardDb.listBinders().find((binder) => binder.id === id)
  if (!existing) return undefined
  const updated: StoredBinder = { ...existing, name: name.trim(), updatedAt: now }
  localCardDb.upsertBinder(updated)
  notify()
  return updated
}

export function deleteBinder(id: string): void {
  localCardDb.deleteBinder(id)
  notify()
}

export function deleteBinderKeepingCards(id: string, now = Date.now()): void {
  localCardDb.transaction(() => {
    const entries = localCardDb.listCollectionEntries({ binderId: id })
    for (const entry of entries) {
      localCardDb.upsertCollectionEntry({
        ...entry,
        binderId: undefined,
        updatedAt: now,
      })
    }
    localCardDb.deleteBinder(id)
  })
  notify()
}

export interface AddCollectionCardInput {
  game: string
  cardId: string
  printingId: string
  name: string
  setCode: string
  collectorNumber: string
  finish?: string
  condition?: string
  language?: string
  edition?: string
  quantity?: number
  binderId?: string
  acquiredCents?: number
  notes?: string
  imageUrl?: string
  smallImageUrl?: string
  now?: number
}

export function addCollectionCard(input: AddCollectionCardInput): StoredCollectionEntry {
  const now = input.now ?? Date.now()
  const finish = input.finish ?? "nonfoil"
  const condition = input.condition ?? "NM"
  const language = input.language ?? "en"
  const qty = Math.max(1, Math.floor(input.quantity ?? 1))
  const existing = localCardDb
    .listCollectionEntries({
      game: input.game,
      binderId: input.binderId === undefined ? null : input.binderId,
      cardId: input.cardId,
    })
    .find(
      (entry) =>
        entry.printingId === input.printingId &&
        entry.finish === finish &&
        entry.condition === condition &&
        entry.language === language &&
        (entry.edition ?? "") === (input.edition ?? "") &&
        (entry.acquiredCents ?? null) === (input.acquiredCents ?? null) &&
        (entry.notes ?? "") === (input.notes ?? ""),
    )

  const entry: StoredCollectionEntry = existing
    ? {
        ...existing,
        quantity: existing.quantity + qty,
        ...(input.imageUrl && !existing.imageUrl ? { imageUrl: input.imageUrl } : {}),
        ...(input.smallImageUrl && !existing.smallImageUrl
          ? { smallImageUrl: input.smallImageUrl }
          : {}),
        updatedAt: now,
      }
    : {
        id: randomUUID(),
        game: input.game,
        cardId: input.cardId,
        printingId: input.printingId,
        name: input.name,
        setCode: input.setCode.toLowerCase(),
        collectorNumber: input.collectorNumber.toLowerCase(),
        finish,
        condition,
        language,
        ...(input.edition ? { edition: input.edition } : {}),
        quantity: qty,
        ...(input.binderId ? { binderId: input.binderId } : {}),
        ...(input.acquiredCents !== undefined ? { acquiredCents: input.acquiredCents } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        ...(input.smallImageUrl ? { smallImageUrl: input.smallImageUrl } : {}),
        createdAt: now,
        updatedAt: now,
      }

  localCardDb.transaction(() => {
    localCardDb.upsertCollectionEntry(entry)
    if (input.binderId) {
      const binder = localCardDb.listBinders().find((candidate) => candidate.id === input.binderId)
      if (binder) localCardDb.upsertBinder({ ...binder, updatedAt: now })
    }
  })
  notify()
  return entry
}

export function updateCollectionEntry(
  id: string,
  patch: Partial<
    Pick<
      StoredCollectionEntry,
      | "cardId"
      | "printingId"
      | "setCode"
      | "collectorNumber"
      | "finish"
      | "condition"
      | "language"
      | "quantity"
      | "binderId"
      | "acquiredCents"
      | "notes"
      | "imageUrl"
      | "smallImageUrl"
    >
  >,
  now = Date.now(),
): StoredCollectionEntry | undefined {
  const current = localCardDb.listCollectionEntries().find((entry) => entry.id === id)
  if (!current) return undefined
  if (patch.quantity !== undefined && patch.quantity <= 0) {
    localCardDb.deleteCollectionEntry(id, now)
    notify()
    return undefined
  }
  const updated: StoredCollectionEntry = {
    ...current,
    ...patch,
    ...(patch.setCode !== undefined ? { setCode: patch.setCode.toLowerCase() } : {}),
    ...(patch.collectorNumber !== undefined
      ? { collectorNumber: patch.collectorNumber.toLowerCase() }
      : {}),
    updatedAt: now,
  }
  localCardDb.upsertCollectionEntry(updated)
  notify()
  return updated
}

export function removeCollectionEntry(id: string, now = Date.now()): void {
  localCardDb.deleteCollectionEntry(id, now)
  notify()
}

export function moveBinderEntries(
  sourceBinderId: string,
  targetBinderId: string | undefined,
  now = Date.now(),
): number {
  const entries = localCardDb.listCollectionEntries({ binderId: sourceBinderId })
  if (entries.length === 0) return 0
  localCardDb.transaction(() => {
    for (const entry of entries) {
      const moved: StoredCollectionEntry = {
        ...entry,
        ...(targetBinderId ? { binderId: targetBinderId } : { binderId: undefined }),
        updatedAt: now,
      }
      localCardDb.upsertCollectionEntry(moved)
    }
    if (targetBinderId) {
      const target = localCardDb.listBinders().find((binder) => binder.id === targetBinderId)
      if (target) localCardDb.upsertBinder({ ...target, updatedAt: now })
    }
  })
  notify()
  return entries.length
}

export function listCollectionEntries(filter?: {
  game?: string
  binderId?: string | null
  cardId?: string
}): StoredCollectionEntry[] {
  return localCardDb.listCollectionEntries(filter)
}

let valuedCache:
  | {
      game: string
      revision: number
      catalogVersion: number
      items: ValuedCollectionEntry<StoredCollectionEntry>[]
    }
  | undefined

// why: DecksScreen remounts the shelf on every segment switch; without this one-slot cache each remount re-listed and re-valued the whole collection.
export function valuedCollection(game: string): ValuedCollectionEntry<StoredCollectionEntry>[] {
  const version = catalogVersion(game)
  if (
    valuedCache?.game === game &&
    valuedCache.revision === revision &&
    valuedCache.catalogVersion === version
  ) {
    return valuedCache.items
  }
  const items = valueCollectionEntries(game, localCardDb.listCollectionEntries({ game })).items
  valuedCache = { game, revision, catalogVersion: version, items }
  return items
}

export function ownedQuantitiesByCardId(game: string, cardIds: readonly string[]) {
  return localCardDb.ownedQuantitiesByCardId(game, cardIds)
}
