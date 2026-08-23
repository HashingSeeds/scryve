import { act, fireEvent, render } from "@testing-library/react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { ThemeProvider } from "@/theme/context"

import { ConnectedHistorySource } from "./ConnectedHistorySource"

const mockMigrateHistory = jest.fn(async () => ({ isDone: true, continueCursor: "done" }))
const mockLoadMore = jest.fn()
let mockEntitlements: { fullHistory: boolean } | undefined = { fullHistory: false }
let mockEntitlementError: Error | undefined

jest.mock("../../../convex/_generated/api", () => ({
  api: {
    entitlements: { current: "entitlements.current" },
    games: {
      connectedHistory: "games.connectedHistory",
      migrateMyHistoryEntries: "games.migrateMyHistoryEntries",
    },
  },
}))

jest.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => mockMigrateHistory,
  usePaginatedQuery: () => ({
    results: Array.from({ length: 10 }, (_, index) => ({
      publicId: `connected-${index}`,
      outcome: "win",
      eventCount: index,
      finishedAt: index,
      ruleset: "commander",
      players: [],
    })),
    status: "Exhausted",
    loadMore: mockLoadMore,
  }),
  useQuery: () => {
    if (mockEntitlementError) throw mockEntitlementError
    return mockEntitlements
  },
}))

function sourceTree() {
  return (
    <ThemeProvider initialContext="light">
      <ConnectedHistorySource>
        {(feed) => (
          <>
            <Text
              testID="history-source-state"
              text={`${feed.page.status}:${feed.access.status}`}
            />
            {feed.page.status === "ready" ? (
              <Text testID="history-source-count" text={String(feed.page.items.length)} />
            ) : null}
            {feed.access.status === "unavailable" ? (
              <Button
                testID="retry-history-access-source"
                text="Retry"
                onPress={feed.access.retry}
              />
            ) : null}
          </>
        )}
      </ConnectedHistorySource>
    </ThemeProvider>
  )
}

describe("ConnectedHistorySource", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEntitlements = { fullHistory: false }
    mockEntitlementError = undefined
  })

  it("models entitlement loading separately from a healthy history page", async () => {
    mockEntitlements = undefined
    const view = render(sourceTree())

    expect(view.getByTestId("history-source-state")).toHaveTextContent("ready:loading")
    expect(view.getByTestId("history-source-count")).toHaveTextContent("10")

    mockEntitlements = { fullHistory: false }
    await act(async () => view.rerender(sourceTree()))
    expect(view.getByTestId("history-source-state")).toHaveTextContent("ready:ready")
  })

  it("contains an entitlement failure and retries it without discarding history", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
    mockEntitlementError = new Error("Entitlements unavailable")
    const view = render(sourceTree())

    expect(view.getByTestId("history-source-state")).toHaveTextContent("ready:unavailable")
    expect(view.getByTestId("history-source-count")).toHaveTextContent("10")

    mockEntitlementError = undefined
    await act(async () => fireEvent.press(view.getByTestId("retry-history-access-source")))
    expect(view.getByTestId("history-source-state")).toHaveTextContent("ready:ready")
    consoleError.mockRestore()
  })
})
