import { createSnapshotStore } from "./snapshotStore"

describe("createSnapshotStore", () => {
  it("notifies subscribers only when a field changes identity", () => {
    const pending = [{ id: "a" }]
    const store = createSnapshotStore({ pending, status: "syncing" })
    const listener = jest.fn()
    store.subscribe(listener)

    store.set({ pending, status: "syncing" })
    expect(listener).not.toHaveBeenCalled()

    store.set({ pending: [...pending], status: "syncing" })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("treats a renamed field as a change even when both values are undefined", () => {
    const store = createSnapshotStore<{ a?: number; b?: number }>({ a: undefined })
    const listener = jest.fn()
    store.subscribe(listener)

    store.set({ b: undefined })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
