import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

function createPendingLife() {
  const pending = new Map<string, number>()
  const listeners = new Set<() => void>()
  return {
    get: (key: string) => pending.get(key) ?? 0,
    set: (key: string, delta: number) => {
      if ((pending.get(key) ?? 0) === delta) return
      if (delta) pending.set(key, delta)
      else pending.delete(key)
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

interface PendingLifeScope {
  store: ReturnType<typeof createPendingLife>
  teamOf: (playerId: string) => readonly string[]
}

const PendingLifeContext = createContext<PendingLifeScope | undefined>(undefined)

/** why: teammates share one life total, so a change still under one head's finger shows on both heads' cards, not only once it commits. Each seat keeps its own entry, so two heads changing life at once add up instead of clearing each other. */
export function PendingLifeProvider({
  teams,
  children,
}: {
  teams?: readonly (readonly string[])[]
  children: ReactNode
}) {
  const [store] = useState(createPendingLife)
  const scope = useMemo(
    () => ({
      store,
      teamOf: (playerId: string) =>
        teams?.find((members) => members.includes(playerId)) ?? [playerId],
    }),
    [store, teams],
  )
  return <PendingLifeContext value={scope}>{children}</PendingLifeContext>
}

export function usePendingLife(playerId: string | undefined) {
  const scope = useContext(PendingLifeContext)
  const [ownStore] = useState(createPendingLife)
  const store = scope?.store ?? ownStore
  const seat = playerId ?? "seat"
  const team = scope?.teamOf(seat) ?? [seat]
  const delta = useSyncExternalStore(store.subscribe, () =>
    team.reduce((sum, member) => sum + store.get(member), 0),
  )
  const setDelta = useCallback((next: number) => store.set(seat, next), [store, seat])
  return [delta, setDelta] as const
}
