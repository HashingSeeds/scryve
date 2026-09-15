import { render } from "@testing-library/react-native"

import { DeckSyncSession } from "./DeckSyncSession"

const mockDeckVersionWrites = jest.fn()
const mockDeckMetadataWrites = jest.fn()

jest.mock("./decksSync", () => ({
  isDeckSyncEnabled: () => mockDeckSyncState.enabled,
}))
const mockDeckSyncState = { enabled: true }

jest.mock("./decksSyncWrites", () => ({
  useDeckMetadataWrites: (...args: unknown[]) => mockDeckMetadataWrites(...args),
}))

jest.mock("./decksVersionWrites", () => ({
  useDeckVersionWrites: (...args: unknown[]) => mockDeckVersionWrites(...args),
}))

describe("DeckSyncSession", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDeckSyncState.enabled = true
  })

  it("keeps both durable write drainers alive for the signed-in session lifetime", () => {
    render(<DeckSyncSession ownerId="owner-a" />)
    expect(mockDeckMetadataWrites).toHaveBeenCalledWith(true, "owner-a")
    expect(mockDeckVersionWrites).toHaveBeenCalledWith(true, "owner-a")
  })

  it("mounts nothing when deck sync is disabled", () => {
    mockDeckSyncState.enabled = false
    render(<DeckSyncSession ownerId="owner-a" />)
    expect(mockDeckMetadataWrites).not.toHaveBeenCalled()
    expect(mockDeckVersionWrites).not.toHaveBeenCalled()
  })
})
