import { View } from "react-native"
import { render } from "@testing-library/react-native"
import { usePaginatedQuery } from "convex/react"

import type { PendingLifeAction } from "@/features/connected/model"

import {
  applyGameCommand,
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  asPlayerId,
  createLocalGame,
} from "./domain"
import { LifeLog, LifeLogContext, lifeLog, localLifeChanges } from "./LifeLog"
import type { CommandContext, GameCommand } from "./types"

jest.mock("convex/react", () => ({ usePaginatedQuery: jest.fn() }))

let sequence = 0
const context: CommandContext = {
  actorId: asActorId("local"),
  deviceId: asDeviceId("device"),
  now: () => 100 + sequence,
  operationId: () => asOperationId(`op-${++sequence}`),
}

describe("life log", () => {
  it("walks a seat's changes back from its total to the start, leaving out undone changes and other seats", () => {
    const duel = createLocalGame({
      gameId: asGameId("game"),
      system: "ygo",
      startingLife: 8000,
      players: [
        { name: "Yugi", color: "#000" },
        { name: "Kaiba", color: "#fff" },
      ],
    })
    const [yugi, kaiba] = duel.players.map(({ id }) => id)
    const commands: GameCommand[] = [
      { type: "life.change", playerId: yugi, delta: -2000 },
      { type: "life.change", playerId: kaiba, delta: -500 },
      { type: "life.change", playerId: yugi, delta: -1200 },
      { type: "life.change", playerId: yugi, delta: -300 },
      { type: "life.undo" },
      { type: "life.change", playerId: yugi, delta: 1000 },
    ]
    const game = commands.reduce(
      (state, command) => applyGameCommand(state, command, context),
      duel,
    )

    const steps = lifeLog(game.players[0].life, localLifeChanges(game.events, yugi))

    expect(steps.map(({ delta, life }) => [delta, life])).toEqual([
      [undefined, 8000],
      [-2000, 6000],
      [-1200, 4800],
      [1000, 5800],
    ])
  })

  it("adds a connected seat's unsent changes to the synced ones without counting a change twice", () => {
    const synced = (operationId: string, delta: number) => ({
      operationId,
      playerId: "yugi",
      kind: "life.changed",
      delta,
    })
    jest.mocked(usePaginatedQuery).mockReturnValue({
      results: [synced("sent", -1200), synced("first", -2000)],
      status: "Exhausted",
      isLoading: false,
      loadMore: jest.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>)
    const unsent = (operationId: string, delta: number): PendingLifeAction => ({
      schemaVersion: 1,
      queuedAt: 1,
      attempts: 0,
      event: {
        type: "life.changed",
        operationId: asOperationId(operationId),
        gameId: asGameId("duel"),
        actorId: asActorId("yugi"),
        deviceId: asDeviceId("device"),
        clientCreatedAt: 1,
        playerId: asPlayerId("yugi"),
        delta,
      },
    })

    const view = render(
      <LifeLogContext.Provider
        value={{
          kind: "connected",
          publicId: "duel",
          pending: [unsent("sent", -1200), unsent("offline", 500)],
        }}
      >
        <LifeLog playerId="yugi" life={5300}>
          {(steps) => (
            <View testID="log" accessibilityLabel={steps.map(({ life }) => life).join(" ")} />
          )}
        </LifeLog>
      </LifeLogContext.Provider>,
    )

    expect(view.getByTestId("log")).toHaveProp("accessibilityLabel", "8000 6000 4800 5300")
  })
})
