import { act, renderHook, waitFor } from "@testing-library/react-native"

import { mergeDrainSnapshot, useConnectedGame } from "./useConnectedGame"

const mockFinishMutation = jest.fn(async () => undefined)
const mockDrain = jest.fn()
const mockEmitTelemetry = jest.fn()
let mockSocketConnected = false
let mockPending: any[] = []
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
const mockChangeMutation = Object.assign(
  jest.fn(async (args: any) => args),
  {
    withOptimisticUpdate: jest.fn(),
  },
)
const mockRepository = {
  loadProjection: jest.fn((): any => null),
  saveProjection: jest.fn(),
  loadOutbox: jest.fn(() => mockPending),
  loadFailed: jest.fn(() => []),
  enqueue: jest.fn((_action, current): any => ({ accepted: true, pending: current ?? [] })),
  acknowledge: jest.fn(),
  updateAttempt: jest.fn(),
  fail: jest.fn(),
  dismissFailed: jest.fn(),
  cleanupTerminalGame: jest.fn(),
}

jest.mock("./drainOutbox", () => ({
  drainConnectedOutbox: (...args: any[]) => mockDrain(...args),
}))
jest.mock("@/utils/telemetry", () => ({
  emitTelemetry: (...args: any[]) => mockEmitTelemetry(...args),
}))
jest.mock("@/features/game/localPersistence", () => ({
  LocalGameRepository: jest.fn(() => ({ getDeviceId: () => "device-test-0001" })),
}))
jest.mock("./persistence", () => ({
  ConnectedGameRepository: jest.fn(() => mockRepository),
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
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useConvexConnectionState: () => ({ isWebSocketConnected: mockSocketConnected }),
  useQuery: () => mockRemote,
  useMutation: (reference: string) => {
    if (reference === "finishGame") return mockFinishMutation
    mockChangeMutation.withOptimisticUpdate.mockReturnValue(mockChangeMutation)
    return mockChangeMutation
  },
}))

describe("useConnectedGame connection readiness", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSocketConnected = false
    mockRemote = mockRemoteProjection
    mockPending = []
    mockRepository.loadProjection.mockReturnValue(null)
    mockRepository.enqueue.mockImplementation((_action, current) => ({
      accepted: true,
      pending: [...(current ?? []), _action],
    }))
    mockDrain.mockResolvedValue({ acknowledged: [], failed: [], stoppedForRetry: false })
  })

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

  it("recovers owner-scoped cached projection and pending overlay on an offline cold mount", () => {
    mockRemote = undefined
    mockRepository.loadProjection.mockReturnValueOnce({
      ...mockRemoteProjection,
      eventSequence: 2,
      serverUpdatedAt: 2,
    })
    mockPending = [
      {
        schemaVersion: 1,
        queuedAt: 2,
        attempts: 0,
        event: {
          type: "life.changed",
          operationId: "operation-cold-offline",
          gameId: "game-public",
          playerId: "player-1",
          delta: 5,
          actorId: "user-1",
          deviceId: "device-test-0001",
          clientCreatedAt: 2,
        },
      },
    ]
    const { result } = renderHook(() => useConnectedGame("game-public", "user-1"))
    expect(result.current.status).toBe("ready")
    if (result.current.status !== "ready") throw new Error("Expected a ready projection")
    expect(result.current.source).toBe("cache")
    expect(result.current.projection?.players[0].currentLife).toBe(25)
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.connectionStatus).toBe("offline")
    expect(mockDrain).not.toHaveBeenCalled()
  })

  it("keeps a no-cache board loading until the first remote projection arrives", () => {
    mockRemote = undefined

    const { result } = renderHook(() => useConnectedGame("game-public", "user-1"))

    expect(result.current).toMatchObject({ status: "loading", projection: null })
    expect(mockDrain).not.toHaveBeenCalled()
  })

  it("surfaces outbox backpressure without mutating the displayed projection", () => {
    mockRepository.enqueue.mockReturnValueOnce({
      accepted: false,
      reason: "record_limit",
      pending: [],
    })
    const { result } = renderHook(() => useConnectedGame("game-public", "user-1"))

    act(() => result.current.changeLife("player-1", 5))

    expect(result.current.projection?.players[0].currentLife).toBe(20)
    expect(result.current.pending).toEqual([])
    expect(result.current.changeError).toMatch(/pending changes is full/i)
  })

  it("retries a transient drain failure on backoff without unrelated state changes", async () => {
    jest.useFakeTimers()
    mockSocketConnected = true
    mockPending = [{ attempts: 0, event: { operationId: "operation-retry" } }]
    mockDrain
      .mockResolvedValueOnce({ acknowledged: [], failed: [], stoppedForRetry: true })
      .mockResolvedValueOnce({
        acknowledged: ["operation-retry"],
        failed: [],
        stoppedForRetry: false,
      })
    const view = renderHook(() => useConnectedGame("game-public", "user-1"))
    await waitFor(() => expect(mockDrain).toHaveBeenCalledTimes(1))
    await act(async () => {
      jest.advanceTimersByTime(500)
      await Promise.resolve()
    })
    await waitFor(() => expect(mockDrain).toHaveBeenCalledTimes(2))
    view.unmount()
    jest.useRealTimers()
  })

  it("does not overwrite a tap queued while an in-flight drain settles", () => {
    const draining = {
      schemaVersion: 1,
      queuedAt: 1,
      attempts: 0,
      event: {
        type: "life.changed",
        operationId: "operation-already-draining",
        gameId: "game-public",
        playerId: "player-1",
        delta: 1,
        actorId: "user-1",
        deviceId: "device-test-0001",
        clientCreatedAt: 1,
      },
    } as any
    const queuedDuringDrain = {
      ...draining,
      queuedAt: 2,
      event: { ...draining.event, operationId: "operation-queued-during-drain", delta: 5 },
    }
    const merged = mergeDrainSnapshot(
      [draining, queuedDuringDrain],
      new Set([draining.event.operationId]),
      [],
      [],
      new Set(),
    )
    expect(merged.pending.map((action) => action.event.operationId)).toEqual([
      "operation-queued-during-drain",
    ])
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
})
