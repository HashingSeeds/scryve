import type { UsePaginatedQueryResult } from "convex/react"

export type RemoteValue<T> = { status: "loading" } | { status: "ready"; value: T }

export type NextPageState =
  { status: "available"; load: () => void } | { status: "loading" } | { status: "exhausted" }

export type RemotePage<T> =
  | { status: "loading" }
  | {
      status: "ready"
      items: readonly T[]
      nextPage: NextPageState
    }

export function remoteValue<T>(value: T | undefined): RemoteValue<T> {
  return value === undefined ? { status: "loading" } : { status: "ready", value }
}

type PaginatedSnapshot<T> = Pick<UsePaginatedQueryResult<T>, "results" | "status" | "loadMore">

export function remotePage<T>(page: PaginatedSnapshot<T>, pageSize: number): RemotePage<T> {
  if (page.status === "LoadingFirstPage") return { status: "loading" }

  let nextPage: NextPageState
  switch (page.status) {
    case "CanLoadMore":
      nextPage = { status: "available", load: () => page.loadMore(pageSize) }
      break
    case "LoadingMore":
      nextPage = { status: "loading" }
      break
    case "Exhausted":
      nextPage = { status: "exhausted" }
      break
  }

  return { status: "ready", items: page.results, nextPage }
}
