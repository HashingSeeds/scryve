import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { remotePage, type RemotePage } from "@/features/async/remoteState"
import type { HistoryEntry } from "@/screens/historyEntries"
import { connectedHistoryEntry } from "@/screens/historyEntries"

import { api } from "../../../convex/_generated/api"

export type ConnectedHistoryAccess =
  | { status: "not-applicable" }
  | { status: "loading" }
  | { status: "ready"; premiumLocked: boolean }
  | { status: "unavailable"; retry: () => void }

export interface ConnectedHistoryFeed {
  page: RemotePage<HistoryEntry> | { status: "unavailable"; retry: () => void }
  access: ConnectedHistoryAccess
  migration: { status: "running" | "complete" } | { status: "failed"; retry: () => void }
}

const PAGE_SIZE = 10

export function ConnectedHistorySource({
  children,
}: {
  children: (feed: ConnectedHistoryFeed) => ReactNode
}) {
  const { isAuthenticated } = useConvexAuth()
  const migrateHistory = useMutation(api.games.migrateMyHistoryEntries)
  const [migrationAttempt, setMigrationAttempt] = useState(0)
  const [migrationStatus, setMigrationStatus] = useState<"running" | "complete" | "failed">(
    "running",
  )
  const history = usePaginatedQuery(api.games.connectedHistory, isAuthenticated ? {} : "skip", {
    initialNumItems: PAGE_SIZE,
  })
  const retryMigration = useCallback(() => setMigrationAttempt((attempt) => attempt + 1), [])

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    setMigrationStatus("running")
    void (async () => {
      let cursor: string | null = null
      let isDone = false
      while (!isDone && !cancelled) {
        const result: { continueCursor: string; isDone: boolean } = await migrateHistory({ cursor })
        cursor = result.continueCursor
        isDone = result.isDone
      }
      if (!cancelled) setMigrationStatus("complete")
    })().catch(() => {
      if (!cancelled) setMigrationStatus("failed")
    })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, migrateHistory, migrationAttempt])

  const page = (() => {
    const result = remotePage(history, PAGE_SIZE)
    if (result.status === "loading") return result
    return { ...result, items: result.items.map(connectedHistoryEntry) }
  })()
  const feed = {
    page,
    migration:
      migrationStatus === "failed"
        ? ({ status: "failed", retry: retryMigration } as const)
        : ({ status: migrationStatus } as const),
  }

  if (page.status !== "ready" || page.items.length < PAGE_SIZE)
    return children({ ...feed, access: { status: "not-applicable" } })

  return (
    <ConvexQueryBoundary
      fallback={({ retry }) => children({ ...feed, access: { status: "unavailable", retry } })}
    >
      <ConnectedHistoryAccessSource isAuthenticated={isAuthenticated}>
        {(access) => children({ ...feed, access })}
      </ConnectedHistoryAccessSource>
    </ConvexQueryBoundary>
  )
}

function ConnectedHistoryAccessSource({
  isAuthenticated,
  children,
}: {
  isAuthenticated: boolean
  children: (access: ConnectedHistoryAccess) => ReactNode
}) {
  const entitlements = useQuery(api.entitlements.current, isAuthenticated ? {} : "skip")
  if (entitlements === undefined) return children({ status: "loading" })
  return children({ status: "ready", premiumLocked: !entitlements.fullHistory })
}
