import { render } from "@testing-library/react-native"

import { DeckSyncRepository, type MineDeck } from "./decksSync"
import { LocalDeckChoicesSource, MyDecksSource } from "./LocalDeckChoicesSource"

const URL = "https://scryve-test.convex.cloud"
let mockLive: { decks: MineDeck[] } | undefined
let mockProfile = "offline"

jest.mock("convex/react", () => ({
  useConvex: () => ({ url: URL, query: jest.fn(), watchQuery: jest.fn() }),
  useQuery: () => mockLive,
}))
jest.mock("@/features/async/ConvexQueryBoundary", () => ({
  ConvexQueryBoundary: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock("@/features/connected/useConnectedProfile", () => ({
  ConnectedProfileProvider: ({ children }: { children: React.ReactNode }) => children,
  useConnectedProfile: () => ({ status: mockProfile }),
}))

const atraxa = { _id: "deck-atraxa", name: "Atraxa", format: "commander", versions: [] }
const shelf = (ownerId: string) => new DeckSyncRepository(ownerId, undefined, URL)

describe("MyDecksSource", () => {
  it("lists the decks this device last saw when the account can't be reached", () => {
    shelf("owner-cached").saveShelf([atraxa as unknown as MineDeck])
    mockLive = undefined
    mockProfile = "offline"
    const onChange = jest.fn()

    render(<MyDecksSource ownerId="owner-cached" onChange={onChange} />)
    render(<MyDecksSource ownerId="owner-new" onChange={onChange} />)

    expect(onChange.mock.calls).toEqual([[[atraxa]], ["unavailable"]])
  })

  it("keeps the live list for the next time the account is offline", () => {
    mockLive = { decks: [atraxa as unknown as MineDeck] }
    mockProfile = "ready"

    render(<MyDecksSource ownerId="owner-live" onChange={jest.fn()} />)

    expect(shelf("owner-live").loadShelf()).toEqual([atraxa])
  })
})

describe("LocalDeckChoicesSource", () => {
  it("offers each deck at the version it brings, named when it has several", () => {
    const deck = { game: "fab", format: "cc", latestVersionId: "v-2", versionNumber: 2 }
    const versions = [
      { _id: "v-1", versionNumber: 1 },
      { _id: "v-2", versionNumber: 2, name: "Budget" },
    ]
    mockLive = {
      decks: [
        { ...deck, _id: "deck-a", deckKey: "key-a", name: "A", versions, bringingVersionId: "v-1" },
        { ...deck, _id: "deck-b", deckKey: "key-b", name: "B", versions },
        { ...deck, _id: "deck-c", deckKey: "key-c", name: "C", versions: [versions[1]] },
      ].map((entry) => ({ ...entry, startingValue: 40 })) as unknown as MineDeck[],
    }
    mockProfile = "ready"
    const onChange = jest.fn()

    render(<LocalDeckChoicesSource ownerId="owner-choices" onChange={onChange} />)

    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        versionId: "v-1",
        versionLabel: "Version 1",
        deckId: "deck-a",
        deckKey: "key-a",
        startingValue: undefined,
      }),
      expect.objectContaining({
        versionId: "v-2",
        versionLabel: "Version 2 · Budget",
        deckId: "deck-b",
        deckKey: "key-b",
        startingValue: 40,
      }),
      expect.objectContaining({ versionId: "v-2", versionLabel: undefined, startingValue: 40 }),
    ])
  })
})
