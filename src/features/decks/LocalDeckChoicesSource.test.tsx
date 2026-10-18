import { render } from "@testing-library/react-native"

import { DeckSyncRepository, type MineDeck } from "./decksSync"
import { MyDecksSource } from "./LocalDeckChoicesSource"

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
