import { act, render, waitFor } from "@testing-library/react-native"

import { resetConnectedProfileBootstrapForTests } from "@/features/connected/useConnectedProfile"

import { DeckSyncSession } from "./DeckSyncSession"

const mockDeckVersionWrites = jest.fn()
const mockDeckMetadataWrites = jest.fn()
const mockSyncCurrent = jest.fn<Promise<string>, [object]>()
let mockConnected = true
let mockOwnerId = "owner-a"

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: { id: mockOwnerId, username: "Player" } }),
}))
jest.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useConvexConnectionState: () => ({ isWebSocketConnected: mockConnected }),
  useMutation: () => mockSyncCurrent,
}))

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
    resetConnectedProfileBootstrapForTests()
    mockConnected = true
    mockOwnerId = "owner-a"
    mockSyncCurrent.mockResolvedValue("convex-user-a")
    mockDeckSyncState.enabled = true
  })

  it("waits for profile creation and pauses network sync while offline or changing accounts", async () => {
    let finishProfile!: (value: string) => void
    mockSyncCurrent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishProfile = resolve
        }),
    )
    const view = render(<DeckSyncSession ownerId="owner-a" />)
    expect(mockSyncCurrent).toHaveBeenCalled()
    expect(mockDeckMetadataWrites).toHaveBeenLastCalledWith(true, "owner-a", false)
    expect(mockDeckVersionWrites).toHaveBeenLastCalledWith(true, "owner-a", false)

    await act(async () => finishProfile("convex-user-a"))
    expect(mockDeckMetadataWrites).toHaveBeenLastCalledWith(true, "owner-a", true)
    expect(mockDeckVersionWrites).toHaveBeenLastCalledWith(true, "owner-a", true)

    mockConnected = false
    view.rerender(<DeckSyncSession ownerId="owner-a" />)
    expect(mockDeckMetadataWrites).toHaveBeenLastCalledWith(true, "owner-a", false)
    expect(mockDeckVersionWrites).toHaveBeenLastCalledWith(true, "owner-a", false)

    mockConnected = true
    mockOwnerId = "owner-b"
    mockSyncCurrent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishProfile = resolve
        }),
    )
    view.rerender(<DeckSyncSession ownerId="owner-b" />)
    expect(mockDeckMetadataWrites).toHaveBeenLastCalledWith(true, "owner-b", false)
    expect(mockDeckVersionWrites).toHaveBeenLastCalledWith(true, "owner-b", false)
    await act(async () => finishProfile("convex-user-b"))
    await waitFor(() =>
      expect(mockDeckMetadataWrites).toHaveBeenLastCalledWith(true, "owner-b", true),
    )
    expect(mockDeckVersionWrites).toHaveBeenLastCalledWith(true, "owner-b", true)
  })

  it("mounts nothing when deck sync is disabled", () => {
    mockDeckSyncState.enabled = false
    render(<DeckSyncSession ownerId="owner-a" />)
    expect(mockDeckMetadataWrites).not.toHaveBeenCalled()
    expect(mockDeckVersionWrites).not.toHaveBeenCalled()
  })
})
