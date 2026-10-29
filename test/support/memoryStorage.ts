import type { DurableStringStorage } from "@/features/sync/durableOutbox"

export class MemoryStorage implements DurableStringStorage {
  values = new Map<string, string>()

  getString(key: string) {
    return this.values.get(key)
  }

  getAllKeys() {
    return [...this.values.keys()]
  }

  set(key: string, value: string) {
    this.values.set(key, value)
  }

  delete(key: string) {
    this.values.delete(key)
  }
}
