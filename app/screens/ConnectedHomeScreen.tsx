import { useEffect, useMemo, useState } from "react"
import { View } from "react-native"
import { useUser } from "@clerk/expo"
import { useConvexConnectionState, useMutation, usePaginatedQuery } from "convex/react"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { createLobbyIdentifiers } from "@/features/connected/identifiers"
import { ConnectedGameRepository } from "@/features/connected/persistence"
import {
  STARTING_LIFE_PRESETS,
  validatePlayerCount,
  validateStartingLife,
} from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"

import { api } from "../../convex/_generated/api"

export interface ConnectedHomeScreenProps {
  onLobbyCreated: (lobby: { publicId: string; inviteToken: string; manualCode: string }) => void
  onJoin: () => void
  onHistory?: () => void
  onResume?: (game: { publicId: string; status: "lobby" | "active" }) => void
  onBack?: () => void
}

export function ConnectedHomeScreen({
  onLobbyCreated,
  onJoin,
  onHistory,
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
  const createLobby = useMutation(api.games.createLobby)
  const deviceId = useMemo(() => new LocalGameRepository().getDeviceId(), [])
  const [playerCount, setPlayerCount] = useState(2)
  const [startingLife, setStartingLife] = useState("20")
  const [showCustomStartingLife, setShowCustomStartingLife] = useState(false)
  const [ruleset, setRuleset] = useState("standard")
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [readyClerkUserId, setReadyClerkUserId] = useState<string>()
  const [bootstrapError, setBootstrapError] = useState<string>()
  const startingLifeNumber = Number(startingLife)
  const validPlayerCount = validatePlayerCount(playerCount)
  const validStartingLife = validateStartingLife(startingLifeNumber)
  const normalizedRuleset = ruleset.trim()
  const validRuleset = normalizedRuleset.length > 0 && normalizedRuleset.length <= 32
  const validSetup = validPlayerCount && validStartingLife && validRuleset
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

  async function host() {
    if (!isWebSocketConnected) {
      setError("Reconnect before hosting; lobby creation is not queued.")
      return
    }
    try {
      setBusy(true)
      setError(undefined)
      const displayName = user?.fullName || user?.firstName || "Player"
      await syncUser({ displayName, avatarUrl: user?.imageUrl })
      const ids = await createLobbyIdentifiers()
      const result = await createLobby({
        ...ids,
        playerCount,
        startingLife: startingLifeNumber,
        ruleset: normalizedRuleset,
        hostDisplayName: displayName,
        hostColor: "#7C3AED",
        deviceId,
      })
      onLobbyCreated(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create lobby")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]}>
      <Header
        title="Connected play"
        leftTx={onBack ? "common:back" : undefined}
        onLeftPress={onBack}
      />
      <Text preset="heading" accessibilityRole="header" text="Connected play" />
      <Text text="Host a resilient live game, or join an existing lobby." />
      {!projectionReady && isWebSocketConnected ? (
        <Text text="Preparing your connected-play profile…" />
      ) : null}
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
        <Text preset="subheading" accessibilityRole="header" text="Seats" />
        <View style={$choices}>
          {[2, 3, 4, 5, 6].map((count) => (
            <Button
              key={count}
              text={String(count)}
              accessibilityLabel={`${count} seats`}
              accessibilityState={{ selected: playerCount === count }}
              preset={playerCount === count ? "reversed" : "default"}
              style={$choice}
              onPress={() => setPlayerCount(count)}
            />
          ))}
        </View>
        <Text preset="subheading" accessibilityRole="header" text="Starting life" />
        <View style={$choices}>
          {STARTING_LIFE_PRESETS.map((life) => (
            <Button
              key={life}
              text={String(life)}
              accessibilityLabel={`Start at ${life} life`}
              accessibilityState={{ selected: startingLifeNumber === life }}
              preset={startingLifeNumber === life ? "reversed" : "default"}
              style={$choice}
              onPress={() => setStartingLife(String(life))}
            />
          ))}
          {!showCustomStartingLife ? (
            <Button
              text="…"
              accessibilityLabel="Use custom starting life"
              style={$choice}
              onPress={() => setShowCustomStartingLife(true)}
            />
          ) : null}
        </View>
        {showCustomStartingLife ? (
          <TextField
            testID="connected-starting-life"
            label="Custom starting life"
            keyboardType="number-pad"
            value={startingLife}
            status={validStartingLife ? undefined : "error"}
            helper={
              validStartingLife
                ? "Whole number from 1 to 999."
                : "Enter a whole number from 1 to 999."
            }
            onChangeText={setStartingLife}
          />
        ) : null}
        <TextField
          testID="connected-ruleset"
          label="Ruleset"
          value={ruleset}
          maxLength={32}
          status={validRuleset ? undefined : "error"}
          helper={validRuleset ? undefined : "Enter a ruleset name up to 32 characters."}
          onChangeText={setRuleset}
        />
        {error ? <Text accessibilityRole="alert" text={error} /> : null}
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
          text={busy ? "Creating…" : "Host lobby"}
          disabled={
            busy || !isWebSocketConnected || !projectionReady || !validSetup || hasHostedGame
          }
          preset="reversed"
          onPress={host}
        />
        <Button
          testID="join-connected-button"
          text="Join with code"
          disabled={!isWebSocketConnected || !projectionReady}
          onPress={onJoin}
        />
        <Button text="Connected history" disabled={!projectionReady} onPress={onHistory} />
      </View>
    </Screen>
  )
}

const $form = { gap: 12, marginTop: 20 }
const $choices = { flexDirection: "row", flexWrap: "wrap", gap: 8 } as const
const $choice = { minWidth: 56, minHeight: 48, flexGrow: 1 } as const
