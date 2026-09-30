import { render } from "@testing-library/react-native"

import { Text } from "@/components/Text"
import { ThemeProvider } from "@/theme/context"

import { ConnectedHistorySource } from "./ConnectedHistorySource"

jest.mock("../../../convex/_generated/api", () => ({
  api: {
    games: {
      connectedHistory: "games.connectedHistory",
      migrateMyHistoryEntries: "games.migrateMyHistoryEntries",
    },
  },
}))

jest.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => jest.fn(async () => ({ isDone: true, continueCursor: "done" })),
  usePaginatedQuery: () => ({
    results: Array.from({ length: 10 }, (_, index) => ({
      publicId: `connected-${index}`,
      outcome: "win",
      eventCount: index,
      finishedAt: index,
      ruleset: "commander",
      players: [],
    })),
    status: "CanLoadMore",
    loadMore: jest.fn(),
  }),
}))

describe("ConnectedHistorySource", () => {
  it("offers more pages to every player without an entitlement lookup", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <ConnectedHistorySource>
          {(feed) => (
            <Text
              testID="history-source-state"
              text={
                feed.page.status === "ready"
                  ? `${feed.page.items.length}:${feed.page.nextPage.status}`
                  : feed.page.status
              }
            />
          )}
        </ConnectedHistorySource>
      </ThemeProvider>,
    )

    expect(view.getByTestId("history-source-state")).toHaveTextContent("10:available")
  })
})
