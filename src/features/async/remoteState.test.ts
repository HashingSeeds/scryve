import { remotePage, remoteValue } from "./remoteState"

type PageSnapshot<T> = Parameters<typeof remotePage<T>>[0]

function page<T>(
  status: PageSnapshot<T>["status"],
  results: T[],
  loadMore: PageSnapshot<T>["loadMore"] = jest.fn(),
): PageSnapshot<T> {
  return { status, results, loadMore }
}

describe("remoteValue", () => {
  it("maps an unresolved value to loading", () => {
    expect(remoteValue<string>(undefined)).toEqual({ status: "loading" })
  })

  it("keeps null as a ready value", () => {
    expect(remoteValue<string | null>(null)).toEqual({ status: "ready", value: null })
  })
})

describe("remotePage", () => {
  it("maps an unresolved first page to loading without exposing items or an action", () => {
    expect(remotePage(page("LoadingFirstPage", ["ignored"]), 20)).toEqual({ status: "loading" })
  })

  it("keeps items and exposes one load action when another page is available", () => {
    const loadMore = jest.fn()
    const state = remotePage(page("CanLoadMore", ["one", "two"], loadMore), 20)

    expect(state).toMatchObject({
      status: "ready",
      items: ["one", "two"],
      nextPage: { status: "available" },
    })
    if (state.status !== "ready" || state.nextPage.status !== "available") {
      throw new Error("Expected an available next page")
    }
    state.nextPage.load()
    expect(loadMore).toHaveBeenCalledTimes(1)
    expect(loadMore).toHaveBeenCalledWith(20)
  })

  it("keeps items while loading another page without exposing a load action", () => {
    expect(remotePage(page("LoadingMore", ["one"]), 20)).toEqual({
      status: "ready",
      items: ["one"],
      nextPage: { status: "loading" },
    })
  })

  it("keeps exhausted items without exposing a load action", () => {
    expect(remotePage(page("Exhausted", ["one"]), 20)).toEqual({
      status: "ready",
      items: ["one"],
      nextPage: { status: "exhausted" },
    })
  })

  it("keeps an empty resolved page ready", () => {
    expect(remotePage(page("Exhausted", []), 20)).toEqual({
      status: "ready",
      items: [],
      nextPage: { status: "exhausted" },
    })
  })
})
