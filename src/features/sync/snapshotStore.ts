import { observable, ObservableHint, type ObservableParam } from "@legendapp/state"

export interface SnapshotObservable<Snapshot> {
  get(): Snapshot
  peek(): Snapshot
  onChange(listener: () => void): () => void
}

export interface SnapshotStore<Snapshot extends object> {
  readonly state$: SnapshotObservable<Snapshot>
  set(snapshot: Snapshot): void
  getSnapshot(): Snapshot
  subscribe(listener: () => void): () => void
}

/**
 * Legend observable holding a whole snapshot. Snapshots are opaque so Legend replaces them by
 * reference instead of diffing arrays keyed on `id`, which pending writes for one deck share.
 */
export function createSnapshotStore<Snapshot extends object>(
  initial: Snapshot,
): SnapshotStore<Snapshot> {
  const state$ = observable(ObservableHint.opaque(initial)) as unknown as ObservableParam<Snapshot>
  return {
    state$,
    set: (snapshot) => state$.set(ObservableHint.opaque(snapshot)),
    getSnapshot: () => state$.peek(),
    subscribe: (listener) => state$.onChange(listener),
  }
}
