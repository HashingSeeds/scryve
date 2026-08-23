import { Pressable, View } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

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
