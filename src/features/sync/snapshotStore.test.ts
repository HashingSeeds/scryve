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
})
