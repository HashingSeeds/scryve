import { act, render, waitFor } from "@testing-library/react-native"

import { resetConnectedProfileBootstrapForTests } from "@/features/connected/useConnectedProfile"

import { applyGameCommand, asDeviceId, createLocalGame, defaultCommandContext } from "./domain"
import { LocalGamePublishSession } from "./LocalGamePublishSession"
import { LocalGameRepository, type StringStorage } from "./localPersistence"

const mockSyncCurrent = jest.fn(async () => "convex-user-a")
const mockPublish = jest.fn(async (_args: { publicId: string; result: { kind: string } }) => ({
  publicId: "x",
  summaryId: "s",
  finishedAt: 1,
}))
let mockConnected = true

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: { id: "owner-a", username: "Player" } }),
}))
jest.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useConvexConnectionState: () => ({ isWebSocketConnected: mockConnected }),
  useMutation: (reference: string) =>
    reference === "games.publishFinishedLocalGame" ? mockPublish : mockSyncCurrent,
}))
jest.mock("../../../convex/_generated/api", () => ({
  api: {
    users: { syncCurrent: "users.syncCurrent" },
    games: { publishFinishedLocalGame: "games.publishFinishedLocalGame" },
  },
}))

class MemoryStorage implements StringStorage {
  values = new Map<string, string>()
  getString(key: string) {
    return this.values.get(key)
  }
  set(key: string, value: string) {
    this.values.set(key, value)
  }
  delete(key: string) {
    this.values.delete(key)
  }
}

function finishedGame(now: number) {
  const game = createLocalGame({
    now,
    startingLife: 20,
    players: [
      { name: "Ada", color: "#000000" },
      { name: "Grace", color: "#111111" },
    ],
  })
  return applyGameCommand(
    game,
    { type: "game.finish", result: { kind: "win", winnerPlayerIds: [game.players[0].id] } },
    { ...defaultCommandContext(asDeviceId("device_test")), now: () => now + 1 },
  )
}

describe("LocalGamePublishSession", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetConnectedProfileBootstrapForTests()
    mockConnected = true
  })

  it("uploads the owner's pending games, marks them published, and skips other accounts", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.archiveGame(finishedGame(1), "game_menu", "owner-a")
    repository.archiveGame(finishedGame(10), "game_menu", "owner-b")
    repository.archiveGame(finishedGame(20), "game_menu")
    expect(repository.pendingPublishes("owner-a")).toHaveLength(1)

    render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1))
    expect(mockPublish.mock.calls[0]?.[0]).toMatchObject({
      publicId: repository.loadHistory()[2].id,
      result: { kind: "win" },
    })
    await waitFor(() => expect(repository.pendingPublishes("owner-a")).toHaveLength(0))
    expect(repository.loadHistory().map((game) => game.publish)).toEqual([
      undefined,
      "pending",
      "published",
    ])
  })

  it("retries a failed upload on the next finish and keeps it pending meanwhile", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    mockPublish.mockRejectedValueOnce(new Error("offline"))
    repository.archiveGame(finishedGame(1), "game_menu", "owner-a")

    render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1))
    expect(repository.pendingPublishes("owner-a")).toHaveLength(1)

    await act(async () => {
      repository.archiveGame(finishedGame(30), "game_menu", "owner-a")
    })
    await waitFor(() => expect(repository.pendingPublishes("owner-a")).toHaveLength(0))
    expect(mockPublish).toHaveBeenCalledTimes(3)
  })
})
