import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { EventScreen } from "./EventScreen"
import type { EventSource, EventTableView, EventView } from "./eventSource"

const openTable: EventTableView = {
  id: "t1",
  table: 4,
  playerIds: ["grace", "ada"],
  status: "open",
  result: null,
  reportedBy: null,
}

function view(overrides: Partial<EventView> = {}): EventView {
  return {
    id: "e1",
    code: "ABC123",
    name: "Friday Modern",
    system: "mtg",
    format: "modern",
    structure: "swiss",
    bestOf: 3,
    points: { win: 3, draw: 1, loss: 0 },
    plannedRounds: 3,
    roundMinutes: 50,
    status: "active",
    round: 1,
    clock: { startedAt: Date.now(), durationMs: 50 * 60_000 },
    isOrganizer: false,
    myPlayerId: "ada",
    players: [
      { id: "ada", name: "Ada", guest: false, dropped: false },
      { id: "grace", name: "Grace", guest: false, dropped: false },
    ],
    tables: [openTable],
    ...overrides,
  }
}

function source(eventView: EventView): EventSource {
  const done = () => jest.fn(() => Promise.resolve())
  return {
    view: eventView,
    standings: [],
    update: done(),
    addGuest: done(),
    dropPlayer: done(),
    undropPlayer: done(),
    startNextRound: done(),
    report: done(),
    confirm: done(),
    adjustClock: done(),
    finish: done(),
    remove: done(),
  }
}

function renderEvent(events: EventSource) {
  return render(
    <ThemeProvider initialContext="dark">
      <EventScreen source={events} onBack={jest.fn()} onRemoved={jest.fn()} />
    </ThemeProvider>,
  )
}

describe("EventScreen", () => {
  it("lets a player report their table in seat order", async () => {
    const events = source(view())
    renderEvent(events)

    expect(screen.getByTestId("my-table-number")).toHaveTextContent("Table 4")
    expect(screen.queryByTestId("start-round-button")).toBeNull()
    fireEvent.press(screen.getByTestId("report-button"))
    fireEvent.press(screen.getByLabelText("Increase Ada by 1"))
    fireEvent.press(screen.getByLabelText("Increase Ada by 1"))
    fireEvent.press(screen.getByLabelText("Increase Grace by 1"))
    fireEvent.press(screen.getByTestId("save-result-button"))

    await waitFor(() =>
      expect(events.report).toHaveBeenCalledWith("t1", {
        kind: "match",
        gamesWon: [1, 2],
        gamesDrawn: 0,
      }),
    )
    await waitFor(() => expect(screen.queryByTestId("result-dialog")).toBeNull())
  })

  it("shows the loser their loss before they confirm", async () => {
    const events = source(
      view({
        tables: [
          {
            ...openTable,
            status: "reported",
            reportedBy: "grace",
            result: { kind: "match", gamesWon: [2, 0], gamesDrawn: 0 },
          },
        ],
      }),
    )
    renderEvent(events)

    expect(screen.getByTestId("my-table-result")).toHaveTextContent("You lost 0-2")
    fireEvent.press(screen.getByText("Confirm result"))

    expect(events.confirm).toHaveBeenCalledWith("t1")
    await waitFor(() => expect(screen.getByTestId("confirm-button")).toBeEnabled())
  })

  it("holds the organizer's next round until every table has a result", () => {
    const events = source(view({ isOrganizer: true, myPlayerId: null }))
    renderEvent(events)

    expect(screen.getByText("Enter every result first")).toBeTruthy()
    expect(screen.getByTestId("start-round-button")).toBeDisabled()
    expect(screen.getByTestId("table-4")).toHaveTextContent(/Grace vs Ada/)
  })

  it.each([
    ["after the last planned round", view().players],
    [
      "after a drop leaves too few to pair",
      [
        { id: "ada", name: "Ada", guest: false, dropped: true },
        { id: "grace", name: "Grace", guest: false, dropped: false },
      ],
    ],
  ])("offers the organizer Finish instead of another round %s", (_case, players) => {
    const done = {
      ...openTable,
      status: "confirmed" as const,
      result: { kind: "match" as const, gamesWon: [2, 1], gamesDrawn: 0 },
    }
    renderEvent(
      source(view({ isOrganizer: true, myPlayerId: null, round: 3, tables: [done], players })),
    )

    expect(screen.queryByTestId("start-round-button")).toBeNull()
    expect(screen.getByTestId("finish-event-footer-button")).toBeEnabled()
  })
})
