import { Pressable, View } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { ConvexQueryBoundary } from "./ConvexQueryBoundary"

function BrokenQuery({ fails = true }: { fails?: boolean }) {
  if (fails) throw new Error("Query failed")
  return <View testID="query-result" />
}

describe("ConvexQueryBoundary", () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it("passes a thrown child error to the caller fallback", () => {
    const view = render(
      <ConvexQueryBoundary
        fallback={({ error }) => <View accessibilityLabel={error.message} testID="query-error" />}
      >
        <BrokenQuery />
      </ConvexQueryBoundary>,
    )

    expect(view.getByTestId("query-error").props.accessibilityLabel).toBe("Query failed")
  })

  it("clears the fallback and remounts the child on retry", () => {
    let fails = true
    function RetriableQuery() {
      if (fails) throw new Error("Query failed")
      return <View testID="query-result" />
    }

    const view = render(
      <ConvexQueryBoundary
        fallback={({ retry }) => (
          <Pressable
            testID="retry-query"
            onPress={() => {
              fails = false
              retry()
            }}
          />
        )}
      >
        <RetriableQuery />
      </ConvexQueryBoundary>,
    )

    fireEvent.press(view.getByTestId("retry-query"))
    expect(view.getByTestId("query-result")).toBeTruthy()
    expect(view.queryByTestId("retry-query")).toBeNull()
  })

  it("clears an error when the reset key changes", () => {
    const fallback = ({ error }: { error: Error }) => (
      <View accessibilityLabel={error.message} testID="query-error" />
    )
    const view = render(
      <ConvexQueryBoundary resetKey="game-a" fallback={fallback}>
        <BrokenQuery />
      </ConvexQueryBoundary>,
    )

    view.rerender(
      <ConvexQueryBoundary resetKey="game-b" fallback={fallback}>
        <BrokenQuery fails={false} />
      </ConvexQueryBoundary>,
    )

    expect(view.getByTestId("query-result")).toBeTruthy()
    expect(view.queryByTestId("query-error")).toBeNull()
  })

  it("renders caller fallback content without adding copy or layout", () => {
    const view = render(
      <ConvexQueryBoundary fallback={() => <View testID="only-fallback" />}>
        <BrokenQuery />
      </ConvexQueryBoundary>,
    )

    expect(view.toJSON()).toMatchObject({
      type: "View",
      props: { testID: "only-fallback" },
      children: null,
    })
  })
})

describe("ConvexQueryBoundary against still-cached convex query errors", () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    consoleError.mockRestore()
  })

  function createCachedErrorQuery() {
    let healthy = true
    let renderCount = 0
    return {
      get renderCount() {
        return renderCount
      },
      fail() {
        healthy = false
      },
      purge() {
        healthy = true
      },
      useQuery(): { decks: string[] } {
        renderCount += 1
        if (!healthy) throw new Error("decks.listMine failed")
        return { decks: ["deck-a"] }
      },
    }
  }

  function setup(query: ReturnType<typeof createCachedErrorQuery>) {
    function LobbyDeckQuery() {
      const result = query.useQuery()
      void result
      return <View testID="query-result" />
    }

    const view = render(
      <ConvexQueryBoundary
        fallback={({ retry }) => (
          <Pressable testID="retry-query" onPress={retry}>
            <View />
          </Pressable>
        )}
      >
        <LobbyDeckQuery />
      </ConvexQueryBoundary>,
    )

    return {
      rerender: () =>
        view.rerender(
          <ConvexQueryBoundary
            fallback={({ retry }) => (
              <Pressable testID="retry-query" onPress={retry}>
                <View />
              </Pressable>
            )}
          >
            <LobbyDeckQuery />
          </ConvexQueryBoundary>,
        ),
      pressRetry: () => {
        fireEvent.press(view.getByTestId("retry-query"))
        view.rerender(
          <ConvexQueryBoundary
            fallback={({ retry }) => (
              <Pressable testID="retry-query" onPress={retry}>
                <View />
              </Pressable>
            )}
          >
            <LobbyDeckQuery />
          </ConvexQueryBoundary>,
        )
      },
      advance: (ms: number) => act(() => void jest.advanceTimersByTime(ms)),
      view,
    }
  }

  it("recovers from a retry pressed while the error is still cached once the client purges it", () => {
    const query = createCachedErrorQuery()
    const harness = setup(query)
    expect(harness.view.getByTestId("query-result")).toBeTruthy()

    act(() => query.fail())
    harness.rerender()
    expect(harness.view.queryByTestId("query-result")).toBeNull()

    harness.pressRetry()
    expect(harness.view.queryByTestId("query-result")).toBeNull()

    query.purge()
    harness.advance(500)

    expect(harness.view.getByTestId("query-result")).toBeTruthy()
  })

  it("caps automatic retries and recovers on a later manual retry", () => {
    const query = createCachedErrorQuery()
    const harness = setup(query)
    expect(harness.view.getByTestId("query-result")).toBeTruthy()

    act(() => query.fail())
    harness.rerender()
    const rendersAfterFirstFailure = query.renderCount

    harness.advance(500)
    harness.advance(2000)
    const rendersAfterExhaustedBackoff = query.renderCount
    expect(rendersAfterExhaustedBackoff).toBeGreaterThan(rendersAfterFirstFailure)

    harness.advance(60000)
    expect(query.renderCount).toBe(rendersAfterExhaustedBackoff)
    expect(harness.view.queryByTestId("query-result")).toBeNull()

    query.purge()
    harness.pressRetry()

    expect(harness.view.getByTestId("query-result")).toBeTruthy()
  })

  it("remounts children on every attempt so convex re-subscribes", () => {
    const query = createCachedErrorQuery()
    const harness = setup(query)
    expect(harness.view.getByTestId("query-result")).toBeTruthy()

    act(() => query.fail())
    harness.rerender()

    harness.pressRetry()
    harness.pressRetry()
    expect(query.renderCount).toBeGreaterThanOrEqual(4)
  })

  it("discards pending automatic retry state when the reset key changes", () => {
    const query = createCachedErrorQuery()
    const fallback = ({ retry }: { retry: () => void }) => (
      <Pressable testID="retry-query" onPress={retry}>
        <View />
      </Pressable>
    )
    const tree = (resetKey: string) => (
      <ConvexQueryBoundary resetKey={resetKey} fallback={fallback}>
        <LobbyDeckQueryOf query={query} />
      </ConvexQueryBoundary>
    )

    const view = render(tree("game-a"))
    expect(view.getByTestId("query-result")).toBeTruthy()

    act(() => query.fail())
    view.rerender(tree("game-a"))
    expect(view.queryByTestId("query-result")).toBeNull()

    query.purge()
    view.rerender(tree("game-b"))
    const rendersAtReset = query.renderCount
    expect(view.getByTestId("query-result")).toBeTruthy()

    harnessAdvance(500)
    harnessAdvance(2000)
    expect(query.renderCount).toBe(rendersAtReset)

    act(() => query.fail())
    view.rerender(tree("game-b"))
    expect(view.queryByTestId("query-result")).toBeNull()

    harnessAdvance(500)
    harnessAdvance(2000)
    harnessAdvance(60000)
    query.purge()
    const rendersAfterExhaustedBudget = query.renderCount
    harnessAdvance(60000)

    expect(query.renderCount).toBe(rendersAfterExhaustedBudget)
    expect(view.queryByTestId("query-result")).toBeNull()
    fireEvent.press(view.getByTestId("retry-query"))

    expect(view.getByTestId("query-result")).toBeTruthy()
  })

  it("schedules automatic retries when the replacement child fails after a resetKey change", () => {
    const query = createCachedErrorQuery()
    const fallback = ({ retry }: { retry: () => void }) => (
      <Pressable testID="retry-query" onPress={retry}>
        <View />
      </Pressable>
    )
    const tree = (resetKey: string) => (
      <ConvexQueryBoundary resetKey={resetKey} fallback={fallback}>
        <LobbyDeckQueryOf query={query} />
      </ConvexQueryBoundary>
    )

    act(() => query.fail())
    const view = render(tree("game-a"))
    expect(view.queryByTestId("query-result")).toBeNull()

    const rendersAfterSwitch = (() => {
      view.rerender(tree("game-b"))
      return query.renderCount
    })()
    expect(view.queryByTestId("query-result")).toBeNull()

    harnessAdvance(500)
    expect(query.renderCount).toBeGreaterThan(rendersAfterSwitch)

    harnessAdvance(2000)
    const rendersAfterBackoff = query.renderCount
    harnessAdvance(60000)
    expect(query.renderCount).toBe(rendersAfterBackoff)
  })

  function LobbyDeckQueryOf({ query }: { query: ReturnType<typeof createCachedErrorQuery> }) {
    const result = query.useQuery()
    void result
    return <View testID="query-result" />
  }
})

function harnessAdvance(ms: number) {
  act(() => void jest.advanceTimersByTime(ms))
}
