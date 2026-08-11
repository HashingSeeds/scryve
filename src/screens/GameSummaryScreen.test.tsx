import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"

import { asPlayerId } from "@/features/game/domain"
import type { GameEvent, LocalGame } from "@/features/game/types"
import { ThemeProvider } from "@/theme/context"

import type { ConnectedSummaryDocument } from "./gameSummary"
import {
  connectedChanges,
  connectedSummaryModel,
  localChanges,
  localSummaryModel,
} from "./gameSummary"
import { GameSummaryScreen } from "./GameSummaryScreen"

const CREATED_AT = new Date("2026-08-10T22:50:00Z").getTime()
const FINISHED_AT = CREATED_AT + 34 * 60 * 1000

function themed(children: ReactNode) {
  return <ThemeProvider initialContext="light">{children}</ThemeProvider>
}

function lifeChange(index: number, overrides: Record<string, unknown> = {}): GameEvent {
  return {
    type: "life.changed",
    operationId: `op-${index}`,
    gameId: "game-1",
    actorId: "actor-1",
    deviceId: "device-1",
    clientCreatedAt: CREATED_AT + index * 1000,
    playerId: "p1",
    delta: -1,
    ...overrides,
  } as GameEvent
}

function localGame(overrides: Partial<LocalGame> = {}): LocalGame {
  return {
    schemaVersion: 1,
    id: "game-1",
    status: "finished",
    startingLife: 20,
    createdAt: CREATED_AT,
    updatedAt: FINISHED_AT,
    finishedAt: FINISHED_AT,
    players: [
      { id: "p1", name: "Ada", color: "#7C3AED", life: 3, seat: 1 },
      { id: "p2", name: "Grace", color: "#2563EB", life: 20, seat: 2 },
    ],
    events: [],
    ...overrides,
  } as LocalGame
}

function connectedSummary(
  overrides: Partial<ConnectedSummaryDocument> = {},
): ConnectedSummaryDocument {
  return {
    terminalStatus: "finished",
    startingLife: 40,
    ruleset: "commander",
    eventCount: 48,
    finishedAt: FINISHED_AT,
    players: [
      {
        playerId: "cp1",
        seat: 1,
        displayName: "Player",
        usernameAtFinish: "mchisolm0",
        color: "#2563EB",
        finalLife: -1,
        outcome: "loss",
      },
      {
        playerId: "cp2",
        seat: 2,
        displayName: "Player",
        usernameAtFinish: "token",
        deckNameAtFinish: "Krenko",
        deckVersionNumber: 3,
        color: "#7C3AED",
        finalLife: 7,
        outcome: "win",
      },
    ],
    ...overrides,
  }
}

function renderLocal(game = localGame(), eventsTruncated = false) {
  render(
    themed(
      <GameSummaryScreen
        model={localSummaryModel(game)}
        changes={{ changes: localChanges(game), olderEventsDropped: eventsTruncated }}
        onBack={jest.fn()}
      />,
    ),
  )
}

describe("game summary", () => {
  it("summarises a local game above its life totals", () => {
    renderLocal()

    expect(screen.getByText("Finished")).toBeTruthy()
    expect(screen.getByText("2 players · 20 life · 34 min · 0 life changes")).toBeTruthy()
    expect(screen.getByText("Final life totals")).toBeTruthy()
  })

  it("shows each player's final life and swing from the starting total", () => {
    renderLocal()

    expect(screen.getByText("3")).toBeTruthy()
    expect(screen.getByText("-17 from start")).toBeTruthy()
    expect(screen.getByText("even")).toBeTruthy()
  })

  it("keeps the life-change timeline collapsed until asked for", () => {
    renderLocal(localGame({ events: [lifeChange(1, { delta: -2 })] }))

    expect(screen.getByText("Life changes · 1")).toBeTruthy()
    expect(screen.queryByText("-2")).toBeNull()

    fireEvent.press(screen.getByTestId("summary-timeline-toggle"))

    expect(screen.getByText("-2")).toBeTruthy()
  })

  it("marks undo entries once the timeline is open", () => {
    renderLocal(
      localGame({
        events: [
          lifeChange(1, { delta: -2 }),
          lifeChange(2, { delta: 2, compensatesOperationId: "op-1" }),
        ],
      }),
    )

    fireEvent.press(screen.getByTestId("summary-timeline-toggle"))

    expect(screen.getByText("undo")).toBeTruthy()
    expect(screen.getByText(/Undo stays in the record/)).toBeTruthy()
  })

  it("states plainly when no life changes were recorded", () => {
    renderLocal()

    expect(screen.getByText("No life changes were recorded.")).toBeTruthy()
    expect(screen.getByTestId("summary-timeline-toggle").props.accessibilityState.disabled).toBe(
      true,
    )
  })

  it("ranks a local game by the winner its host recorded", () => {
    renderLocal(localGame({ result: { kind: "win", winnerPlayerIds: [asPlayerId("p2")] } }))

    expect(screen.getByText("Result")).toBeTruthy()
    expect(screen.getByLabelText("Winner, Grace, 20 life")).toBeTruthy()
    expect(screen.getByLabelText("Loss, Ada, 3 life")).toBeTruthy()
  })

  it("shows a local draw as a draw for everyone", () => {
    renderLocal(localGame({ result: { kind: "draw" } }))

    expect(screen.getByLabelText("Draw, Ada, 3 life")).toBeTruthy()
    expect(screen.getByLabelText("Draw, Grace, 20 life")).toBeTruthy()
  })

  it("ranks a connected game by recorded result and names the winner's deck", () => {
    render(
      themed(
        <GameSummaryScreen
          model={connectedSummaryModel(connectedSummary())}
          changes={{ changes: [] }}
          onBack={jest.fn()}
        />,
      ),
    )

    expect(screen.getByText("Result")).toBeTruthy()
    expect(screen.getByText("@token · Krenko v3")).toBeTruthy()
    expect(screen.getByLabelText("Winner, Player, 7 life")).toBeTruthy()
    expect(screen.getByLabelText("Loss, Player, -1 life")).toBeTruthy()
    expect(screen.getByText("2 players · commander · 48 life changes")).toBeTruthy()
  })

  it("says when a connected game finished without a recorded winner", () => {
    render(
      themed(
        <GameSummaryScreen
          model={connectedSummaryModel(
            connectedSummary({
              players: connectedSummary().players.map((player) => ({
                ...player,
                outcome: "unknown" as const,
              })),
            }),
          )}
          onBack={jest.fn()}
        />,
      ),
    )

    expect(screen.getByText("Final life totals")).toBeTruthy()
    expect(screen.getByText("No winner was recorded for this game.")).toBeTruthy()
  })

  it("requests connected events only when the timeline is expanded", () => {
    const onExpand = jest.fn()
    render(
      themed(
        <GameSummaryScreen
          model={connectedSummaryModel(connectedSummary())}
          changes={{ changes: [], onExpand, canLoadMore: true, loadMore: jest.fn() }}
          onBack={jest.fn()}
        />,
      ),
    )

    expect(onExpand).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId("summary-timeline-toggle"))

    expect(onExpand).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Load older changes" })).toBeTruthy()
  })

  it("maps connected life events onto their players", () => {
    const changes = connectedChanges([
      { operationId: "e1", playerId: "cp2", kind: "life.changed", delta: -3 },
      { operationId: "e2", playerId: "cp2", kind: "game.finished" },
    ])
    render(
      themed(
        <GameSummaryScreen
          model={connectedSummaryModel(connectedSummary())}
          changes={{ changes }}
          onBack={jest.fn()}
        />,
      ),
    )

    fireEvent.press(screen.getByTestId("summary-timeline-toggle"))

    expect(changes).toHaveLength(1)
    expect(screen.getByText("-3")).toBeTruthy()
  })

  it("waits for a connected summary before claiming the game is missing", () => {
    render(themed(<GameSummaryScreen model={null} loading onBack={jest.fn()} />))

    expect(screen.getByText("Loading final summary…")).toBeTruthy()
    expect(screen.queryByText("Game not found")).toBeNull()
  })

  it("keeps a deleted game recoverable with an explanation", () => {
    render(themed(<GameSummaryScreen model={null} onBack={jest.fn()} />))

    expect(screen.getByText("Game not found")).toBeTruthy()
  })
})
