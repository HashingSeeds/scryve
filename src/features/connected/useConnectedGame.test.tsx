import { act, renderHook, waitFor } from "@testing-library/react-native"

import { clear } from "@/utils/storage"
import { recordReviewCompletion } from "@/utils/storeReview"

import type { PendingLifeAction } from "./model"
import { toConnectedProjection } from "./model"
import { connectedDeploymentScope, ConnectedGameRepository } from "./persistence"
import { CONNECTED_GAME_UNAVAILABLE_MS, useConnectedGame } from "./useConnectedGame"
import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "../game/domain"

jest.mock("@/utils/storeReview", () => ({ recordReviewCompletion: jest.fn() }))

const mockFinishMutation = jest.fn(async () => undefined)
const mockEmitTelemetry = jest.fn()
let mockSocketConnected = false
let mockConvexAuthenticated = true
let mockConvexRefreshing = false
const mockRemoteProjection = {
  schemaVersion: 1,
  publicId: "game-public",
  status: "active",
  playerCount: 2,
  startingLife: 20,
  ruleset: "standard",
  isHost: true,
  eventSequence: 0,
  serverUpdatedAt: 1,
  recentOperationIds: [],
  players: [
    {
      playerId: "player-1",
      seat: 1,
      displayName: "Ada",
      color: "#111111",
      currentLife: 20,
      controlledByMe: true,
    },
    {
      playerId: "player-2",
      seat: 2,
      displayName: "Grace",
      color: "#222222",
      currentLife: 20,
      controlledByMe: false,
    },
  ],
} as const
let mockRemote: unknown = mockRemoteProjection
const mockChangeMutation = jest.fn(async (args: any) => args)
const mockUseQuery = jest.fn((_query: string, args: unknown) =>
  args === "skip" ? undefined : mockRemote,
)
function repository() {
  return new ConnectedGameRepository(undefined, "user-1", {}, connectedDeploymentScope())
}

function cacheProjection(overrides: object = {}) {
  repository().saveProjection(toConnectedProjection({ ...mockRemoteProjection, ...overrides })!)
}

function queued(operationId: string, event: object = {}): PendingLifeAction {
  return {
    schemaVersion: 1,
    queuedAt: 2,
    attempts: 0,
    event: {
      type: "life.changed",
      operationId: asOperationId(operationId),
      gameId: asGameId("game-public"),
      playerId: asPlayerId("player-1"),
      delta: 5,
      actorId: asActorId("user-1"),
      deviceId: asDeviceId("device-test-0001"),
      clientCreatedAt: 2,
      ...event,
    } as PendingLifeAction["event"],
  }
}

function queue(...actions: PendingLifeAction[]) {
  const outbox = repository().outbox("game-public")
  for (const action of actions) outbox.enqueue(action)
}

jest.mock("@/utils/telemetry", () => ({
  emitTelemetry: (...args: any[]) => mockEmitTelemetry(...args),
}))
jest.mock("@/features/game/localPersistence", () => ({
  LocalGameRepository: jest.fn(() => ({ getDeviceId: () => "device-test-0001" })),
}))
jest.mock("../../../convex/_generated/api", () => ({
  api: {
    games: {
      lobbyProjection: "lobbyProjection",
      changeLife: "changeLife",
      finishGame: "finishGame",
    },
  },
}))
jest.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: mockConvexAuthenticated,
    isLoading: false,
    isRefreshing: mockConvexRefreshing,
  }),
  useConvexConnectionState: () => ({ isWebSocketConnected: mockSocketConnected }),
  useQuery: (query: string, args: unknown) => mockUseQuery(query, args),
  useMutation: (reference: string) => {
    if (reference === "finishGame") return mockFinishMutation
    return mockChangeMutation
  },
}))

describe("useConnectedGame connection readiness", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSocketConnected = false
    mockConvexAuthenticated = true
    mockConvexRefreshing = false
    mockRemote = mockRemoteProjection
    clear()
  })

  it.each(["finished", "abandoned"])(
    "counts only an observed finished transition, not %s reloads",
    (status) => {
      const hook = renderHook(() => useConnectedGame("game-public", "user-1"))
      mockRemote = { ...mockRemoteProjection, status, eventSequence: 1, serverUpdatedAt: 2 }
      hook.rerender({})
      expect(recordReviewCompletion).toHaveBeenCalledTimes(status === "finished" ? 1 : 0)
      hook.unmount()
      renderHook(() => useConnectedGame("game-public", "user-1"))
      expect(recordReviewCompletion).toHaveBeenCalledTimes(status === "finished" ? 1 : 0)
    },
  )

  it("keeps a remote projection read-only for online-only finish while disconnected", async () => {
    const { result } = renderHook(() => useConnectedGame("game-public", "user-1"))
    expect(result.current.status).toBe("ready")
    if (result.current.status !== "ready") throw new Error("Expected a ready projection")
    expect(result.current.source).toBe("remote")
    expect(result.current.projection?.players[0].currentLife).toBe(20)
    expect(result.current.connectionStatus).toBe("offline")
    await act(async () => result.current.finish())
    expect(mockFinishMutation).not.toHaveBeenCalled()
    expect(result.current.finishError).toBe("Connect and sign in before finishing this game.")
  })

  it("asks for a rematch when the host finishes", async () => {
    mockSocketConnected = true
    const { result } = renderHook(() => useConnectedGame("game-public", "user-1"))
    await act(async () => result.current.finish({ kind: "draw" }))
    expect(mockFinishMutation).toHaveBeenCalledWith({
      publicId: "game-public",
      result: { kind: "draw" },
      rematch: {
        publicId: expect.any(String),
        inviteToken: expect.any(String),
        manualCodeCandidates: expect.any(Array),
      },
    })
  })

  it("skips the projection while auth is down and keeps showing the cached board", () => {
    mockSocketConnected = true
    mockConvexAuthenticated = false
    cacheProjection()
    const { result } = renderHook(() => useConnectedGame("game-public", "user-1"))
    expect(mockUseQuery).toHaveBeenLastCalledWith("lobbyProjection", "skip")
    expect(result.current.status).toBe("ready")
    if (result.current.status !== "ready") throw new Error("Expected a ready projection")
    expect(result.current.source).toBe("cache")
    expect(result.current.connectionStatus).toBe("offline")
  })

  it("recovers owner-scoped cached projection and pending overlay on an offline cold mount", () => {
    mockRemote = undefined
    cacheProjection({ eventSequence: 2, serverUpdatedAt: 2 })
    queue(queued("operation-cold-offline"))
    const { result } = renderHook(() => useConnectedGame("game-public", "user-1"))
    expect(result.current.status).toBe("ready")
    if (result.current.status !== "ready") throw new Error("Expected a ready projection")
    expect(result.current.source).toBe("cache")
    expect(result.current.projection?.players[0].currentLife).toBe(25)
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.connectionStatus).toBe("offline")
    expect(mockChangeMutation).not.toHaveBeenCalled()
  })

  it("does not drain the outbox while Convex refreshes authentication", async () => {
    mockSocketConnected = true
    mockConvexRefreshing = true
    queue(queued("operation-refreshing"))

    renderHook(() => useConnectedGame("game-public", "user-1"))
    await act(async () => Promise.resolve())

    expect(mockChangeMutation).not.toHaveBeenCalled()
  })

  it("keeps one optimistic delta until the projection includes its operation status", () => {
    const view = renderHook(() => useConnectedGame("game-public", "user-1"))
    act(() => view.result.current.changeLife("player-1", 5))
    const operationId = view.result.current.pending[0].event.operationId
    const committed = {
      ...mockRemoteProjection,
      eventSequence: 1,
      serverUpdatedAt: 2,
      players: mockRemoteProjection.players.map((player) => ({
        ...player,
        currentLife: player.seat === 1 ? 25 : 20,
      })),
    }
    mockRemote = committed
    view.rerender({})
    expect(view.result.current.projection?.players[0].currentLife).toBe(25)
    expect(view.result.current.pending).toHaveLength(1)
    mockRemote = {
      ...committed,
      operationStatus: { status: "acknowledged", operationId, projectionEventSequence: 1 },
    }
    view.rerender({})
    expect(view.result.current.projection?.players[0].currentLife).toBe(25)
    expect(view.result.current.pending).toEqual([])
  })

  it("surfaces outbox backpressure without mutating the displayed projection", () => {
    queue(
      ...Array.from({ length: 128 }, (_, index) =>
        queued(`operation-backlog-${String(index).padStart(4, "0")}`, {
          playerId: asPlayerId("player-2"),
          delta: 1,
        }),
      ),
    )
    mockRemote = {
      ...mockRemoteProjection,
      operationStatus: { status: "not_found", operationId: "operation-backlog-0000" },
    }
    const { result } = renderHook(() => useConnectedGame("game-public", "user-1"))

    act(() => result.current.changeLife("player-1", 5))

    expect(result.current.projection?.players[0].currentLife).toBe(20)
    expect(result.current.pending).toHaveLength(128)
    expect(result.current.changeError).toMatch(/pending changes is full/i)
  })

  it("retries a transient drain failure on backoff without unrelated state changes", async () => {
    jest.useFakeTimers()
    mockSocketConnected = true
    queue(queued("operation-retry-000001"))
    mockRemote = {
      ...mockRemoteProjection,
      operationStatus: { status: "not_found", operationId: "operation-retry-000001" },
    }
    mockChangeMutation.mockRejectedValueOnce(new Error("Network request failed"))
    const view = renderHook(() => useConnectedGame("game-public", "user-1"))
    await waitFor(() => expect(mockChangeMutation).toHaveBeenCalledTimes(1))
    await act(async () => {
      jest.advanceTimersByTime(500)
      await Promise.resolve()
    })
    await waitFor(() => expect(mockChangeMutation).toHaveBeenCalledTimes(2))
    view.unmount()
    jest.useRealTimers()
  })

  it("acknowledges a queued claim resolution under its own operation id", async () => {
    mockSocketConnected = true
    queue(
      queued("resolution-op-000001", {
        type: "commanderDamage.resolved",
        claimOperationId: asOperationId("commander-claim-000001"),
        toPlayerId: asPlayerId("player-1"),
        accepted: true,
        playerId: undefined,
        delta: undefined,
      }),
    )
    mockRemote = {
      ...mockRemoteProjection,
      operationStatus: { status: "not_found", operationId: "resolution-op-000001" },
    }
    const view = renderHook(() => useConnectedGame("game-public", "user-1"))
    await waitFor(() =>
      expect(mockChangeMutation).toHaveBeenCalledWith(
        expect.objectContaining({ operationId: "commander-claim-000001" }),
      ),
    )

    mockRemote = {
      ...mockRemoteProjection,
      operationStatus: {
        status: "acknowledged",
        operationId: "resolution-op-000001",
        projectionEventSequence: 0,
      },
    }
    view.rerender({})

    await waitFor(() => expect(view.result.current.pending).toEqual([]))
    expect(view.result.current.failed).toEqual([])
    view.unmount()
  })

  it("emits reconnect readiness once after a disconnected to confirmed-ready transition", async () => {
    const view = renderHook(() => useConnectedGame("game-public", "user-1"))
    expect(mockEmitTelemetry).not.toHaveBeenCalled()
    mockSocketConnected = true
    view.rerender(undefined)
    await waitFor(() =>
      expect(mockEmitTelemetry).toHaveBeenCalledWith("reconnect.ready", {
        outcome: "success",
        pendingCount: 0,
      }),
    )
    view.rerender(undefined)
    expect(mockEmitTelemetry).toHaveBeenCalledTimes(1)
  })

  it("declares the board unavailable only after staying offline without cache or remote", async () => {
    jest.useFakeTimers()
    mockRemote = undefined
    const hook = renderHook(() => useConnectedGame("game-public", "user-1"))
    expect(hook.result.current).toMatchObject({ status: "loading", projection: null })
    expect(mockChangeMutation).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(CONNECTED_GAME_UNAVAILABLE_MS - 1))
    expect(hook.result.current.status).toBe("loading")
    act(() => jest.advanceTimersByTime(1))
    expect(hook.result.current.status).toBe("unavailable")
    if (hook.result.current.status !== "unavailable") throw new Error("Expected unavailable")
    expect(hook.result.current.message).toContain("Reconnect")
    mockSocketConnected = true
    hook.rerender(undefined)
    await waitFor(() => expect(hook.result.current.status).toBe("loading"))
    mockRemote = mockRemoteProjection
    hook.rerender(undefined)
    expect(hook.result.current.status).toBe("ready")
    hook.unmount()
    jest.useRealTimers()
  })
})
