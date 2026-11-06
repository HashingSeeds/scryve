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
import {
  counterLog,
  gameLog,
  LifeLog,
  LifeLogContext,
  lifeLog,
  localLifeChanges,
  mergedLog,
} from "./LifeLog"
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

  it("lists the whole game newest first with each seat's resulting total, commander damage by its source, and no undone change", () => {
    const pod = createLocalGame({
      gameId: asGameId("pod"),
      system: "mtg",
      format: "commander",
      startingLife: 40,
      players: [
        { name: "Ada", color: "#000" },
        { name: "Grace", color: "#fff" },
      ],
    })
    const [ada, grace] = pod.players.map(({ id }) => id)
    const commands: GameCommand[] = [
      { type: "life.change", playerId: ada, delta: -3 },
      { type: "commanderDamage.assign", fromPlayerId: grace, toPlayerId: ada, delta: 5 },
      { type: "life.change", playerId: grace, delta: 2 },
      { type: "life.change", playerId: ada, delta: -1 },
      { type: "life.undo" },
    ]
    const game = commands.reduce((state, command) => applyGameCommand(state, command, context), pod)

    expect(
      gameLog(game.players, game.events).map(({ playerId, delta, life, fromPlayerId }) => [
        playerId,
        delta,
        life,
        fromPlayerId,
      ]),
    ).toEqual([
      [grace, 2, 42, undefined],
      [ada, -5, 32, grace],
      [ada, -3, 37, undefined],
    ])
  })

  it("reads a burst of quick taps on one seat as one change at its last tap, and drops a burst that nets to nothing", () => {
    const duel = createLocalGame({
      gameId: asGameId("burst"),
      system: "mtg",
      startingLife: 20,
      players: [
        { name: "Ada", color: "#000" },
        { name: "Grace", color: "#fff" },
      ],
    })
    const [ada, grace] = duel.players.map(({ id }) => id)
    const at = (now: number): CommandContext => ({ ...context, now: () => now })
    const taps: [number, GameCommand][] = [
      [0, { type: "life.change", playerId: ada, delta: -1 }],
      [1000, { type: "life.change", playerId: ada, delta: -1 }],
      [2000, { type: "life.change", playerId: ada, delta: -1 }],
      [5000, { type: "life.change", playerId: ada, delta: -1 }],
      [5500, { type: "life.change", playerId: grace, delta: 1 }],
      [6000, { type: "life.change", playerId: grace, delta: -1 }],
    ]
    const game = taps.reduce(
      (state, [now, command]) => applyGameCommand(state, command, at(now)),
      duel,
    )

    expect(
      gameLog(game.players, game.events).map(({ delta, life, at }) => [delta, life, at]),
    ).toEqual([
      [-1, 16, 5000],
      [-3, 17, 2000],
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

describe("counter log rows", () => {
  const ada = asPlayerId("ada")
  const entry = (
    operationId: string,
    counterId: string,
    delta: number,
    value: number,
    at: number,
  ) => ({
    operationId,
    playerId: ada,
    counterId,
    delta,
    value,
    at,
  })

  it("folds quick taps on one counter, keeps other counters apart, and sorts in with life", () => {
    const rows = counterLog([
      entry("a", "poison", 1, 1, 1_000),
      entry("b", "poison", 1, 2, 1_500),
      entry("c", "custom:Speed", 1, 1, 1_600),
      entry("d", "custom:Speed", -1, 0, 9_000),
    ])
    expect(rows.map(({ counterId, delta, value }) => [counterId, delta, value])).toEqual([
      ["custom:Speed", -1, 0],
      ["custom:Speed", 1, 1],
      ["poison", 2, 2],
    ])
    const life = [
      { id: "life", playerId: ada, delta: -3, life: 37, at: 1_550, operationIds: ["life"] },
    ]
    expect(mergedLog(life, rows).map(({ at }) => at)).toEqual([9_000, 1_600, 1_550, 1_500])
  })
})
