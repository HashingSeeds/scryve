import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Card } from "@/components/Card"
import { EmptyState } from "@/components/EmptyState"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { LocalGame } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface GameHistoryDetailScreenProps {
  detail: { game: LocalGame; eventsTruncated: boolean } | null
  onBack: () => void
}

export function GameHistoryDetailScreen({ detail, onBack }: GameHistoryDetailScreenProps) {
  const { themed } = useAppTheme()
  if (!detail) {
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
        <Header titleTx="localGame:gameSummary" leftTx="common:back" onLeftPress={onBack} />
        <EmptyState
          heading="Game not found"
          content="This local history item is no longer available."
        />
      </Screen>
    )
  }
  const { game, eventsTruncated } = detail
  const changes = game.events.filter((event) => event.type === "life.changed")
  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header titleTx="localGame:gameSummary" leftTx="common:back" onLeftPress={onBack} />
      <Text
        text={game.status === "finished" ? "Finished" : "Abandoned"}
        preset="heading"
        accessibilityRole="header"
      />
      <Text
        text={`${game.players.length} players · Starting life ${game.startingLife}`}
        style={themed($muted)}
      />
      <View style={themed($playerList)}>
        {game.players.map((player) => (
          <Card
            key={player.id}
            heading={player.name}
            content={`${player.life} life`}
            LeftComponent={<View style={[themed($swatch), { backgroundColor: player.color }]} />}
          />
        ))}
      </View>
      <Text text="Event summary" preset="subheading" accessibilityRole="header" />
      <Text
        text={`${changes.length} recorded life changes${eventsTruncated ? " (older events omitted)" : ""}. Undo actions remain recorded as compensating changes.`}
        style={themed($muted)}
      />
      <View style={themed($events)}>
        {changes
          .slice(-20)
          .reverse()
          .map((event) => {
            if (event.type !== "life.changed") return null
            const player = game.players.find(({ id }) => id === event.playerId)
            return (
              <Text
                key={event.operationId}
                text={`${player?.name ?? "Player"}: ${event.delta > 0 ? "+" : ""}${event.delta}${event.compensatesOperationId ? " (undo)" : ""}`}
                size="xs"
              />
            )
          })}
      </View>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  gap: spacing.md,
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
})
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $playerList: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $swatch: ThemedStyle<ViewStyle> = () => ({ width: 18, height: 52, borderRadius: 5 })
const $events: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  borderLeftWidth: 2,
  borderLeftColor: colors.separator,
  paddingLeft: spacing.md,
})
