import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"

import { asPlayerId } from "@/features/game/domain"
import { counterChangeLabel } from "@/features/game/playSystems"
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
      { id: "p1", name: "Ada", color: "#7C3AED", life: 3, seat: 0 },
      { id: "p2", name: "Grace", color: "#2563EB", life: 20, seat: 1 },
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
  const model = localSummaryModel(game)
  render(
    themed(
      <GameSummaryScreen
        summary={{ status: "ready", value: model }}
        timeline={{
          status: "ready",
          items: localChanges(game),
          nextPage: { status: "exhausted" },
          olderEventsDropped: eventsTruncated,
        }}
        onBack={jest.fn()}
      />,
    ),
  )
}

describe("game summary", () => {
  it("uses the system's singular lowercase counter noun in change metadata", () => {
    expect(counterChangeLabel("ygo", 1)).toBe("1 life point change")
    expect(counterChangeLabel("ygo", -1)).toBe("-1 life point change")
    expect(counterChangeLabel("pokemon", 2)).toBe("2 prize cards changes")
  })

  it("summarises a local game above its life totals", () => {
    renderLocal()

    expect(screen.getByText("Finished")).toBeTruthy()
    expect(screen.getByText("2 players · 20 life · 34 min · 0 life changes")).toBeTruthy()
    expect(screen.getByText("Final Life")).toBeTruthy()
  })

  it("numbers local seats for humans, starting at one like the board does", () => {
    renderLocal()

    expect(screen.getByText("Seat 1")).toBeTruthy()
    expect(screen.getByText("Seat 2")).toBeTruthy()
    expect(screen.queryByText("Seat 0")).toBeNull()
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
          summary={{ status: "ready", value: connectedSummaryModel(connectedSummary()) }}
          timeline={{ status: "ready", items: [], nextPage: { status: "exhausted" } }}
          onBack={jest.fn()}
        />,
      ),
    )

    expect(screen.getByText("Result")).toBeTruthy()
    expect(screen.getByText("@token · Krenko v3")).toBeTruthy()
    expect(screen.getByLabelText("Winner, Player, 7 life")).toBeTruthy()
    expect(screen.getByLabelText("Loss, Player, -1 life")).toBeTruthy()
    expect(screen.getByText("2 players · Commander · 48 life changes")).toBeTruthy()
  })

  it("says when a connected game finished without a recorded winner", () => {
    render(
      themed(
        <GameSummaryScreen
          summary={{
            status: "ready",
            value: connectedSummaryModel(
              connectedSummary({
                players: connectedSummary().players.map((player) => ({
                  ...player,
                  outcome: "unknown" as const,
                })),
              }),
            ),
          }}
          timeline={{ status: "unavailable" }}
          onBack={jest.fn()}
        />,
      ),
    )

    expect(screen.getByText("Final Life")).toBeTruthy()
    expect(screen.getByText("No winner was recorded for this game.")).toBeTruthy()
  })

  it("requests connected events only when the timeline is expanded", () => {
    const onExpand = jest.fn()
    render(
      themed(
        <GameSummaryScreen
          summary={{ status: "ready", value: connectedSummaryModel(connectedSummary()) }}
          timeline={{ status: "idle", request: onExpand }}
          onBack={jest.fn()}
        />,
      ),
    )

    expect(onExpand).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId("summary-timeline-toggle"))

    expect(onExpand).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("summary-timeline-loading")).toBeTruthy()
  })

  it("maps connected life events onto their players", () => {
    const changes = connectedChanges([
      { operationId: "e1", playerId: "cp2", kind: "life.changed", delta: -3 },
      { operationId: "e2", playerId: "cp2", kind: "game.finished" },
    ])
    render(
      themed(
        <GameSummaryScreen
          summary={{ status: "ready", value: connectedSummaryModel(connectedSummary()) }}
          timeline={{
            status: "ready",
            items: changes,
            nextPage: { status: "exhausted" },
          }}
          onBack={jest.fn()}
        />,
      ),
    )

    fireEvent.press(screen.getByTestId("summary-timeline-toggle"))

    expect(changes).toHaveLength(1)
    expect(screen.getByText("-3")).toBeTruthy()
  })

  it("waits for a connected summary before claiming the game is missing", () => {
    render(
      themed(
        <GameSummaryScreen
          summary={{ status: "loading" }}
          timeline={{ status: "loading" }}
          onBack={jest.fn()}
        />,
      ),
    )

    expect(screen.getByTestId("summary-loading-shell")).toBeTruthy()
    expect(screen.getAllByTestId("summary-skeleton-standing")).toHaveLength(2)
    expect(screen.queryByText("Game not found")).toBeNull()
  })

  it("keeps a deleted game recoverable with an explanation", () => {
    render(
      themed(
        <GameSummaryScreen
          summary={{ status: "ready", value: null }}
          timeline={{ status: "unavailable" }}
          onBack={jest.fn()}
        />,
      ),
    )

    expect(screen.getByText("Game not found")).toBeTruthy()
  })

  it("retries an unavailable summary", () => {
    const retry = jest.fn()
    render(
      themed(
        <GameSummaryScreen
          summary={{ status: "unavailable", retry }}
          timeline={{ status: "unavailable" }}
          onBack={jest.fn()}
        />,
      ),
    )

    fireEvent.press(screen.getByTestId("summary-retry"))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("keeps the summary visible when its timeline fails and retries in place", () => {
    const retry = jest.fn()
    render(
      themed(
        <GameSummaryScreen
          summary={{ status: "ready", value: connectedSummaryModel(connectedSummary()) }}
          timeline={{ status: "error", retry }}
          onBack={jest.fn()}
        />,
      ),
    )

    fireEvent.press(screen.getByTestId("summary-timeline-toggle"))

    expect(screen.getByText("Finished")).toBeTruthy()
    expect(screen.getByTestId("summary-timeline-error")).toBeTruthy()
    fireEvent.press(screen.getByTestId("summary-timeline-retry"))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("labels a timeline that is unavailable", () => {
    render(
      themed(
        <GameSummaryScreen
          summary={{ status: "ready", value: connectedSummaryModel(connectedSummary()) }}
          timeline={{ status: "unavailable" }}
          onBack={jest.fn()}
        />,
      ),
    )

    fireEvent.press(screen.getByTestId("summary-timeline-toggle"))
    expect(screen.getByText("Life change details are unavailable.")).toBeTruthy()
  })

  it("labels and locks timeline pagination while older changes load", () => {
    render(
      themed(
        <GameSummaryScreen
          summary={{ status: "ready", value: connectedSummaryModel(connectedSummary()) }}
          timeline={{ status: "ready", items: [], nextPage: { status: "loading" } }}
          onBack={jest.fn()}
        />,
      ),
    )

    fireEvent.press(screen.getByTestId("summary-timeline-toggle"))
    const button = screen.getByTestId("summary-load-more")
    expect(screen.getByText("Loading older changes…")).toBeTruthy()
    expect(button).toBeDisabled()
  })
})
