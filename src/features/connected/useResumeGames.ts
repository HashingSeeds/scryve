import { useMemo, useSyncExternalStore } from "react"

import {
  type ConnectedGameRepository,
  getResumeIndexRevision,
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

export function useNewestResumeGame() {
  const revision = useResumeRevision()
  return useMemo(() => ({ revision, game: loadNewestResumeGame() }), [revision]).game
}
