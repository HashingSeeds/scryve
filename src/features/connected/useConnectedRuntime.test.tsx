import { act, renderHook, waitFor } from "@testing-library/react-native"

import type { PendingLifeAction } from "./model"
import {
  useConnectedRuntime,
  useConnectedSession,
  type ConnectedFeed,
  type ConnectedWrites,
} from "./useConnectedRuntime"

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
