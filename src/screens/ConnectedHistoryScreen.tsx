import { useEffect, useState } from "react"
import { View } from "react-native"
import { useMutation, usePaginatedQuery, useQuery } from "convex/react"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { EmptyState } from "@/components/EmptyState"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../convex/_generated/api"

export function ConnectedHistoryScreen({
  onBack,
  onSelect,
}: {
  onBack: () => void
  onSelect: (publicId: string) => void
}) {
  const { themed } = useAppTheme()
  const entitlements = useQuery(api.entitlements.current)
  const migrateHistory = useMutation(api.games.migrateMyHistoryEntries)
  const [migrationError, setMigrationError] = useState<string>()
  const { results, status, loadMore } = usePaginatedQuery(
    api.games.connectedHistory,
    {},
    { initialNumItems: 10 },
  )
  const uniqueResults = Array.from(
    new Map(results.map((game: any) => [game.publicId, game])).values(),
  )
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let cursor: string | null = null
      let isDone = false
      while (!isDone && !cancelled) {
        const result: { continueCursor: string; isDone: boolean } = await migrateHistory({ cursor })
        cursor = result.continueCursor
        isDone = result.isDone
      }
    })().catch((cause) => {
      if (!cancelled)
        setMigrationError(cause instanceof Error ? cause.message : "Could not migrate game history")
    })
    return () => {
      cancelled = true
    }
  }, [migrateHistory])
  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header title="Connected history" leftTx="common:back" onLeftPress={onBack} />
      {migrationError ? <Text accessibilityRole="alert" text={migrationError} /> : null}
      {uniqueResults.length === 0 && status !== "LoadingFirstPage" ? (
        <EmptyState heading="No connected games" content="Finished connected games appear here." />
      ) : (
        <View style={themed($list)}>
          {uniqueResults.map((game: any) => (
            <Card
              key={game.publicId}
              heading="Finished connected game"
              content={`${game.outcome === "win" ? "Win" : game.outcome === "loss" ? "Loss" : game.outcome === "draw" ? "Draw" : "Result not recorded"} · ${game.players.length} players · ${game.eventCount} life changes`}
              footer={new Date(game.finishedAt).toLocaleString()}
              onPress={() => onSelect(game.publicId)}
            />
          ))}
        </View>
      )}
      {status === "CanLoadMore" ? <Button text="Load more" onPress={() => loadMore(10)} /> : null}
      {entitlements && !entitlements.fullHistory && uniqueResults.length >= 10 ? (
        <Card
          heading="Unlock full history"
          content="Premium keeps every connected game and its complete event timeline available."
        />
      ) : null}
    </Screen>
  )
}

const $screen: ThemedStyle<any> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
})
const $list: ThemedStyle<any> = ({ spacing }) => ({ gap: spacing.sm })
