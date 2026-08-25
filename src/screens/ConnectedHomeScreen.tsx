import { useEffect, useMemo, useRef, type ReactNode } from "react"
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
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { remotePage, type NextPageState } from "@/features/async/remoteState"
import type { ResumableGame } from "@/features/connected/connectedCopy"
import { ConnectedGameRow } from "@/features/connected/ConnectedGameRow"
import { ConnectedGameRepository } from "@/features/connected/persistence"
import {
  useConnectedProfile,
  type ConnectedProfileState,
} from "@/features/connected/useConnectedProfile"
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

type ConnectedGamesState =
  | { status: "preparing"; message: string }
  | { status: "loading" }
  | { status: "error"; message: string; retry?: () => void }
  | { status: "ready"; games: ResumableGame[]; nextPage: NextPageState }

export function ConnectedHomeScreen({
  onHostNew,
  onJoin,
  onHistory,
  onDecks,
  onResume,
  onBack,
}: ConnectedHomeScreenProps) {
  const now = useRef(Date.now()).current
  const connectedProfile = useConnectedProfile()
  const clerkUserId = connectedProfile.profile?.userId
  const migrationRepository = useMemo(
    () => (clerkUserId ? new ConnectedGameRepository(undefined, clerkUserId) : null),
    [clerkUserId],
  )
  return (
    <ConnectedGamesSource
      connectedProfile={connectedProfile}
      migrationRepository={migrationRepository}
    >
      {(gamesState) => (
        <ConnectedHomeLayout
          onHostNew={onHostNew}
          onJoin={onJoin}
          onHistory={onHistory}
          onDecks={onDecks}
          onResume={onResume}
          onBack={onBack}
          connectedProfile={connectedProfile}
          gamesState={gamesState}
          now={now}
        />
      )}
    </ConnectedGamesSource>
  )
}

function ConnectedGamesSource({
  connectedProfile,
  migrationRepository,
  children,
}: {
  connectedProfile: ConnectedProfileState
  migrationRepository: ConnectedGameRepository | null
  children: (state: ConnectedGamesState) => ReactNode
}) {
  return (
    <ConvexQueryBoundary
      resetKey={connectedProfile.profile?.userId}
      fallback={({ retry }) =>
        children({
          status: "error",
          message: "Could not load your connected games.",
          retry,
        })
      }
    >
      <ConnectedGamesQuery
        connectedProfile={connectedProfile}
        migrationRepository={migrationRepository}
      >
        {children}
      </ConnectedGamesQuery>
    </ConvexQueryBoundary>
  )
}

function ConnectedGamesQuery({
  connectedProfile,
  migrationRepository,
  children,
}: {
  connectedProfile: ConnectedProfileState
  migrationRepository: ConnectedGameRepository | null
  children: (state: ConnectedGamesState) => ReactNode
}) {
  const migrateMemberships = useMutation(api.games.migrateMyGameMemberships)
  const projectionReady = connectedProfile.status === "ready"
  const activeGames = usePaginatedQuery(
    api.games.activeConnectedGames,
    projectionReady ? {} : "skip",
    { initialNumItems: 10 },
  )

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

  if (connectedProfile.status === "loading") {
    return children({
      status: "preparing",
      message:
        connectedProfile.reason === "session"
          ? "Checking your connected session…"
          : connectedProfile.reason === "authentication"
            ? "Connecting your account…"
            : "Preparing your connected profile…",
    })
  }
  if (connectedProfile.status === "offline") {
    return children({
      status: "error",
      message: "Connected play is offline. Reconnect to load your games.",
    })
  }
  if (connectedProfile.status === "error") {
    return children({
      status: "error",
      message: connectedProfile.message,
      retry: connectedProfile.retry,
    })
  }

  const page = remotePage(activeGames, 10)
  if (page.status === "loading") return children({ status: "loading" })

  const games = Array.from(
    new Map(page.items.map((game) => [game.publicId, game])).values(),
  ).filter(
    (game): game is typeof game & { status: "lobby" | "active" } =>
      game.status === "lobby" || game.status === "active",
  )
  return children({ status: "ready", games, nextPage: page.nextPage })
}

function ConnectedHomeLayout({
  onHostNew,
  onJoin,
  onHistory,
  onDecks,
  onResume,
  onBack,
  connectedProfile,
  gamesState,
  now,
}: ConnectedHomeScreenProps & {
  connectedProfile: ConnectedProfileState
  gamesState: ConnectedGamesState
  now: number
}) {
  const { themed } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const projectionReady = connectedProfile.status === "ready" && gamesState.status === "ready"
  const hasHostedGame =
    gamesState.status === "ready" && gamesState.games.some((game) => game.isHost)

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
        {gamesState.status === "ready" && gamesState.games.length ? (
          <View style={[themed($section), $styles.flex1]}>
            <Text
              preset="subheading"
              accessibilityRole="header"
              text="Pick up where you left off"
            />
            {gamesState.games.map((game) => (
              <ConnectedGameRow
                key={game.publicId}
                game={game}
                now={now}
                onPress={() => onResume?.(game)}
              />
            ))}
            {gamesState.nextPage.status === "available" ? (
              <Button
                text="Load more"
                style={themed($loadMore)}
                onPress={gamesState.nextPage.load}
              />
            ) : gamesState.nextPage.status === "loading" ? (
              <Text
                accessibilityLiveRegion="polite"
                size="xs"
                style={themed($loadingMore)}
                text="Loading more games…"
              />
            ) : null}
          </View>
        ) : gamesState.status === "ready" ? (
          <View testID="no-active-connected-games" style={themed($empty)}>
            <Text preset="subheading" style={themed($emptyHeading)} text="No games in progress" />
            <Text
              size="sm"
              style={themed($emptyCopy)}
              text="Host a lobby and share the code, or join a friend's game to see it here."
            />
          </View>
        ) : (
          <ConnectedGamesPlaceholder state={gamesState} />
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

function ConnectedGamesPlaceholder({
  state,
}: {
  state: Exclude<ConnectedGamesState, { status: "ready" }>
}) {
  const { themed } = useAppTheme()
  const loading = state.status !== "error"
  const message =
    state.status === "preparing"
      ? state.message
      : state.status === "loading"
        ? "Loading your games…"
        : state.message
  return (
    <View testID="connected-games-placeholder" style={[themed($section), $styles.flex1]}>
      <Text preset="subheading" accessibilityRole="header" text="Pick up where you left off" />
      {state.status === "error" ? <AlertNote text={message} /> : null}
      {loading ? (
        <Text
          accessibilityRole="progressbar"
          accessibilityLiveRegion="polite"
          size="xs"
          style={themed($dimmed)}
          text={message}
        />
      ) : null}
      {Array.from({ length: 2 }).map((_, index) => (
        <View key={index} testID="connected-game-row-placeholder" style={themed($gamePlaceholder)}>
          <View style={themed($placeholderDot)} />
          <View style={themed($placeholderCopy)}>
            <View style={themed($placeholderTitle)} />
            <View style={themed($placeholderDetail)} />
          </View>
        </View>
      ))}
      {state.status === "error" && state.retry ? (
        <Button
          testID="retry-connected-games-button"
          text="Try again"
          style={themed($retry)}
          onPress={state.retry}
        />
      ) : null}
    </View>
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
const $loadingMore: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})
const $gamePlaceholder: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 64,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
  borderRadius: spacing.sm,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $placeholderDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 10,
  height: 10,
  borderRadius: 5,
  backgroundColor: colors.palette.neutral300,
})
const $placeholderCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  gap: spacing.xxs,
})
const $placeholderTitle: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "58%",
  height: 16,
  borderRadius: 2,
  backgroundColor: colors.palette.neutral300,
})
const $placeholderDetail: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "78%",
  height: 12,
  borderRadius: 2,
  backgroundColor: colors.palette.neutral200,
})
const $retry: ThemedStyle<ViewStyle> = () => ({ minHeight: 44 })
