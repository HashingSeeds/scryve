import {
  boundedPaginationOptions,
  CONNECTED_EVENT_PAGE_MAX_ITEMS,
  CONNECTED_PAGE_MAX_BYTES_READ,
} from "./pagination"

describe("connected pagination policy", () => {
  it("caps caller page size and replaces caller-controlled resource budgets", () => {
    expect(
      boundedPaginationOptions(
        {
          cursor: "cursor",
          endCursor: "end-cursor",
          id: 17,
          numItems: 100_000,
          maximumRowsRead: 999_999,
          maximumBytesRead: 999_999_999,
        } as any,
        CONNECTED_EVENT_PAGE_MAX_ITEMS,
      ),
    ).toEqual({
      cursor: "cursor",
      endCursor: "end-cursor",
      id: 17,
      numItems: CONNECTED_EVENT_PAGE_MAX_ITEMS,
      maximumRowsRead: CONNECTED_EVENT_PAGE_MAX_ITEMS,
      maximumBytesRead: CONNECTED_PAGE_MAX_BYTES_READ,
    })
  })

  it.each([0, -1, 1.5, Number.MAX_VALUE])("rejects invalid item count %s", (numItems) => {
    expect(() => boundedPaginationOptions({ cursor: null, numItems }, 25)).toThrow(
      "positive integer",
    )
  })
})
