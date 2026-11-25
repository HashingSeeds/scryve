import { storage } from "@/utils/storage"

import { localCardDb } from "./localDb"

export interface CardKvStorage {
  getString(key: string): string | undefined
  set(key: string, value: string): void
  remove(key: string): void
  getAllKeys(): string[]
  addOnValueChangedListener(listener: (key: string) => void): { remove: () => void }
}

const listeners = new Set<(key: string) => void>()

function emitChange(key: string) {
  for (const listener of listeners) listener(key)
}

export const cardKvStorage: CardKvStorage = {
  getString(key) {
    const existing = localCardDb.getKv(key)
    if (existing !== undefined) return existing
    if (localCardDb.sharesLegacyStorage) return undefined
    const legacy = storage.getString(key)
    if (legacy === undefined) return undefined
    try {
      localCardDb.setKv(key, legacy)
      storage.remove(key)
    } catch {}
    return legacy
  },

  set(key, value) {
    localCardDb.setKv(key, value)
    if (!localCardDb.sharesLegacyStorage) {
      try {
        storage.remove(key)
      } catch {}
    }
    emitChange(key)
  },

  remove(key) {
    localCardDb.deleteKv(key)
    if (!localCardDb.sharesLegacyStorage) {
      try {
        storage.remove(key)
      } catch {}
    }
    emitChange(key)
  },

  getAllKeys() {
    const keys = new Set(localCardDb.getAllKvKeys())
    try {
      for (const key of storage.getAllKeys()) keys.add(key)
    } catch {}
    return [...keys]
  },

  addOnValueChangedListener(listener) {
    listeners.add(listener)
    return {
      remove: () => {
        listeners.delete(listener)
      },
    }
  },
}
