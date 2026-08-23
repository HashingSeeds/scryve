import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"

import type { ConnectedHistoryFeed } from "@/features/connected/ConnectedHistorySource"
import type { LocalGameSummary } from "@/features/game/types"
import { ThemeProvider } from "@/theme/context"

import { connectedHistoryEntry } from "./historyEntries"
import { HistoryScreen } from "./HistoryScreen"

const NOW = new Date("2026-08-11T20:00:00Z").getTime()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function themed(children: ReactNode) {
  return <ThemeProvider initialContext="light">{children}</ThemeProvider>
}

function localGame(overrides: Partial<LocalGameSummary> = {}): LocalGameSummary {
  return {
    schemaVersion: 1,
    id: "local-1",
    status: "finished",
    startingLife: 20,
    eventCount: 4,
    createdAt: NOW - 2 * HOUR,
    finishedAt: NOW - HOUR,
    players: [
      { id: "p1", name: "Ada", color: "#7C3AED", life: 3, seat: 1 },
      { id: "p2", name: "Grace", color: "#2563EB", life: 0, seat: 2 },
    ],
    ...overrides,
  } as LocalGameSummary
}

type ConnectedHistoryGame = Parameters<typeof connectedHistoryEntry>[0]

function connectedFeed(
  games: ConnectedHistoryGame[],
  overrides: Partial<ConnectedHistoryFeed> = {},
): ConnectedHistoryFeed {
  return {
    page: {
      status: "ready",
      items: games.map(connectedHistoryEntry),
      nextPage: { status: "exhausted" },
    },
    premiumLocked: false,
    migration: { status: "complete" },
    ...overrides,
  }
}

function connectedGame(overrides: Partial<ConnectedHistoryGame> = {}): ConnectedHistoryGame {
  return {
    publicId: "connected-1",
    outcome: "win",
    eventCount: 12,
    finishedAt: NOW - 3 * HOUR,
    ruleset: "commander",
    players: [
      { playerId: "cp1", displayName: "Ada", color: "#7C3AED", deckNameAtFinish: "Krenko" },
      { playerId: "cp2", displayName: "Bo", color: "#059669", deckNameAtFinish: "Atraxa" },
    ],
    ...overrides,
  }
}

function renderHistory(props: Partial<Parameters<typeof HistoryScreen>[0]> = {}) {
  const onSelectLocal = jest.fn()
  const onSelectConnected = jest.fn()
  render(
    themed(
      <HistoryScreen
        games={[localGame()]}
        onBack={jest.fn()}
        onSelectLocal={onSelectLocal}
        onSelectConnected={onSelectConnected}
        {...props}
      />,
    ),
  )
  return { onSelectLocal, onSelectConnected }
}

function openFilters() {
  fireEvent.press(screen.getByTestId("history-filters-button"))
}

describe("unified history screen", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW)
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it("interleaves local and connected games newest first", () => {
    renderHistory({ connected: connectedFeed([connectedGame()]) })

    const rows = screen.getAllByTestId(/^history-row-/)
    expect(rows.map((row) => row.props.testID)).toEqual([
      "history-row-local-local-1",
      "history-row-connected-connected-1",
    ])
  })

  it("routes each row to the detail screen matching its source", () => {
    const { onSelectLocal, onSelectConnected } = renderHistory({
      connected: connectedFeed([connectedGame()]),
    })

    fireEvent.press(screen.getByTestId("history-row-local-local-1"))
    fireEvent.press(screen.getByTestId("history-row-connected-connected-1"))

    expect(onSelectLocal).toHaveBeenCalledWith("local-1")
    expect(onSelectConnected).toHaveBeenCalledWith("connected-1")
  })

  it("keeps one row when device memberships repeat a connected game", () => {
    renderHistory({ connected: connectedFeed([connectedGame(), connectedGame()]) })

    expect(screen.getAllByTestId("history-row-connected-connected-1")).toHaveLength(1)
  })

  it("filters to a single source from the chip row", () => {
    renderHistory({ connected: connectedFeed([connectedGame()]) })

    fireEvent.press(screen.getByTestId("history-source-connected"))

    expect(screen.queryByTestId("history-row-local-local-1")).toBeNull()
    expect(screen.getByTestId("history-row-connected-connected-1")).toBeTruthy()
  })

  it("starts pre-filtered when connected play deep-links into history", () => {
    renderHistory({ connected: connectedFeed([connectedGame()]), initialSource: "connected" })

    expect(screen.queryByTestId("history-row-local-local-1")).toBeNull()
    expect(screen.getByTestId("history-row-connected-connected-1")).toBeTruthy()
  })

  it("narrows to games that include every selected player", () => {
    renderHistory({ connected: connectedFeed([connectedGame()]) })

    openFilters()
    fireEvent.press(screen.getByTestId("history-player-Bo"))
    fireEvent.press(screen.getByTestId("history-filters-button"))

    expect(screen.queryByTestId("history-row-local-local-1")).toBeNull()
    expect(screen.getByTestId("history-row-connected-connected-1")).toBeTruthy()
  })

  it("filters by deck", () => {
    renderHistory({
      connected: connectedFeed([
        connectedGame(),
        connectedGame({
          publicId: "connected-2",
          players: [{ playerId: "cp3", displayName: "Ada", deckNameAtFinish: "Sisay" }],
        }),
      ]),
    })

    openFilters()
    fireEvent.press(screen.getByTestId("history-deck-Sisay"))
    fireEvent.press(screen.getByTestId("history-filters-button"))

    expect(screen.getByTestId("history-row-connected-connected-2")).toBeTruthy()
    expect(screen.queryByTestId("history-row-connected-connected-1")).toBeNull()
  })

  it("filters by date range", () => {
    renderHistory({
      connected: connectedFeed([connectedGame({ finishedAt: NOW - 45 * DAY })]),
    })

    openFilters()
    fireEvent.press(screen.getByTestId("history-date-30d"))
    fireEvent.press(screen.getByTestId("history-filters-button"))

    expect(screen.getByTestId("history-row-local-local-1")).toBeTruthy()
    expect(screen.queryByTestId("history-row-connected-connected-1")).toBeNull()
  })

  it("filters by result and by ruleset", () => {
    renderHistory({ connected: connectedFeed([connectedGame()]) })

    openFilters()
    fireEvent.press(screen.getByTestId("history-outcome-win"))
    fireEvent.press(screen.getByTestId("history-filters-button"))
    expect(screen.queryByTestId("history-row-local-local-1")).toBeNull()
    expect(screen.getByTestId("history-row-connected-connected-1")).toBeTruthy()

    openFilters()
    fireEvent.press(screen.getByTestId("history-outcome-win"))
    fireEvent.press(screen.getByTestId("history-format-20 life"))
    fireEvent.press(screen.getByTestId("history-filters-button"))
    expect(screen.getByTestId("history-row-local-local-1")).toBeTruthy()
    expect(screen.queryByTestId("history-row-connected-connected-1")).toBeNull()
  })

  it("filters by pod size", () => {
    renderHistory({
      connected: connectedFeed([
        connectedGame({
          publicId: "solo-game",
          players: [{ playerId: "cp9", displayName: "Ada" }],
        }),
      ]),
    })

    openFilters()
    fireEvent.press(screen.getByTestId("history-pod-1"))
    fireEvent.press(screen.getByTestId("history-filters-button"))

    expect(screen.getByTestId("history-row-connected-solo-game")).toBeTruthy()
    expect(screen.queryByTestId("history-row-local-local-1")).toBeNull()
  })

  it("clears an applied filter from its chip", () => {
    renderHistory({ connected: connectedFeed([connectedGame()]) })

    openFilters()
    fireEvent.press(screen.getByTestId("history-outcome-win"))
    fireEvent.press(screen.getByTestId("history-filters-button"))
    expect(screen.queryByTestId("history-row-local-local-1")).toBeNull()

    fireEvent.press(screen.getByLabelText("Remove filter Win"))

    expect(screen.getByTestId("history-row-local-local-1")).toBeTruthy()
  })

  it("offers a way out when filters exclude everything", () => {
    renderHistory({ connected: connectedFeed([]) })

    openFilters()
    fireEvent.press(screen.getByTestId("history-outcome-draw"))
    fireEvent.press(screen.getByTestId("history-filters-button"))
    expect(screen.getByText("No games match these filters")).toBeTruthy()

    fireEvent.press(screen.getByRole("button", { name: "Clear filters" }))

    expect(screen.getByTestId("history-row-local-local-1")).toBeTruthy()
  })

  it("warns that filters only cover loaded connected pages", () => {
    renderHistory({
      connected: connectedFeed([connectedGame()], {
        page: {
          status: "ready",
          items: [connectedHistoryEntry(connectedGame())],
          nextPage: { status: "available", load: jest.fn() },
        },
      }),
    })

    expect(screen.queryByText(/load more to search further back/i)).toBeNull()

    fireEvent.press(screen.getByTestId("history-source-connected"))

    expect(screen.getByText(/load more to search further back/i)).toBeTruthy()
  })

  it("shows local games without a connected feed for signed-out players", () => {
    renderHistory()

    expect(screen.getByTestId("history-row-local-local-1")).toBeTruthy()
    expect(screen.queryByText(/Unlock full history/)).toBeNull()
  })

  it("names the winner a local game recorded", () => {
    renderHistory({
      games: [localGame({ result: { kind: "win", winnerPlayerIds: ["p2"] } } as never)],
    })

    expect(screen.getByLabelText("Win · Ada · Grace")).toBeTruthy()
    expect(screen.getByText(/Won by Grace/)).toBeTruthy()
  })

  it("labels an abandoned local game instead of implying a result", () => {
    renderHistory({ games: [localGame({ status: "abandoned" })] })

    expect(screen.getByLabelText("Abandoned · Ada · Grace")).toBeTruthy()
  })

  it("uses stable rows instead of settled zero counts while connected history loads", () => {
    renderHistory({
      games: [],
      connected: connectedFeed([], { page: { status: "loading" } }),
    })

    expect(screen.getAllByTestId("history-skeleton-row")).toHaveLength(3)
    expect(screen.getByText("Loading connected history…")).toBeTruthy()
    expect(screen.queryByText("0 games · 0W · 0L · 0D")).toBeNull()
  })

  it("keeps local rows visible beside connected first-page progress", () => {
    renderHistory({ connected: connectedFeed([], { page: { status: "loading" } }) })

    expect(screen.getByTestId("history-row-local-local-1")).toBeTruthy()
    expect(screen.getByTestId("history-connected-progress")).toBeTruthy()
  })

  it("shows a settled empty state only after connected history finishes", () => {
    renderHistory({ games: [], connected: connectedFeed([]) })

    expect(screen.getByText("localGame:noGames")).toBeTruthy()
    expect(screen.queryByTestId("history-skeleton-row")).toBeNull()
  })

  it("keeps local history usable when connected history is unavailable", () => {
    const retry = jest.fn()
    renderHistory({
      connected: connectedFeed([], { page: { status: "unavailable", retry } }),
    })

    expect(screen.getByTestId("history-row-local-local-1")).toBeTruthy()
    fireEvent.press(screen.getByTestId("history-retry-connected"))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("retries a failed history import", () => {
    const retry = jest.fn()
    renderHistory({
      connected: connectedFeed([], { migration: { status: "failed", retry } }),
    })

    fireEvent.press(screen.getByTestId("history-retry-migration"))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("labels and locks connected pagination while the next page loads", () => {
    renderHistory({
      connected: connectedFeed([connectedGame()], {
        page: {
          status: "ready",
          items: [connectedHistoryEntry(connectedGame())],
          nextPage: { status: "loading" },
        },
      }),
    })

    const button = screen.getByTestId("history-load-more")
    expect(screen.getByText("Loading more connected games…")).toBeTruthy()
    expect(button.props.accessibilityState.disabled).toBe(true)
  })
})
