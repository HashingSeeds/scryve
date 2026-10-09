import type { DurableStringStorage } from "@/features/sync/durableOutbox"

export const utf8Bytes = (value: string) => Buffer.byteLength(value, "utf8")

export class MemoryStorage implements DurableStringStorage {
  readonly entries = new Map<string, string>()

  getString(key: string) {
    return this.entries.get(key)
  }

  getAllKeys() {
    return [...this.entries.keys()]
  }

  set(key: string, value: string) {
    this.entries.set(key, value)
  }

  delete(key: string) {
    this.entries.delete(key)
  }

  clone() {
    const copy = new MemoryStorage()
    for (const [key, value] of this.entries) copy.entries.set(key, value)
    return copy
  }

  totalBytes(filter: (key: string) => boolean = () => true) {
    let bytes = 0
    for (const [key, value] of this.entries)
      if (filter(key)) bytes += utf8Bytes(key) + utf8Bytes(value)
    return bytes
  }
}

export class SimulatedKill extends Error {
  constructor(readonly call: number) {
    super(`simulated app kill at write ${call}`)
  }
}

export class SimulatedWriteError extends Error {
  constructor(readonly call: number) {
    super(`simulated storage error at write ${call}`)
  }
}

/**
 * why: kill: the Nth write and every later one never land (app killed mid-write).
 * throw: the Nth write throws and is not applied, later writes land (quota or I/O error).
 */
export type FaultMode = "kill" | "throw"

export interface Fault {
  mode: FaultMode
  atWrite: number
}

export class FaultyStorage implements DurableStringStorage {
  writes = 0
  dead = false

  constructor(
    private readonly inner: DurableStringStorage,
    private readonly fault?: Fault,
  ) {}

  getString(key: string) {
    if (this.dead) throw new SimulatedKill(this.writes)
    return this.inner.getString(key)
  }

  getAllKeys() {
    if (this.dead) throw new SimulatedKill(this.writes)
    return this.inner.getAllKeys()
  }

  set(key: string, value: string) {
    this.write(() => this.inner.set(key, value))
  }

  delete(key: string) {
    this.write(() => this.inner.delete(key))
  }

  private write(apply: () => void) {
    if (this.dead) throw new SimulatedKill(this.writes)
    const call = this.writes
    this.writes += 1
    if (this.fault?.atWrite === call) {
      if (this.fault.mode === "kill") {
        this.dead = true
        throw new SimulatedKill(call)
      }
      throw new SimulatedWriteError(call)
    }
    apply()
  }
}

/** why: mulberry32: small, fast, and good enough to make every run replayable from its seed. */
export function seededRandom(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (maximum: number) => Math.floor(next() * maximum),
    pick: <T>(items: readonly T[]): T | undefined =>
      items.length ? items[Math.floor(next() * items.length)] : undefined,
    id: (length = 24) => {
      const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
      let value = ""
      for (let index = 0; index < length; index += 1) value += alphabet[Math.floor(next() * 36)]
      return value
    },
  }
}

export type Random = ReturnType<typeof seededRandom>
