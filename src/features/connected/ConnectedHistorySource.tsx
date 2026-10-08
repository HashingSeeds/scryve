import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react"

import { remotePage, type RemotePage } from "@/features/async/remoteState"
import type { HistoryEntry } from "@/screens/historyEntries"
import { connectedHistoryEntry, manualHistoryEntry } from "@/screens/historyEntries"

import { api } from "../../../convex/_generated/api"

export interface ConnectedHistoryFeed {
  page: RemotePage<HistoryEntry> | { status: "unavailable"; retry: () => void }
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
  const history = usePaginatedQuery(api.history.entries, isAuthenticated ? {} : "skip", {
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
    return {
      ...result,
      items: result.items.map((item) =>
        item.kind === "match" ? manualHistoryEntry(item) : connectedHistoryEntry(item),
      ),
    }
  })()
  return children({
    page,
    migration:
      migrationStatus === "failed"
        ? ({ status: "failed", retry: retryMigration } as const)
        : ({ status: migrationStatus } as const),
  })
}
