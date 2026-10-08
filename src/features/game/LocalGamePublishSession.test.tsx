import { act, render, waitFor } from "@testing-library/react-native"
import { ConvexError } from "convex/values"

import { resetConnectedProfileBootstrapForTests } from "@/features/connected/useConnectedProfile"

import { applyGameCommand, asDeviceId, createLocalGame, defaultCommandContext } from "./domain"
import { LocalGamePublishSession } from "./LocalGamePublishSession"
import { LocalGameRepository, type StringStorage } from "./localPersistence"

const mockSyncCurrent = jest.fn(async () => "convex-user-a")
const mockPublish = jest.fn(
  async (_args: {
    publicId: string
    result: { kind: string }
    players: { deckVersionId?: string }[]
  }) => ({
    publicId: "x",
    summaryId: "s",
    finishedAt: 1,
  }),
)
const mockFinishMatch = jest.fn(async (_args: { publicId: string }) => ({ matchId: "m" }))
let mockConnected = true

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: { id: "owner-a", username: "Player" } }),
}))
jest.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useConvexConnectionState: () => ({ isWebSocketConnected: mockConnected }),
  useMutation: (reference: string) =>
    reference === "games.publishFinishedLocalGame"
      ? mockPublish
      : reference === "matches.finishScryveMatch"
        ? mockFinishMatch
        : mockSyncCurrent,
}))
jest.mock("../../../convex/_generated/api", () => ({
  api: {
    users: { syncCurrent: "users.syncCurrent" },
    games: { publishFinishedLocalGame: "games.publishFinishedLocalGame" },
    matches: { finishScryveMatch: "matches.finishScryveMatch" },
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

function finishedGame(
  now: number,
  account?: { ownerId: string; meSeat: number; deckVersionId: string },
) {
  const game = createLocalGame({
    now,
    startingLife: 20,
    players: [
      { name: "Ada", color: "#000000" },
      { name: "Grace", color: "#111111" },
    ],
    ...(account ? { account } : {}),
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

  it("uploads a match's games in order and finishes the match only after they are acked", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const first = createLocalGame({
      now: 1,
      startingLife: 20,
      players: [
        { name: "Ada", color: "#000000" },
        { name: "Grace", color: "#111111" },
      ],
      account: { ownerId: "owner-a", meSeat: 0 },
      match: { bestOf: 1 },
    })
    const context = defaultCommandContext(asDeviceId("device_test"))
    const decided = applyGameCommand(
      first,
      { type: "game.finish", result: { kind: "win", winnerPlayerIds: [first.players[0].id] } },
      { ...context, now: () => 2 },
    )
    mockPublish.mockRejectedValueOnce(new Error("offline"))
    repository.archiveGame(decided, "game_menu")

    render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1))
    expect(mockFinishMatch).not.toHaveBeenCalled()

    await act(async () => {
      repository.archiveGame(finishedGame(30), "game_menu", "owner-a")
    })
    await waitFor(() => expect(mockFinishMatch).toHaveBeenCalledTimes(1))
    expect(mockPublish.mock.calls.map(([args]) => args.publicId)).toEqual([
      decided.id,
      decided.id,
      repository.loadHistory()[0].id,
    ])
    expect(mockFinishMatch.mock.calls[0]?.[0]).toMatchObject({
      publicId: decided.match?.id,
      seats: [
        { seat: 1, outcome: "win", gamesWon: 1, gamesDrawn: 0 },
        { seat: 2, outcome: "loss", gamesWon: 0, gamesDrawn: 0 },
      ],
    })
    await waitFor(() => expect(repository.loadHistory()[1].matchPublish).toBe("published"))
  })
})

describe("LocalGamePublishSession rejections", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetConnectedProfileBootstrapForTests()
    mockConnected = true
  })

  it("marks a rejected game failed and still uploads the games behind it", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.archiveGame(finishedGame(1), "game_menu", "owner-a")
    repository.archiveGame(finishedGame(10), "game_menu", "owner-a")
    mockPublish.mockRejectedValueOnce(
      new Error(
        "[CONVEX M(games:publishFinishedLocalGame)] Server Error\nUncaught Error: Invalid public game identifier",
      ),
    )

    render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
    await waitFor(() => expect(repository.pendingPublishes("owner-a")).toHaveLength(0))
    expect(mockPublish).toHaveBeenCalledTimes(2)
    // why: uploads go oldest first, so the rejected game is the older one, listed last in History.
    expect(repository.loadHistory().map((game) => game.publish)).toEqual(["published", "failed"])
  })

  it("retries a deck rejection once without the deck", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.archiveGame(
      finishedGame(1, { ownerId: "owner-a", meSeat: 0, deckVersionId: "gone" }),
      "game_menu",
      "owner-a",
    )
    mockPublish.mockRejectedValueOnce(
      new ConvexError({ code: "deck_version_not_found", message: "Deck version not found" }),
    )

    render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
    await waitFor(() => expect(repository.loadHistory()[0].publish).toBe("published"))
    expect(mockPublish).toHaveBeenCalledTimes(2)
    expect(mockPublish.mock.calls[0][0].players[0].deckVersionId).toBe("gone")
    expect(mockPublish.mock.calls[1][0].players[0].deckVersionId).toBeUndefined()
  })
})
