import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { EmptyState } from "@/components/EmptyState"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { LocalGameSummary } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface GameHistoryScreenProps {
  games: LocalGameSummary[]
  onBack: () => void
  onSelect: (gameId: string) => void
  onConnectedHistory?: () => void
}

function formatDuration(game: LocalGameSummary) {
  const minutes = Math.max(0, Math.round((game.finishedAt - game.createdAt) / 60_000))
  return minutes < 1 ? "Under a minute" : `${minutes} min`
}

export function GameHistoryScreen({
  games,
  onBack,
  onSelect,
  onConnectedHistory,
}: GameHistoryScreenProps) {
  const { themed } = useAppTheme()
  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header titleTx="localGame:localHistory" leftTx="common:back" onLeftPress={onBack} />
      {onConnectedHistory ? <Button text="Connected history" onPress={onConnectedHistory} /> : null}
      {games.length === 0 ? (
        <EmptyState headingTx="localGame:noGames" contentTx="localGame:noGamesContent" />
      ) : (
        <View style={themed($list)}>
          {games.map((game) => (
            <Card
              key={game.id}
              testID={`history-game-${game.id}`}
              accessibilityLabel={`${game.status} game, ${game.players.length} players`}
              heading={game.status === "finished" ? "Finished game" : "Abandoned game"}
              content={`${game.players.length} players · Started at ${game.startingLife} · ${game.eventCount} events`}
              footer={formatDuration(game)}
              RightComponent={
                <View style={themed($totals)}>
                  {game.players.map((player) => (
                    <Text
                      key={player.id}
                      text={`${player.name}: ${player.life}`}
                      size="xs"
                      numberOfLines={1}
                      style={themed($total)}
                    />
                  ))}
                </View>
              }
              onPress={() => onSelect(game.id)}
            />
          ))}
        </View>
      )}
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
})
const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $totals: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: 140,
  gap: spacing.xxs,
  paddingLeft: spacing.sm,
})
const $total: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "right",
})
