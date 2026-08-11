import { useEffect, useMemo, useState } from "react"
import { View } from "react-native"
import { useUser } from "@clerk/expo"
import { useConvexConnectionState, useMutation, usePaginatedQuery } from "convex/react"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ConnectedGameRepository } from "@/features/connected/persistence"

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
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentInset="standard">
      <Header
        title="Connected play"
        leftTx={onBack ? "common:back" : undefined}
        onLeftPress={onBack}
      />
      <Text preset="heading" accessibilityRole="header" text="Connected play" />
      <Text text="Host a resilient live game, or join an existing lobby." />
      {bootstrapError ? <Text accessibilityRole="alert" text={bootstrapError} /> : null}
      {uniqueActiveGames.length ? (
        <View style={$form}>
          <Text preset="subheading" accessibilityRole="header" text="Resume connected game" />
          {uniqueActiveGames.map((game: any) => (
            <Button
              key={game.publicId}
              testID={`resume-connected-${game.publicId}`}
              text={`${game.isHost ? "Hosted" : "Joined"} ${game.status} · ${game.ruleset} · ${game.playerCount} seats · ${new Date(game.updatedAt).toLocaleString()}`}
              onPress={() => onResume?.(game)}
            />
          ))}
          {activeGames.status === "CanLoadMore" ? (
            <Button text="Load more active games" onPress={() => activeGames.loadMore(10)} />
          ) : null}
        </View>
      ) : null}
      <View style={$form}>
        {!isWebSocketConnected ? (
          <Text accessibilityRole="alert" text="Connected actions are online-only." />
        ) : null}
        {hasHostedGame ? (
          <Text
            accessibilityRole="alert"
            text="Resume or finish/abandon your hosted game before creating another."
          />
        ) : null}
        <Button
          testID="host-connected-button"
          text="Host a new game"
          disabled={!isWebSocketConnected || !projectionReady || hasHostedGame}
          preset="reversed"
          onPress={onHostNew}
        />
        <Button
          testID="join-connected-button"
          text="Join with code"
          disabled={!isWebSocketConnected || !projectionReady}
          onPress={onJoin}
        />
        <Button text="Connected history" disabled={!projectionReady} onPress={onHistory} />
        <Button text="Decks" disabled={!projectionReady} onPress={onDecks} />
      </View>
    </Screen>
  )
}

const $form = { gap: 12, marginTop: 20 }
