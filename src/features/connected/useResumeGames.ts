import { useMemo, useSyncExternalStore } from "react"

import { useAuthAccess } from "@/features/auth/AuthContext"

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

// why: `undefined` means Clerk is still restoring a device with saved games, so wait rather than flash local play.
export function useNewestResumeGame(): ReturnType<typeof loadNewestResumeGame> | undefined {
  const revision = useResumeRevision()
  const { isLoaded, isSignedIn, userId } = useAuthAccess()
  const restoring = !isLoaded || (isSignedIn && !userId)
  const ownerId = isSignedIn ? userId : undefined
  return useMemo(() => {
    if (restoring) return { revision, game: hasAnyResumeGame() ? undefined : null }
    return { revision, game: ownerId ? loadNewestResumeGame(ownerId) : null }
  }, [ownerId, restoring, revision]).game
}
