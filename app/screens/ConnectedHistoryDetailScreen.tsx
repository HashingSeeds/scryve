import { View } from "react-native"
import { usePaginatedQuery, useQuery } from "convex/react"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../convex/_generated/api"

export function ConnectedHistoryDetailScreen({
  publicId,
  onBack,
}: {
  publicId: string
  onBack: () => void
}) {
  const { themed } = useAppTheme()
  const summary = useQuery(api.games.connectedSummary, { publicId }) as any
  const events = usePaginatedQuery(api.games.connectedEvents, { publicId }, { initialNumItems: 20 })
  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header title="Connected summary" leftTx="common:back" onLeftPress={onBack} />
      {!summary ? (
        <Text text="Loading final summary…" />
      ) : (
        <>
          <Text preset="heading" accessibilityRole="header" text="Finished" />
          <Text text={`${summary.eventCount} accepted life changes · ${summary.ruleset}`} />
          <View style={themed($list)}>
            {summary.players.map((player: any) => (
              <Card
                key={player.playerId}
                heading={player.displayName}
                content={`${player.finalLife} life`}
                style={{ borderColor: player.color }}
              />
            ))}
          </View>
          <Text preset="subheading" accessibilityRole="header" text="Recent events" />
          {events.results.map((event: any) => {
            const player = summary.players.find(
              (candidate: any) => candidate.playerId === event.playerId,
            )
            return (
              <Text
                key={event.operationId}
                text={`${player?.displayName ?? "Player"}: ${event.delta > 0 ? "+" : ""}${event.delta}`}
              />
            )
          })}
          {events.status === "CanLoadMore" ? (
            <Button text="Load older events" onPress={() => events.loadMore(20)} />
          ) : null}
        </>
      )}
    </Screen>
  )
}

const $screen: ThemedStyle<any> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  gap: spacing.md,
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
})
const $list: ThemedStyle<any> = ({ spacing }) => ({ gap: spacing.sm })
