import { createMMKV } from "react-native-mmkv"

export const storage = createMMKV()

export function loadString(key: string): string | null {
  try {
    return storage.getString(key) ?? null
  } catch {
    return null
  }
}

export function saveString(key: string, value: string): boolean {
  try {
    storage.set(key, value)
    return true
  } catch {
    return false
  }
}

export function load(key: string): unknown {
  let almostThere: string | null = null
  try {
    almostThere = loadString(key)
    return JSON.parse(almostThere ?? "")
  } catch {
    return almostThere
  }
}

export function save(key: string, value: unknown): boolean {
  try {
    return saveString(key, JSON.stringify(value))
  } catch {
    return false
  }
}

export function remove(key: string): void {
  try {
    storage.remove(key)
  } catch {}
}

const clearListeners = new Set<() => void>()

export function onStorageClear(listener: () => void): () => void {
  clearListeners.add(listener)
  return () => clearListeners.delete(listener)
}

export function clear(): void {
  try {
    storage.clearAll()
  } catch {}
  for (const listener of clearListeners) {
    try {
      listener()
    } catch {}
  }
}
