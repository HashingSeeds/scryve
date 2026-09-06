import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import type { CloudAccess } from "@/features/auth/CloudScreen"
import { convexErrorMessage } from "@/utils/convexError"

import { acknowledgeGuestDeckImport, loadGuestDeck, useGuestDeck } from "./guestDeck"
import { api } from "../../../convex/_generated/api"

export function useGuestDeckImport(access?: CloudAccess) {
  const guestDeck = useGuestDeck()
  const importGuest = useMutation(api.decks.importGuest)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<FunctionReturnType<typeof api.decks.importGuest>>()
  const latestAccess = useRef(access)
  latestAccess.current = access
  const attempted = useRef<string | undefined>(undefined)
  const running = useRef(false)
  const ownerId = access?.ownerId
  const ready = access?.ready

  const retry = useCallback(async () => {
    const currentAccess = latestAccess.current
    const deck = loadGuestDeck()
    if (!currentAccess?.ready || !currentAccess.ownerId || !deck || running.current) return
    const owner = currentAccess.ownerId
    running.current = true
    attempted.current = `${owner}:${deck.localId}:${deck.updatedAt}`
    setImporting(true)
    setError(undefined)
    setResult(undefined)
    try {
      const response = await importGuest({
        ...deck.deck,
        localId: deck.localId,
        localUpdatedAt: deck.updatedAt,
      })
      if (latestAccess.current?.ownerId !== owner || !latestAccess.current?.ready) return
      setResult(response)
      if (response.status !== "limit_reached") {
        const removed = acknowledgeGuestDeckImport(deck.localId, response.localUpdatedAt)
        if (!removed && loadGuestDeck())
          setError("Your local deck has newer edits. It is still saved on this device.")
      }
    } catch (cause) {
      if (latestAccess.current?.ownerId === owner)
        setError(convexErrorMessage(cause, "Could not sync your deck. It is saved on this device."))
    } finally {
      running.current = false
      setImporting(false)
    }
  }, [importGuest])

  useEffect(() => {
    setResult(undefined)
    setError(undefined)
  }, [ownerId])

  useEffect(() => {
    if (!ready || !ownerId || !guestDeck || importing) return
    const key = `${ownerId}:${guestDeck.localId}:${guestDeck.updatedAt}`
    if (attempted.current !== key) void retry()
  }, [guestDeck, importing, ownerId, ready, retry])

  return { guestDeck, importing, result, error, retry }
}
