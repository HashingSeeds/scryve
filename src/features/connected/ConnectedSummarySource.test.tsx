import { fireEvent, render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { ConnectedSummarySource } from "./ConnectedSummarySource"
import type { ConnectedSummaryDocument } from "../../screens/gameSummary"
import { GameSummaryScreen } from "../../screens/GameSummaryScreen"

const FINISHED_AT = new Date("2026-08-10T23:24:00Z").getTime()

const summaryDocument: ConnectedSummaryDocument & { viewerPlayerIds: string[] } = {
  terminalStatus: "finished",
  startingLife: 40,
  ruleset: "commander",
  eventCount: 2,
  finishedAt: FINISHED_AT,
  players: [
    {
      playerId: "cp1",
      seat: 1,
      displayName: "Ada",
      color: "#2563EB",
      finalLife: -1,
      outcome: "loss",
    },
    {
      playerId: "cp2",
      seat: 2,
      displayName: "Grace",
      color: "#7C3AED",
      finalLife: 7,
      outcome: "win",
    },
  ],
  viewerPlayerIds: ["cp1"],
}

const mockPaginated = jest.fn()

jest.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: () => summaryDocument,
  usePaginatedQuery: (...args: unknown[]) => mockPaginated(...args),
}))

jest.mock("../../../convex/_generated/api", () => ({
  api: {
    games: { connectedSummary: "games:connectedSummary", connectedEvents: "games:connectedEvents" },
  },
}))

function renderSource() {
  render(
    <ThemeProvider initialContext="light">
      <ConnectedSummarySource publicId="game-1">
        {({ summary, timeline }) => (
          <GameSummaryScreen summary={summary} timeline={timeline} onBack={jest.fn()} />
        )}
      </ConnectedSummarySource>
    </ThemeProvider>,
  )
}

describe("ConnectedSummarySource", () => {
  beforeEach(() => {
    mockPaginated.mockReset()
    mockPaginated.mockReturnValue({
      results: [],
      status: "Exhausted",
      isLoading: false,
      loadMore: jest.fn(),
    })
  })

  it("skips the timeline query until the viewer asks for it", () => {
    renderSource()

    expect(mockPaginated).toHaveBeenCalledWith("games:connectedEvents", "skip", {
      initialNumItems: 20,
    })
    expect(screen.getByText("Show")).toBeTruthy()
  })

  it("expands the timeline on a single press", () => {
    renderSource()

    fireEvent.press(screen.getByTestId("summary-timeline-toggle"))

    expect(mockPaginated).toHaveBeenLastCalledWith(
      "games:connectedEvents",
      { publicId: "game-1" },
      { initialNumItems: 20 },
    )
    expect(screen.getByText("Hide")).toBeTruthy()
  })
})
