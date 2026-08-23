import { useEffect, useMemo, useRef } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { useMutation, usePaginatedQuery } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ConnectedGameRow } from "@/features/connected/ConnectedGameRow"
import { ConnectedGameRepository } from "@/features/connected/persistence"
import { useConnectedProfile } from "@/features/connected/useConnectedProfile"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../convex/_generated/api"

export interface ConnectedHomeScreenProps {
  onHostNew: () => void
  onJoin: () => void
  onHistory?: () => void
  onDecks?: () => void
  onResume?: (game: { publicId: string; status: "lobby" | "active" }) => void
  onBack?: () => void
}

export function ConnectedHomeScreen({
  onHostNew,
  onJoin,
  onHistory,
  onDecks,
  onResume,
  onBack,
}: ConnectedHomeScreenProps) {
  const { themed } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const now = useRef(Date.now()).current
  const connectedProfile = useConnectedProfile()
  const clerkUserId = connectedProfile.profile?.userId
  const migrationRepository = useMemo(
    () => (clerkUserId ? new ConnectedGameRepository(undefined, clerkUserId) : null),
    [clerkUserId],
  )
  const migrateMemberships = useMutation(api.games.migrateMyGameMemberships)
  const projectionReady = connectedProfile.status === "ready"
  const activeGames = usePaginatedQuery(
    api.games.activeConnectedGames,
    projectionReady ? {} : "skip",
    { initialNumItems: 10 },
  )
  const uniqueActiveGames = Array.from(
    new Map(activeGames.results.map((game) => [game.publicId, game])).values(),
  ).filter(
    (game): game is typeof game & { status: "lobby" | "active" } =>
      game.status === "lobby" || game.status === "active",
  )
  const hasHostedGame = uniqueActiveGames.some((game) => game.isHost)

  useEffect(() => {
    if (
      !projectionReady ||
      !migrationRepository ||
      migrationRepository.isMembershipMigrationComplete()
    )
      return
    let cancelled = false
    void (async () => {
      let cursor: string | null = null
      let isDone = false
      while (!isDone && !cancelled) {
        const result: { continueCursor: string; isDone: boolean } = await migrateMemberships({
          cursor,
        })
        cursor = result.continueCursor
        isDone = result.isDone
      }
      if (!cancelled) migrationRepository.markMembershipMigrationComplete()
    })().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [migrateMemberships, migrationRepository, projectionReady])

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header
        title={titleVisible ? "Connected play" : ""}
        leftTx={onBack ? "common:back" : undefined}
        onLeftPress={onBack}
      />
      <ScrollView
        style={$styles.flex1}
        contentContainerStyle={themed($content)}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={themed($hero)}>
          <Text preset="heading" accessibilityRole="header" text="Connected play" />
          <Text
            size="sm"
            style={themed($dimmed)}
            text="Host a resilient live game, or join an existing lobby."
          />
        </View>
        {connectedProfile.status === "error" && connectedProfile.reason === "sync" ? (
          <AlertNote text={connectedProfile.message} />
        ) : null}
        {uniqueActiveGames.length ? (
          <View style={[themed($section), $styles.flex1]}>
            <Text
              preset="subheading"
              accessibilityRole="header"
              text="Pick up where you left off"
            />
            {uniqueActiveGames.map((game) => (
              <ConnectedGameRow
                key={game.publicId}
                game={game}
                now={now}
                onPress={() => onResume?.(game)}
              />
            ))}
            {activeGames.status === "CanLoadMore" ? (
              <Button
                text="Load more"
                style={themed($loadMore)}
                onPress={() => activeGames.loadMore(10)}
              />
            ) : null}
          </View>
        ) : projectionReady ? (
          <View testID="no-active-connected-games" style={themed($empty)}>
            <Text preset="subheading" style={themed($emptyHeading)} text="No games in progress" />
            <Text
              size="sm"
              style={themed($emptyCopy)}
              text="Host a lobby and share the code, or join a friend's game to see it here."
            />
          </View>
        ) : (
          <View style={$styles.flex1} />
        )}
        <View style={themed($section)}>
          <Text preset="subheading" accessibilityRole="header" text="More" />
          <Button
            text="Connected history"
            style={themed($listAction)}
            disabled={!projectionReady}
            onPress={onHistory}
          />
          <Button
            text="Decks"
            style={themed($listAction)}
            disabled={!projectionReady}
            onPress={onDecks}
          />
        </View>
      </ScrollView>
      <BottomActionBar>
        {connectedProfile.status === "offline" ? (
          <AlertNote text="Connected play is offline. Hosting and joining need a connection." />
        ) : null}
        {hasHostedGame && projectionReady ? (
          <AlertNote
            tone="info"
            text="Resume or finish/abandon your hosted game before creating another."
          />
        ) : null}
        <Button
          testID="host-connected-button"
          text="Host a new game"
          disabled={!projectionReady || hasHostedGame}
          preset="reversed"
          style={themed($primaryAction)}
          onPress={onHostNew}
        />
        <Button
          testID="join-connected-button"
          text="Join with code"
          disabled={!projectionReady}
          style={themed($secondaryAction)}
          onPress={onJoin}
        />
      </BottomActionBar>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  gap: spacing.lg,
  padding: spacing.lg,
  paddingBottom: spacing.xl,
})
const $hero: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $dimmed: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $empty: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xxs,
  paddingVertical: spacing.xl,
})
const $emptyHeading: ThemedStyle<TextStyle> = () => ({ textAlign: "center" })
const $emptyCopy: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})
const $primaryAction: ThemedStyle<ViewStyle> = () => ({ minHeight: 52 })
const $secondaryAction: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
const $listAction: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
const $loadMore: ThemedStyle<ViewStyle> = () => ({ minHeight: 44 })
