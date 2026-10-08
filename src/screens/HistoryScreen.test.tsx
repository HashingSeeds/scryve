import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"

import type { ConnectedHistoryFeed } from "@/features/connected/ConnectedHistorySource"
import type { LocalGameSummary } from "@/features/game/types"
import { ThemeProvider } from "@/theme/context"

import { connectedHistoryEntry, localHistoryEntry, manualHistoryEntry } from "./historyEntries"
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

type ManualMatch = Parameters<typeof manualHistoryEntry>[0]

function manualMatch(overrides: Partial<ManualMatch> = {}): ManualMatch {
  return {
    publicId: "manual-1",
    bestOf: 3,
    system: "mtg",
    format: "modern",
    eventName: "FNM",
    roundNumber: 2,
    finishedAt: NOW - 4 * HOUR,
    outcome: "win",
    seats: [
      { seat: 1, displayName: "Ada", deckName: "Dragons", gamesWon: 2, outcome: "win", mine: true },
      { seat: 2, displayName: "Bob", deckName: "Burn", gamesWon: 1, outcome: "loss", mine: false },
    ],
    ...overrides,
  }
}

function renderHistory(props: Partial<Parameters<typeof HistoryScreen>[0]> = {}) {
  const onSelectLocal = jest.fn()
  const onSelectConnected = jest.fn()
  const onSelectManual = jest.fn()
  const view = render(
    themed(
      <HistoryScreen
        games={[localGame()]}
        onBack={jest.fn()}
        onSelectLocal={onSelectLocal}
        onSelectConnected={onSelectConnected}
        onSelectManual={onSelectManual}
        {...props}
      />,
    ),
  )
  return { ...view, onSelectLocal, onSelectConnected, onSelectManual }
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

  it("falls back to ruleset when connected format is empty", () => {
    expect(connectedHistoryEntry(connectedGame({ format: "", ruleset: "commander" })).format).toBe(
      "Commander",
    )
  })

  it("does not turn a no-system connected game into a Magic format", () => {
    const entry = connectedHistoryEntry(
      connectedGame({ system: "none", format: "none", ruleset: "none", startingLife: 20 }),
    )

    expect(entry.system).toBeUndefined()
    expect(entry.format).toBe("20 life")
  })

  it("keeps a no-system local game on generic starting-life copy", () => {
    const entry = localHistoryEntry(localGame({ format: "standard" }))

    expect(entry.system).toBeUndefined()
    expect(entry.format).toBe("20 life")
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
    fireEvent.press(screen.getByTestId("history-format-none:20 life"))
    fireEvent.press(screen.getByTestId("history-filters-button"))
    expect(screen.getByTestId("history-row-local-local-1")).toBeTruthy()
    expect(screen.queryByTestId("history-row-connected-connected-1")).toBeNull()
  })

  it("narrows format choices to the selected game system", () => {
    renderHistory({
      connected: connectedFeed([
        connectedGame({ system: "mtg", format: "standard" }),
        connectedGame({ publicId: "pokemon-1", system: "pokemon", format: "standard" }),
      ]),
    })

    openFilters()
    expect(screen.getByText("Standard (Magic)")).toBeTruthy()
    expect(screen.getByText("Standard (Pokémon)")).toBeTruthy()
    fireEvent.press(screen.getByTestId("history-format-mtg:Standard"))

    fireEvent.press(screen.getByTestId("history-system-pokemon"))

    expect(screen.queryByTestId("history-format-mtg:Standard")).toBeNull()
    expect(screen.queryByTestId("history-format-none:20 life")).toBeNull()
    expect(screen.getByTestId("history-format-pokemon:Standard")).toBeTruthy()
    fireEvent.press(screen.getByTestId("history-filters-button"))
    expect(screen.getByTestId("history-row-connected-pokemon-1")).toBeTruthy()
    expect(screen.queryByTestId("history-row-connected-connected-1")).toBeNull()
    expect(screen.queryByTestId("history-row-local-local-1")).toBeNull()
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

  it("offers one older-page load when a connected filter has no loaded matches", () => {
    const load = jest.fn()
    renderHistory({
      connected: connectedFeed([connectedGame()], {
        page: {
          status: "ready",
          items: [connectedHistoryEntry(connectedGame())],
          nextPage: { status: "available", load },
        },
      }),
    })

    fireEvent.press(screen.getByTestId("history-source-connected"))
    openFilters()
    fireEvent.press(screen.getByTestId("history-outcome-draw"))
    fireEvent.press(screen.getByTestId("history-filters-button"))

    expect(screen.getByText("No matches in loaded games")).toBeTruthy()
    fireEvent.press(screen.getByRole("button", { name: "Load older games" }))
    expect(load).toHaveBeenCalledTimes(1)
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

  it("shows manual matches as compact rows with their own source filter", () => {
    const { onSelectManual } = renderHistory({
      connected: connectedFeed([connectedGame()], {
        page: {
          status: "ready",
          items: [
            connectedHistoryEntry(connectedGame()),
            manualHistoryEntry(manualMatch()),
            manualHistoryEntry(
              manualMatch({
                publicId: "manual-pod",
                bestOf: 1,
                eventName: undefined,
                roundNumber: undefined,
                outcome: "draw",
                seats: [
                  { seat: 1, displayName: "Ada", outcome: "draw", mine: true },
                  { seat: 2, displayName: "Bob", outcome: "draw", mine: false },
                  { seat: 3, displayName: "Cat", outcome: "draw", mine: false },
                  { seat: 4, displayName: "Dan", outcome: "loss", mine: false },
                ],
              }),
            ),
          ],
          nextPage: { status: "exhausted" },
        },
      }),
    })

    expect(screen.getByLabelText("Win · vs Bob · Manual · Bo3 2-1 · FNM R2 · Dragons")).toBeTruthy()
    expect(screen.getByLabelText("Draw · vs Bob · Cat · Dan · Manual · Bo1")).toBeTruthy()

    fireEvent.press(screen.getByTestId("history-source-manual"))
    expect(screen.queryByTestId("history-row-local-local-1")).toBeNull()
    expect(screen.queryByTestId("history-row-connected-connected-1")).toBeNull()
    expect(screen.getAllByTestId(/^history-row-manual-/)).toHaveLength(2)

    fireEvent.press(screen.getByTestId("history-row-manual-manual-1"))
    expect(onSelectManual).toHaveBeenCalledWith("manual-1")
  })

  it("offers to add a result only when the route provides a destination", () => {
    const onAddMatch = jest.fn()
    renderHistory({ onAddMatch })
    fireEvent.press(screen.getByText("Add result"))
    expect(onAddMatch).toHaveBeenCalledTimes(1)

    renderHistory()
    expect(screen.queryByText("Add result")).toBeNull()
  })

  it("shows local games without a connected feed for signed-out players", () => {
    renderHistory()

    expect(screen.getByTestId("history-row-local-local-1")).toBeTruthy()
  })

  it("names the winner a local game recorded", () => {
    renderHistory({
      games: [localGame({ result: { kind: "win", winnerPlayerIds: ["p2"] } } as never)],
    })

    expect(screen.getByLabelText(/Win · Ada · Grace · Local · .* · Won by Grace/)).toBeTruthy()
    expect(screen.getByText(/Won by Grace/)).toBeTruthy()
  })

  it("labels an abandoned local game instead of implying a result", () => {
    renderHistory({ games: [localGame({ status: "abandoned" })] })

    expect(screen.getByLabelText(/Abandoned · Ada · Grace/)).toBeTruthy()
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

    expect(screen.getByText("game:noGames")).toBeTruthy()
    expect(screen.queryByTestId("history-skeleton-row")).toBeNull()
  })

  it("keeps the older-page action reachable on an unfiltered empty connected page", () => {
    const load = jest.fn()
    renderHistory({
      games: [],
      connected: connectedFeed([], {
        page: { status: "ready", items: [], nextPage: { status: "available", load } },
      }),
    })

    fireEvent.press(screen.getByTestId("history-load-more"))
    expect(load).toHaveBeenCalledTimes(1)
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
    expect(button).toBeDisabled()
  })
})

describe("HistoryScreen Scryve matches", () => {
  const match = { id: "match_1", bestOf: 3, gameNumber: 1, wins: [0, 0], draws: 0 } as const
  // why: Ada takes the Bo3 2-1; the third game carries the match result like the device stores it.
  const deviceGames = [
    localGame({
      id: "m-g1",
      finishedAt: NOW - 3 * HOUR,
      match,
      result: { kind: "win", winnerPlayerIds: ["p1"] },
    } as never),
    localGame({
      id: "m-g2",
      finishedAt: NOW - 2 * HOUR,
      match: { ...match, gameNumber: 2, wins: [1, 0] },
      result: { kind: "win", winnerPlayerIds: ["p2"] },
    } as never),
    localGame({
      id: "m-g3",
      finishedAt: NOW - HOUR / 2,
      match: { ...match, gameNumber: 3, wins: [1, 1], result: { outcomes: ["win", "loss"] } },
      result: { kind: "win", winnerPlayerIds: ["p1"] },
    } as never),
  ]
  const claimed = (game: LocalGameSummary) => ({
    ...game,
    account: { ownerId: "owner", mePlayerId: "p1" as never },
    publish: "published" as const,
  })
  const serverGame = (publicId: string, finishedAt: number, outcome: "win" | "loss") =>
    connectedGame({
      publicId,
      source: "local",
      finishedAt,
      outcome,
      match: {
        publicId: "match_1",
        bestOf: 3,
        status: "finished",
        outcome: "win",
        seats: [
          { seat: 1, gamesWon: 2, gamesDrawn: 0, outcome: "win", mine: true },
          { seat: 2, gamesWon: 1, gamesDrawn: 0, outcome: "loss", mine: false },
        ],
      },
    })
  const rowIds = () => screen.getAllByTestId(/^history-row-/).map((row) => row.props.testID)

  it("shows a device match as one row that expands into its games", () => {
    const { onSelectLocal } = renderHistory({ games: [localGame(), ...deviceGames] })

    expect(rowIds()).toEqual(["history-row-match-match_1", "history-row-local-local-1"])
    expect(screen.getByLabelText("Win · Ada · Grace · Local · Bo3 2-1 · 3 games")).toBeTruthy()

    fireEvent.press(screen.getByTestId("history-row-match-match_1"))
    expect(rowIds()).toEqual([
      "history-row-match-match_1",
      "history-row-local-m-g3",
      "history-row-local-m-g2",
      "history-row-local-m-g1",
      "history-row-local-local-1",
    ])
    expect(screen.getByLabelText(/Game 2 · .* · Won by Grace/)).toBeTruthy()

    fireEvent.press(screen.getByTestId("history-row-local-m-g2"))
    expect(onSelectLocal).toHaveBeenCalledWith("m-g2")

    fireEvent.press(screen.getByTestId("history-row-match-match_1"))
    expect(rowIds()).toEqual(["history-row-match-match_1", "history-row-local-local-1"])
  })

  it("keeps one match row as older pages arrive and device copies overlap server rows", () => {
    const games = [claimed(deviceGames[2])]
    const props = { games, onBack: jest.fn(), onSelectLocal: jest.fn() }
    const view = render(
      themed(
        <HistoryScreen
          {...props}
          onSelectConnected={jest.fn()}
          onSelectManual={jest.fn()}
          connected={connectedFeed([serverGame("m-g3", NOW - HOUR / 2, "win")])}
        />,
      ),
    )
    expect(rowIds()).toEqual(["history-row-match-match_1"])

    view.rerender(
      themed(
        <HistoryScreen
          {...props}
          onSelectConnected={jest.fn()}
          onSelectManual={jest.fn()}
          connected={connectedFeed([
            serverGame("m-g3", NOW - HOUR / 2, "win"),
            serverGame("m-g2", NOW - 2 * HOUR, "loss"),
            serverGame("m-g1", NOW - 3 * HOUR, "win"),
          ])}
        />,
      ),
    )
    expect(rowIds()).toEqual(["history-row-match-match_1"])
    fireEvent.press(screen.getByTestId("history-row-match-match_1"))
    expect(rowIds()).toEqual([
      "history-row-match-match_1",
      "history-row-local-m-g3",
      "history-row-local-m-g2",
      "history-row-local-m-g1",
    ])
  })

  it("labels an unfinished match in progress", () => {
    renderHistory({ games: [localGame(), ...deviceGames.slice(0, 2)] })

    expect(
      screen.getByLabelText("In progress · Ada · Grace · Local · Bo3 1-1 · In progress · 2 games"),
    ).toBeTruthy()
  })

  it("filters a match by the match result, not its games", () => {
    renderHistory({ games: [localGame(), ...deviceGames.map(claimed)] })

    openFilters()
    fireEvent.press(screen.getByTestId("history-outcome-win"))
    fireEvent.press(screen.getByTestId("history-filters-button"))

    expect(rowIds()).toEqual(["history-row-match-match_1"])
  })
})

describe("HistoryScreen published local games", () => {
  it("keeps the device copy's winner line when the server row for the same game arrives", () => {
    const game = localGame({
      id: "game_published" as LocalGameSummary["id"],
      result: { kind: "win", winnerPlayerIds: ["p1" as never] },
      account: { ownerId: "owner" },
      publish: "published",
    })
    render(
      themed(
        <HistoryScreen
          games={[game]}
          onBack={jest.fn()}
          onSelectLocal={jest.fn()}
          onSelectConnected={jest.fn()}
          onSelectManual={jest.fn()}
          connected={connectedFeed([
            connectedGame({ publicId: "game_published", source: "local", outcome: "unknown" }),
          ])}
        />,
      ),
    )
    expect(screen.getAllByTestId(/history-row-/)).toHaveLength(1)
    expect(screen.getByTestId("history-row-local-game_published")).toBeTruthy()
    expect(screen.getByText(/Won by Ada/)).toBeTruthy()
  })
})
