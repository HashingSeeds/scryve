import { act, render, waitFor } from "@testing-library/react-native"
import { ConvexError } from "convex/values"

import { resetConnectedProfileBootstrapForTests } from "@/features/connected/useConnectedProfile"
import { pendingSeatClaims, rememberSeatClaim, setNearbyOwner } from "@/features/lan/nearbyAccount"
import { ErrorType, reportCrash } from "@/utils/crashReporting"
import { remove } from "@/utils/storage"

import { applyGameCommand, asDeviceId, createLocalGame, defaultCommandContext } from "./domain"
import { LocalGamePublishSession } from "./LocalGamePublishSession"
import { LocalGameRepository, type StringStorage } from "./localPersistence"

jest.mock("@/utils/crashReporting", () => ({
  ErrorType: { HANDLED: "Handled" },
  reportCrash: jest.fn(),
}))

const mockSyncCurrent = jest.fn(async () => "convex-user-a")
const mockPublish = jest.fn(
  async (_args: {
    publicId: string
    result: { kind: string }
    players: {
      deckVersionId?: string
      deckKey?: string
      deckFingerprint?: string
      deckName?: string
    }[]
  }) => ({
    publicId: "x",
    summaryId: "s",
    finishedAt: 1,
  }),
)
const mockFinishMatch = jest.fn(async (_args: { publicId: string; gameCount: number }) => ({
  matchId: "m",
}))
const mockClaimSeat = jest.fn(async (_args: { publicId: string; token: string }) => ({
  status: "claimed" as "claimed" | "pending",
}))
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
        : reference === "games.claimNearbySeat"
          ? mockClaimSeat
          : mockSyncCurrent,
}))
jest.mock("../../../convex/_generated/api", () => ({
  api: {
    users: { syncCurrent: "users.syncCurrent" },
    games: {
      publishFinishedLocalGame: "games.publishFinishedLocalGame",
      claimNearbySeat: "games.claimNearbySeat",
    },
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
  account?: {
    ownerId: string
    meSeat: number
    deckVersionId?: string
    deckKey?: string
    deckFingerprint?: string
    deckName?: string
  },
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

function decidedMatchGame() {
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
  return applyGameCommand(
    first,
    { type: "game.finish", result: { kind: "win", winnerPlayerIds: [first.players[0].id] } },
    { ...defaultCommandContext(asDeviceId("device_test")), now: () => 2 },
  )
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  resetConnectedProfileBootstrapForTests()
  mockConnected = true
})

afterEach(() => {
  jest.useRealTimers()
})

describe("LocalGamePublishSession", () => {
  it("uploads the owner's pending games, marks them published, and skips other accounts", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const game = finishedGame(1)
    repository.archiveGame({ ...game, firstPlayerId: game.players[1].id }, "game_menu", "owner-a")
    repository.archiveGame(finishedGame(10), "game_menu", "owner-b")
    repository.archiveGame(finishedGame(20), "game_menu")
    expect(repository.pendingPublishes("owner-a")).toHaveLength(1)

    render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1))
    expect(mockPublish.mock.calls[0]?.[0]).toMatchObject({
      publicId: repository.loadHistory()[2].id,
      firstPlayerLocalId: game.players[1].id,
      result: { kind: "win" },
    })
    await waitFor(() => expect(repository.pendingPublishes("owner-a")).toHaveLength(0))
    expect(repository.loadHistory().map((game) => game.publish)).toEqual([
      undefined,
      "pending",
      "published",
    ])
  })

  it("claims nearby seats, keeping one the host has not uploaded and dropping a refused one", async () => {
    remove("lan.seatClaims")
    setNearbyOwner("owner-a")
    for (const publicId of ["game-claimed", "game-pending", "game-refused"])
      rememberSeatClaim({ publicId, token: "token", savedAt: Date.now() })
    setNearbyOwner(undefined)
    mockClaimSeat.mockImplementation(async ({ publicId }) => {
      if (publicId === "game-refused")
        throw new ConvexError({ code: "seat_taken", message: "Another account claimed this seat" })
      return { status: publicId === "game-pending" ? "pending" : "claimed" }
    })

    render(
      <LocalGamePublishSession
        ownerId="owner-a"
        repository={new LocalGameRepository(new MemoryStorage())}
      />,
    )

    await waitFor(() => expect(mockClaimSeat).toHaveBeenCalledTimes(3))
    await waitFor(() =>
      expect(pendingSeatClaims("owner-a").map(({ publicId }) => publicId)).toEqual([
        "game-pending",
      ]),
    )
  })

  it("retries a claim that beat the host's upload a few seconds later", async () => {
    remove("lan.seatClaims")
    setNearbyOwner("owner-a")
    rememberSeatClaim({ publicId: "game-racing", token: "token", savedAt: Date.now() })
    setNearbyOwner(undefined)
    mockClaimSeat
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "claimed" })

    render(
      <LocalGamePublishSession
        ownerId="owner-a"
        repository={new LocalGameRepository(new MemoryStorage())}
      />,
    )
    await waitFor(() => expect(mockClaimSeat).toHaveBeenCalledTimes(1))
    await act(async () => {
      jest.advanceTimersByTime(5_000)
    })

    await waitFor(() => expect(mockClaimSeat).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(pendingSeatClaims("owner-a")).toEqual([]))
  })

  it("retries a failed upload on the next finish and keeps it pending meanwhile", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    mockPublish.mockRejectedValueOnce(new Error("offline"))
    repository.archiveGame(finishedGame(1), "game_menu", "owner-a")

    render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1))
    expect(repository.pendingPublishes("owner-a")).toHaveLength(1)
    expect(reportCrash).not.toHaveBeenCalled()

    await act(async () => {
      repository.archiveGame(finishedGame(30), "game_menu", "owner-a")
    })
    await waitFor(() => expect(repository.pendingPublishes("owner-a")).toHaveLength(0))
    expect(mockPublish).toHaveBeenCalledTimes(3)
  })

  it("uploads a match's games in order and finishes the match only after they are acked", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const decided = decidedMatchGame()
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

  it("marks a rejected match finish failed instead of retrying it forever", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const decided = decidedMatchGame()
    mockFinishMatch.mockRejectedValueOnce(
      new Error("[CONVEX M(matches:finishScryveMatch)] Server Error\nUncaught Error: missing"),
    )
    repository.archiveGame(decided, "game_menu")

    render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
    await waitFor(() => expect(repository.loadHistory()[0].matchPublish).toBe("failed"))
    expect(mockFinishMatch).toHaveBeenCalledTimes(1)
    expect(mockFinishMatch.mock.calls[0]?.[0]).toMatchObject({ gameCount: 1 })
  })
})

describe("LocalGamePublishSession rejections", () => {
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
    expect(repository.loadHistory().map((game) => game.publish)).toEqual(["published", "failed"])
    expect(reportCrash).toHaveBeenCalledTimes(1)
    expect(reportCrash).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "LocalGamePublishFailed",
        message: "Finished game could not be published",
      }),
      ErrorType.HANDLED,
      { tags: { code: "server_error" }, fingerprint: ["local-game-publish", "failed"] },
    )
    const again = render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
    await act(async () => undefined)
    again.unmount()
    expect(reportCrash).toHaveBeenCalledTimes(1)
  })

  it.each(["deck_version_not_found", "invalid_deck_key", "invalid_deck_fingerprint"])(
    "retries %s once with all deck fields stripped",
    async (code) => {
      const repository = new LocalGameRepository(new MemoryStorage())
      repository.archiveGame(
        finishedGame(1, {
          ownerId: "owner-a",
          meSeat: 0,
          ...(code === "deck_version_not_found" ? { deckVersionId: "gone" } : {}),
          deckKey: "burn",
          deckFingerprint: `v1:${"a".repeat(64)}`,
          deckName: "Burn",
        }),
        "game_menu",
        "owner-a",
      )
      mockPublish.mockRejectedValueOnce(new ConvexError({ code, message: "Deck rejected" }))

      render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
      await waitFor(() => expect(repository.loadHistory()[0].publish).toBe("published"))
      expect(mockPublish).toHaveBeenCalledTimes(2)
      expect(mockPublish.mock.calls[0][0].players[0].deckKey).toBe("burn")
      expect(mockPublish.mock.calls[1][0].players[0]).toMatchObject({
        localId: expect.any(String),
        me: true,
      })
      for (const field of ["deckVersionId", "deckKey", "deckFingerprint", "deckName"])
        expect(mockPublish.mock.calls[1][0].players[0]).not.toHaveProperty(field)
      expect(reportCrash).toHaveBeenCalledTimes(1)
      expect(reportCrash).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "LocalGamePublishDeckStripped",
          message: "Game published without its deck",
        }),
        ErrorType.HANDLED,
        { tags: { code }, fingerprint: ["local-game-publish", "deck_stripped"] },
      )
      const again = render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
      await act(async () => undefined)
      again.unmount()
      expect(reportCrash).toHaveBeenCalledTimes(1)
    },
  )

  it("does not retry a rejected deck fallback again", async () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    repository.archiveGame(
      finishedGame(1, { ownerId: "owner-a", meSeat: 0, deckKey: "burn" }),
      "game_menu",
      "owner-a",
    )
    const rejection = new ConvexError({ code: "invalid_deck_key", message: "Deck rejected" })
    mockPublish.mockRejectedValueOnce(rejection).mockRejectedValueOnce(rejection)

    render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
    await waitFor(() => expect(repository.loadHistory()[0].publish).toBe("failed"))
    expect(mockPublish).toHaveBeenCalledTimes(2)
    expect(reportCrash).toHaveBeenCalledTimes(1)
    expect(reportCrash).toHaveBeenCalledWith(
      expect.objectContaining({ name: "LocalGamePublishFailed" }),
      ErrorType.HANDLED,
      { tags: { code: "invalid_deck_key" }, fingerprint: ["local-game-publish", "failed"] },
    )
  })
})

it("keeps the throttle deadline when another game finishes or the connection restarts", async () => {
  const repository = new LocalGameRepository(new MemoryStorage())
  repository.archiveGame(finishedGame(1), "game_menu", "owner-a")
  mockPublish.mockRejectedValueOnce(
    new ConvexError({ code: "rate_limited", message: "Wait", retryAfterMs: 90_000 }),
  )
  const view = render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
  try {
    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1))
    await act(async () => {
      jest.advanceTimersByTime(30_000)
      repository.archiveGame(finishedGame(10), "game_menu", "owner-a")
    })
    expect(mockPublish).toHaveBeenCalledTimes(1)
    mockConnected = false
    view.rerender(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
    mockConnected = true
    view.rerender(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
    await act(async () => jest.advanceTimersByTime(59_999))
    expect(mockPublish).toHaveBeenCalledTimes(1)
    expect(repository.pendingPublishes("owner-a")).toHaveLength(2)
    await act(async () => jest.advanceTimersByTime(1))
    expect(mockPublish).toHaveBeenCalledTimes(3)
    expect(repository.pendingPublishes("owner-a")).toHaveLength(0)
  } finally {
    view.unmount()
  }
})

it("retries a throttled upload after the default backoff without failing the game", async () => {
  const repository = new LocalGameRepository(new MemoryStorage())
  repository.archiveGame(finishedGame(1), "game_menu", "owner-a")
  mockPublish.mockRejectedValueOnce(new ConvexError({ code: "rate_limited", message: "Wait" }))
  const view = render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
  await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1))
  expect(repository.loadHistory()[0].publish).toBe("pending")
  await act(async () => {
    jest.advanceTimersByTime(60_000)
  })
  await waitFor(() => expect(repository.loadHistory()[0].publish).toBe("published"))
  expect(mockPublish).toHaveBeenCalledTimes(2)
  view.unmount()
})

it("reports a stripped-deck upload only after its retry succeeds", async () => {
  const repository = new LocalGameRepository(new MemoryStorage())
  repository.archiveGame(
    finishedGame(1, { ownerId: "owner-a", meSeat: 0, deckKey: "private-deck" }),
    "game_menu",
    "owner-a",
  )
  const rejection = new ConvexError({
    code: "deck_version_not_found",
    message: "private deck content",
  })
  mockPublish.mockRejectedValueOnce(rejection).mockRejectedValueOnce(new Error("offline"))
  render(<LocalGamePublishSession ownerId="owner-a" repository={repository} />)
  await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(2))
  expect(reportCrash).not.toHaveBeenCalled()
  mockPublish.mockRejectedValueOnce(rejection)
  await act(async () => {
    repository.archiveGame(finishedGame(30), "game_menu", "owner-a")
  })
  await waitFor(() => expect(repository.pendingPublishes("owner-a")).toHaveLength(0))
  expect(reportCrash).toHaveBeenCalledTimes(1)
  expect(reportCrash).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "LocalGamePublishDeckStripped",
      message: "Game published without its deck",
    }),
    ErrorType.HANDLED,
    {
      tags: { code: "deck_version_not_found" },
      fingerprint: ["local-game-publish", "deck_stripped"],
    },
  )
  expect(jest.mocked(reportCrash).mock.calls[0][0]).not.toHaveProperty("cause")
})
