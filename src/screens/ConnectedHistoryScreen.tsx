import { View } from "react-native"
import { usePaginatedQuery } from "convex/react"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { EmptyState } from "@/components/EmptyState"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
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
  const { results, status, loadMore } = usePaginatedQuery(
    api.games.connectedHistory,
    {},
    { initialNumItems: 10 },
  )
  const uniqueResults = Array.from(
    new Map(results.map((game: any) => [game.publicId, game])).values(),
  )
  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header title="Connected history" leftTx="common:back" onLeftPress={onBack} />
      {uniqueResults.length === 0 && status !== "LoadingFirstPage" ? (
        <EmptyState heading="No connected games" content="Finished connected games appear here." />
      ) : (
        <View style={themed($list)}>
          {uniqueResults.map((game: any) => (
            <Card
              key={game.publicId}
              heading="Finished connected game"
              content={`${game.players.length} players · ${game.eventCount} life changes`}
              footer={new Date(game.finishedAt).toLocaleString()}
              onPress={() => onSelect(game.publicId)}
            />
          ))}
        </View>
      )}
      {status === "CanLoadMore" ? <Button text="Load more" onPress={() => loadMore(10)} /> : null}
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
