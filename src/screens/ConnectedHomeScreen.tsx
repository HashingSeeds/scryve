import { useEffect, useMemo, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { useUser } from "@clerk/expo"
import { useConvexConnectionState, useMutation, usePaginatedQuery } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ConnectedGameRow } from "@/features/connected/ConnectedGameRow"
import { ConnectedGameRepository } from "@/features/connected/persistence"
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
  const { user } = useUser()
  const clerkUserId = user?.id
  const clerkDisplayName = user?.fullName || user?.firstName || "Player"
  const clerkAvatarUrl = user?.imageUrl
  const migrationRepository = useMemo(
    () => (clerkUserId ? new ConnectedGameRepository(undefined, clerkUserId) : null),
    [clerkUserId],
  )
  const { isWebSocketConnected } = useConvexConnectionState()
  const syncUser = useMutation(api.users.syncCurrent)
  const migrateMemberships = useMutation(api.games.migrateMyGameMemberships)
  const [readyClerkUserId, setReadyClerkUserId] = useState<string>()
  const [bootstrapError, setBootstrapError] = useState<string>()
  const projectionReady = Boolean(
    isWebSocketConnected && clerkUserId && readyClerkUserId === clerkUserId,
  )
  const activeGames = usePaginatedQuery(
    api.games.activeConnectedGames,
    projectionReady ? {} : "skip",
    { initialNumItems: 10 },
  )
  const uniqueActiveGames = Array.from(
    new Map(activeGames.results.map((game: any) => [game.publicId, game])).values(),
  )
  const hasHostedGame = uniqueActiveGames.some((game: any) => game.isHost)

  useEffect(() => {
    if (!isWebSocketConnected || !clerkUserId) {
      return
    }
    let cancelled = false
    void syncUser({ displayName: clerkDisplayName, avatarUrl: clerkAvatarUrl })
      .then(() => {
        if (!cancelled) {
          setReadyClerkUserId(clerkUserId)
          setBootstrapError(undefined)
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setReadyClerkUserId((ready) => (ready === clerkUserId ? undefined : ready))
          setBootstrapError(
            cause instanceof Error ? cause.message : "Could not prepare connected play",
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [clerkAvatarUrl, clerkDisplayName, clerkUserId, isWebSocketConnected, syncUser])

  useEffect(() => {
    if (
      !isWebSocketConnected ||
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
  }, [isWebSocketConnected, migrateMemberships, migrationRepository, projectionReady])

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
        {bootstrapError ? <AlertNote text={bootstrapError} /> : null}
        {uniqueActiveGames.length ? (
          <View style={themed($section)}>
            <Text
              preset="subheading"
              accessibilityRole="header"
              text="Pick up where you left off"
            />
            {uniqueActiveGames.map((game: any) => (
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
        ) : null}
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
        {!isWebSocketConnected ? (
          <AlertNote text="Connected play is offline. Hosting and joining need a connection." />
        ) : null}
        {hasHostedGame && isWebSocketConnected ? (
          <AlertNote
            tone="info"
            text="Resume or finish/abandon your hosted game before creating another."
          />
        ) : null}
        <Button
          testID="host-connected-button"
          text="Host a new game"
          disabled={!isWebSocketConnected || !projectionReady || hasHostedGame}
          preset="reversed"
          style={themed($primaryAction)}
          onPress={onHostNew}
        />
        <Button
          testID="join-connected-button"
          text="Join with code"
          disabled={!isWebSocketConnected || !projectionReady}
          style={themed($secondaryAction)}
          onPress={onJoin}
        />
      </BottomActionBar>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.lg,
  padding: spacing.lg,
  paddingBottom: spacing.xl,
})
const $hero: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $dimmed: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $primaryAction: ThemedStyle<ViewStyle> = () => ({ minHeight: 52 })
const $secondaryAction: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
const $listAction: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
const $loadMore: ThemedStyle<ViewStyle> = () => ({ minHeight: 44 })
