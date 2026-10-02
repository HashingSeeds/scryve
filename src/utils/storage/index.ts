import { MMKV } from "react-native-mmkv"

export const storage = new MMKV()

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
    storage.delete(key)
  } catch {}
}

export function clear(): void {
  try {
    storage.clearAll()
  } catch {}
}
