import { useEffect, useState } from "react"
import * as Crypto from "expo-crypto"

import { keyStore } from "./keyStore"

let loading: Promise<string> | undefined
let known: string | undefined
const listeners = new Set<(key: string) => void>()

export function newFeedbackKey() {
  return Array.from(Crypto.getRandomBytes(32), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  )
}

export function loadFeedbackKey() {
  loading ??= (async () => {
    const existing = await keyStore.read()
    const key = existing ?? newFeedbackKey()
    if (!existing) await keyStore.write(key)
    known = key
    for (const listener of listeners) listener(key)
    return key
  })().catch((cause: unknown) => {
    loading = undefined
    throw cause
  })
  return loading
}

export function useFeedbackKey({ create = true }: { create?: boolean } = {}) {
  const [key, setKey] = useState(known)
  useEffect(() => {
    let mounted = true
    const update = (loaded: string | null) => {
      if (mounted && loaded) setKey(loaded)
    }
    listeners.add(update)
    const load = create ? loadFeedbackKey() : keyStore.read()
    load.then(update, () => undefined)
    return () => {
      mounted = false
      listeners.delete(update)
    }
  }, [create])
  return key
}
