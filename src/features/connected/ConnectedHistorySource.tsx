import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react"

import { remotePage, type RemotePage } from "@/features/async/remoteState"
import type { HistoryEntry } from "@/screens/historyEntries"
import { connectedHistoryEntry } from "@/screens/historyEntries"

import { api } from "../../../convex/_generated/api"

export interface ConnectedHistoryFeed {
  page: RemotePage<HistoryEntry> | { status: "unavailable"; retry: () => void }
  premiumLocked: boolean
  migration: { status: "running" | "complete" } | { status: "failed"; retry: () => void }
}

const PAGE_SIZE = 10

export function ConnectedHistorySource({
  children,
}: {
  children: (feed: ConnectedHistoryFeed) => ReactNode
}) {
  const { isAuthenticated } = useConvexAuth()
  const entitlements = useQuery(api.entitlements.current, isAuthenticated ? {} : "skip")
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

  return children({
    page: (() => {
      const page = remotePage(history, PAGE_SIZE)
      if (page.status === "loading") return page
      return { ...page, items: page.items.map(connectedHistoryEntry) }
    })(),
    premiumLocked: Boolean(
      entitlements && !entitlements.fullHistory && history.results.length >= PAGE_SIZE,
    ),
    migration:
      migrationStatus === "failed"
        ? { status: "failed", retry: retryMigration }
        : { status: migrationStatus },
  })
}
