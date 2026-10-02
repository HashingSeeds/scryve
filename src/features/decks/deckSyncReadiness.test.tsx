import { act, renderHook, waitFor } from "@testing-library/react-native"

import { clear } from "@/utils/storage"

import { DeckSyncRepository, useDeckSync } from "./decksSync"
import { DeckSyncWriteRepository, useDeckMetadataWrites } from "./decksSyncWrites"
import { DeckVersionWriteRepository, useDeckVersionWrites } from "./decksVersionWrites"
import type { Id } from "../../../convex/_generated/dataModel"

const deck = {
  id: "11111111-1111-4111-8111-111111111111",
  deckId: "deck-a" as Id<"decks">,
  revision: 0,
  name: "Cached deck",
  format: "commander",
  game: "mtg",
  note: "",
  deleted: false,
  createdAt: 1,
  updatedAt: 1,
}
const mockClient = {
  url: "https://readiness.convex.cloud",
  query: jest.fn(async () => ({
    ownerId: "owner-a",
    page: [deck],
    isDone: true,
    continueCursor: "",
  })),
  watchQuery: jest.fn(() => ({ onUpdate: () => jest.fn() })),
  mutation: jest.fn(
    async (
      _reference: unknown,
      args: { expectedRevision: number; name?: string; versionId?: string },
    ) =>
      args.versionId
        ? { revision: args.expectedRevision + 1 }
        : { ...deck, name: args.name, revision: args.expectedRevision + 1 },
  ),
}

jest.mock("convex/react", () => ({ useConvex: () => mockClient }))

it("waits for readiness, preserves offline edits, and resumes both write queues on reconnect", async () => {
  clear()
  const metadata = new DeckSyncWriteRepository("owner-a", undefined, mockClient.url)
  const versions = new DeckVersionWriteRepository("owner-a", undefined, mockClient.url)
  new DeckSyncRepository("owner-a", undefined, mockClient.url).mergeMetadata([deck])
  const hook = renderHook(
    ({ ready }: { ready: boolean }) => ({
      reads: useDeckSync(true, "owner-a", ready),
      metadata: useDeckMetadataWrites(true, "owner-a", ready),
      versions: useDeckVersionWrites(true, "owner-a", ready),
    }),
    { initialProps: { ready: false } },
  )

  expect(hook.result.current.reads.decks[0].name).toBe("Cached deck")
  await act(async () => {
    await hook.result.current.reads.retry()
  })
  act(() => {
    hook.result.current.metadata.update(deck.deckId, { name: "Edited offline" })
    hook.result.current.versions.update(
      deck.deckId,
      "version-a",
      [{ name: "Sol Ring", quantity: 1 }],
      0,
    )
  })
  expect(metadata.loadPending()).toHaveLength(1)
  expect(versions.loadPending()).toHaveLength(1)
  expect(mockClient.query.mock.calls.length).toBe(0)
  expect(mockClient.watchQuery.mock.calls.length).toBe(0)
  expect(mockClient.mutation.mock.calls.length).toBe(0)

  hook.rerender({ ready: true })
  await waitFor(() => {
    expect(metadata.loadPending()).toHaveLength(0)
    expect(versions.loadPending()).toHaveLength(0)
  })
  expect(mockClient.query).toHaveBeenCalled()
  expect(mockClient.mutation).toHaveBeenCalledTimes(2)

  hook.rerender({ ready: false })
  mockClient.query.mockClear()
  mockClient.mutation.mockClear()
  act(() => {
    hook.result.current.metadata.update(deck.deckId, { note: "Queued on disconnect" })
    hook.result.current.versions.update(
      deck.deckId,
      "version-a",
      [{ name: "Sol Ring", quantity: 2 }],
      1,
    )
  })
  expect(mockClient.query.mock.calls.length).toBe(0)
  expect(mockClient.mutation.mock.calls.length).toBe(0)
  expect(metadata.loadPending()).toHaveLength(1)
  expect(versions.loadPending()).toHaveLength(1)

  hook.rerender({ ready: true })
  await waitFor(() => {
    expect(metadata.loadPending()).toHaveLength(0)
    expect(versions.loadPending()).toHaveLength(0)
  })
  expect(mockClient.query).toHaveBeenCalled()
  expect(mockClient.mutation).toHaveBeenCalledTimes(2)
  hook.unmount()
})
