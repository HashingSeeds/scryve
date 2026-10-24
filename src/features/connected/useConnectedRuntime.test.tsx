import { act, renderHook, waitFor } from "@testing-library/react-native"

import { captureGame } from "@/utils/analytics"

import type { PendingLifeAction } from "./model"
import {
  useConnectedRuntime,
  useConnectedSession,
  type ConnectedFeed,
  type ConnectedWrites,
} from "./useConnectedRuntime"

jest.mock("@/utils/analytics", () => ({ captureGame: jest.fn() }))

const projection = {
  schemaVersion: 1,
  publicId: "nearby-game",
  status: "active",
  playerCount: 2,
  startingLife: 20,
  ruleset: "standard",
  isHost: false,
  eventSequence: 0,
  serverUpdatedAt: 1,
  recentOperationIds: [],
  players: [
    {
      playerId: "seat-1",
      seat: 1,
      displayName: "Ada",
      color: "#111111",
      currentLife: 20,
      controlledByMe: true,
    },
    {
      playerId: "seat-2",
      seat: 2,
      displayName: "Grace",
      color: "#222222",
      currentLife: 20,
      controlledByMe: false,
    },
  ],
}

const reachable: ConnectedFeed["environment"] = {
  isAuthenticated: true,
  isLoading: false,
  isRefreshing: false,
  isWebSocketConnected: true,
  remoteReady: true,
}

describe("connected runtime over any backend", () => {
  it("shows the authority's projection and sends queued changes through its writes", async () => {
    const sent: PendingLifeAction[] = []
    let acknowledge = () => {}
    const writes: ConnectedWrites = {
      send: (action) => {
        sent.push(action)
        return new Promise((resolve) => {
          acknowledge = () => resolve({ operationId: action.event.operationId })
        })
      },
      finish: async () => undefined,
      abandon: async () => undefined,
    }
    const { result } = renderHook(() => {
      const session = useConnectedSession({
        publicId: "nearby-game",
        ownerId: "seat-1",
        scope: "lan",
        writes,
        awaitProjectionBarrier: false,
      })
      return useConnectedRuntime(session, { remote: projection, environment: reachable })
    })

    await waitFor(() => expect(result.current.status).toBe("ready"))
    act(() => result.current.changeLife("seat-1", -3))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].event).toMatchObject({ type: "life.changed", playerId: "seat-1", delta: -3 })
    expect(result.current.projection?.players[0].pendingDelta).toBe(-3)

    await act(async () => acknowledge())
    await waitFor(() => expect(result.current.pending).toEqual([]))
  })
})

describe("connected runtime without a projection barrier", () => {
  it("keeps taking the authority's projections while its own changes are pending", async () => {
    const writes: ConnectedWrites = {
      send: () => new Promise(() => {}),
      finish: async () => undefined,
      abandon: async () => undefined,
    }
    const { result, rerender } = renderHook(
      ({ remote }: { remote: unknown }) => {
        const session = useConnectedSession({
          publicId: "nearby-game",
          ownerId: "seat-1",
          scope: "lan",
          writes,
          awaitProjectionBarrier: false,
        })
        return useConnectedRuntime(session, { remote, environment: reachable })
      },
      { initialProps: { remote: projection as unknown } },
    )
    await waitFor(() => expect(result.current.status).toBe("ready"))
    act(() => result.current.changeLife("seat-1", -3))
    await waitFor(() => expect(result.current.pending).toHaveLength(1))

    rerender({
      remote: {
        ...projection,
        status: "abandoned",
        eventSequence: 1,
        serverUpdatedAt: 2,
        players: [{ ...projection.players[0] }, { ...projection.players[1], currentLife: 12 }],
      },
    })

    await waitFor(() => expect(result.current.projection?.status).toBe("abandoned"))
    expect(result.current.projection?.players[1].currentLife).toBe(12)
  })
})

describe("connected runtime analytics", () => {
  const writes: ConnectedWrites = {
    send: async (action) => ({ operationId: action.event.operationId }),
    finish: async () => undefined,
    abandon: async () => undefined,
  }
  const renderGame = (publicId: string, remote: unknown) =>
    renderHook(() => {
      const session = useConnectedSession({
        publicId,
        ownerId: "seat-1",
        scope: "cloud-test",
        writes,
        awaitProjectionBarrier: false,
      })
      return useConnectedRuntime(session, { remote, environment: reachable })
    })
  const started = () =>
    jest.mocked(captureGame).mock.calls.filter(([event]) => event === "game_started")

  it("records a rematch start once, since rematches skip the lobby", async () => {
    const finished = renderGame("game-one", {
      ...projection,
      publicId: "game-one",
      status: "finished",
      rematchPublicId: "game-two",
    })
    await waitFor(() => expect(finished.result.current.status).toBe("ready"))
    finished.unmount()

    for (let mount = 0; mount < 2; mount += 1) {
      const rematch = renderGame("game-two", { ...projection, publicId: "game-two" })
      await waitFor(() => expect(rematch.result.current.status).toBe("ready"))
      rematch.unmount()
    }

    expect(started()).toEqual([
      [
        "game_started",
        { id: "game-two", system: "mtg", format: "standard", playerCount: 2 },
        "connected",
      ],
    ])
  })

  it("does not record a start when resuming a game that was already active", async () => {
    const resumed = renderGame("game-three", { ...projection, publicId: "game-three" })
    await waitFor(() => expect(resumed.result.current.status).toBe("ready"))

    expect(started().some(([, game]) => game.id === "game-three")).toBe(false)
  })
})
