import { renderHook } from "@testing-library/react-native"

import { holdOrder, useHeldOrder } from "./heldOrder"

const rows = (...ids: string[]) => ids.map((_id) => ({ _id }))
const ids = (items: readonly { _id: string }[] | undefined) => items?.map(({ _id }) => _id)

describe("held order", () => {
  it("keeps rows where they were, drops gone ones and appends new ones", () => {
    expect(ids(holdOrder(["a", "b", "c"], rows("c", "d", "a")))).toEqual(["a", "c", "d"])
  })

  it("holds while votes re-sort the list and sorts again for a new tab or search", () => {
    const { result, rerender } = renderHook(
      ({ items, key }: { items: { _id: string }[] | undefined; key: string }) =>
        useHeldOrder(items, key),
      { initialProps: { items: rows("a", "b"), key: "all|" } },
    )
    expect(ids(result.current)).toEqual(["a", "b"])
    rerender({ items: rows("b", "a", "c"), key: "all|" })
    expect(ids(result.current)).toEqual(["a", "b", "c"])
    rerender({ items: rows("c", "b", "a"), key: "all|" })
    expect(ids(result.current)).toEqual(["a", "b", "c"])
    rerender({ items: undefined, key: "bugs|" })
    expect(result.current).toBeUndefined()
    rerender({ items: rows("b", "a"), key: "bugs|" })
    expect(ids(result.current)).toEqual(["b", "a"])
  })
})
