import { useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { AUTH_LOAD_TIMEOUT_MS } from "@/features/auth/authLoadTimeout"

import {
  type ConnectedGameRepository,
  getResumeIndexRevision,
  hasAnyResumeGame,
  loadNewestResumeGame,
  subscribeResumeIndex,
} from "./persistence"

function useResumeRevision() {
  return useSyncExternalStore(subscribeResumeIndex, getResumeIndexRevision, getResumeIndexRevision)
}

export function useResumeGames(repository: ConnectedGameRepository) {
  const revision = useResumeRevision()
  return useMemo(() => ({ revision, games: repository.loadResumeIndex() }), [repository, revision])
    .games
}

function useRestoreGaveUp(restoring: boolean) {
  const [gaveUp, setGaveUp] = useState(false)
  useEffect(() => {
    if (!restoring) return
    const timer = setTimeout(() => setGaveUp(true), AUTH_LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [restoring])
  return gaveUp
}

// why: `undefined` means Clerk is still restoring a device with saved games and no session hint, so wait rather than flash local play.
export function useNewestResumeGame(): ReturnType<typeof loadNewestResumeGame> | undefined {
  const revision = useResumeRevision()
  const { isLoaded, isSignedIn, userId, sessionHint } = useAuthAccess()
  const unknownAccount = (!isLoaded || (isSignedIn && !userId)) && !sessionHint
  const gaveUp = useRestoreGaveUp(unknownAccount)
  const waiting = unknownAccount && !gaveUp
  const ownerId = isSignedIn ? userId : (sessionHint?.userId ?? undefined)
  return useMemo(() => {
    if (waiting) return { revision, game: hasAnyResumeGame() ? undefined : null }
    return { revision, game: ownerId ? loadNewestResumeGame(ownerId) : null }
  }, [ownerId, waiting, revision]).game
}
