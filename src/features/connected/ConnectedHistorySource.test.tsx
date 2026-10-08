import { render } from "@testing-library/react-native"

import { Text } from "@/components/Text"
import { ThemeProvider } from "@/theme/context"

import { ConnectedHistorySource } from "./ConnectedHistorySource"

jest.mock("../../../convex/_generated/api", () => ({
  api: {
    games: { migrateMyHistoryEntries: "games.migrateMyHistoryEntries" },
    history: { entries: "history.entries" },
  },
}))

jest.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => jest.fn(async () => ({ isDone: true, continueCursor: "done" })),
  usePaginatedQuery: () => ({
    results: Array.from({ length: 10 }, (_, index) =>
      index === 0
        ? {
            kind: "match",
            publicId: "manual-0",
            bestOf: 3,
            finishedAt: index,
            outcome: "win",
            seats: [],
          }
        : {
            kind: "game",
            publicId: `connected-${index}`,
            outcome: "win",
            eventCount: index,
            finishedAt: index,
            ruleset: "commander",
            players: [],
          },
    ),
    status: "CanLoadMore",
    loadMore: jest.fn(),
  }),
}))

describe("ConnectedHistorySource", () => {
  it("maps manual matches and games into one feed with more pages available", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <ConnectedHistorySource>
          {(feed) => (
            <Text
              testID="history-source-state"
              text={
                feed.page.status === "ready"
                  ? `${feed.page.items.map((item) => item.key).join(",")}:${feed.page.nextPage.status}`
                  : feed.page.status
              }
            />
          )}
        </ConnectedHistorySource>
      </ThemeProvider>,
    )

    expect(view.getByTestId("history-source-state")).toHaveTextContent(
      "manual:manual-0,connected:connected-1,connected:connected-2,connected:connected-3,connected:connected-4,connected:connected-5,connected:connected-6,connected:connected-7,connected:connected-8,connected:connected-9:available",
    )
  })
})
