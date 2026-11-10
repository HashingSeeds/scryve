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
  withModeRows,
  withTurnDividers,
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

  it("places Planechase and Archenemy entries among life changes by sequence, under the turn they happened in", () => {
    const ada = asPlayerId("ada")
    const life = { id: "hit", playerId: ada, delta: -2, life: 18, at: 3_000, operationIds: ["hit"] }
    const mode = (id: string, at: number) => ({
      kind: "mode" as const,
      id,
      playerId: ada,
      at,
      text: id,
      operationIds: [id],
    })
    const turns = [{ operationId: "turn-2", playerId: ada, number: 2, at: 2_000 }]
    const sequence = ["scheme", "turn-2", "hit", "roll"]
    const positionOf = (id: string) => sequence.indexOf(id)

    expect(
      withTurnDividers(
        withModeRows([life], [mode("scheme", 1_000), mode("roll", 2_500)], positionOf),
        turns,
        positionOf,
      ).map((item) => (item.kind === "turn" ? `turn ${item.number}` : item.id)),
    ).toEqual(["turn 2", "roll", "hit", "scheme"])
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
    const sequence = ["a", "b", "life", "c", "d"]
    expect(mergedLog(life, rows, (id) => sequence.indexOf(id)).map(({ at }) => at)).toEqual([
      9_000, 1_600, 1_550, 1_500,
    ])
  })

  it("folds Speed and speed as one named counter, as the table counts them", () => {
    const rows = counterLog([
      entry("a", "custom:Speed", -1, 0, 1_000),
      entry("b", "custom:speed", 1, 1, 1_500),
    ])
    expect(rows.map(({ delta, operationIds }) => [delta, operationIds])).toEqual([])
    expect(
      counterLog([
        entry("a", "custom:Speed", 1, 2, 1_000),
        entry("b", "custom:speed", 1, 3, 1_500),
      ]).map(({ delta, value }) => [delta, value]),
    ).toEqual([[2, 3]])
  })
})
