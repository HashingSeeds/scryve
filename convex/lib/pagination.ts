export const CONNECTED_EVENT_PAGE_MAX_ITEMS = 50
export const CONNECTED_MEMBERSHIP_PAGE_MAX_ITEMS = 25
export const CONNECTED_PAGE_MAX_BYTES_READ = 1_000_000

export function boundedPaginationOptions(
  options: {
    cursor: string | null
    numItems: number
    endCursor?: string | null
    id?: number
  },
  maxItems: number,
) {
  if (!Number.isSafeInteger(options.numItems) || options.numItems < 1)
    throw new Error("Pagination item count must be a positive integer")
  return {
    cursor: options.cursor,
    ...(options.endCursor !== undefined ? { endCursor: options.endCursor } : {}),
    ...(options.id !== undefined ? { id: options.id } : {}),
    numItems: Math.min(options.numItems, maxItems),
    maximumRowsRead: maxItems,
    maximumBytesRead: CONNECTED_PAGE_MAX_BYTES_READ,
  }
}
