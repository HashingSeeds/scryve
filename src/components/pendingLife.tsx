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
  keyOf: (playerId: string) => string
}

const PendingLifeContext = createContext<PendingLifeScope | undefined>(undefined)

/** why: teammates share one life total, so a change still under one head's finger shows on both heads' cards, not only once it commits. */
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
      keyOf: (playerId: string) => {
        const team = teams?.findIndex((members) => members.includes(playerId)) ?? -1
        return team < 0 ? `seat:${playerId}` : `team:${team}`
      },
    }),
    [store, teams],
  )
  return <PendingLifeContext value={scope}>{children}</PendingLifeContext>
}

export function usePendingLife(playerId: string | undefined) {
  const scope = useContext(PendingLifeContext)
  const [ownStore] = useState(createPendingLife)
  const store = scope?.store ?? ownStore
  const key = scope && playerId !== undefined ? scope.keyOf(playerId) : "seat"
  const delta = useSyncExternalStore(store.subscribe, () => store.get(key))
  const setDelta = useCallback((next: number) => store.set(key, next), [store, key])
  return [delta, setDelta] as const
}
