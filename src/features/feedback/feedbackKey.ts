import { useEffect, useState } from "react"
import * as Crypto from "expo-crypto"

import { keyStore } from "./keyStore"

let loading: Promise<string> | undefined

export function newFeedbackKey() {
  return Array.from(Crypto.getRandomBytes(32), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  )
}

export function loadFeedbackKey() {
  loading ??= (async () => {
    const existing = await keyStore.read()
    if (existing) return existing
    const created = newFeedbackKey()
    await keyStore.write(created)
    return created
  })().catch((cause: unknown) => {
    loading = undefined
    throw cause
  })
  return loading
}

export function useFeedbackKey() {
  const [key, setKey] = useState<string>()
  useEffect(() => {
    let mounted = true
    loadFeedbackKey().then(
      (loaded) => mounted && setKey(loaded),
      () => undefined,
    )
    return () => {
      mounted = false
    }
  }, [])
  return key
}
