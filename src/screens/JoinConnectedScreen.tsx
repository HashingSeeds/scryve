import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"
import { useUser } from "@clerk/expo"
import { useConvexConnectionState, useMutation } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { Header } from "@/components/Header"
import { PlayerMark } from "@/components/PlayerMark"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { onlineOnlyNotice } from "@/features/connected/connectedCopy"
import { normalizeManualCode } from "@/features/connected/inviteLinks"
import { MAX_PLAYER_NAME_LENGTH, PLAYER_COLORS, validatePlayerNames } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { emitTelemetry } from "@/utils/telemetry"

import { api } from "../../convex/_generated/api"

export function JoinConnectedScreen({
  inviteToken,
  onJoined,
  onScan,
  initialCode = "",
  onBack,
}: {
  inviteToken?: string
  onJoined: (publicId: string) => void
  onScan?: () => void
  initialCode?: string
  onBack?: () => void
}) {
  const { themed } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const { user } = useUser()
  const { isWebSocketConnected } = useConvexConnectionState()
  const syncUser = useMutation(api.users.syncCurrent)
  const claimSeat = useMutation(api.games.claimSeat)
  const deviceId = useState(() => new LocalGameRepository().getDeviceId())[0]
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState(user?.fullName || user?.firstName || "Player")
  const [color, setColor] = useState(PLAYER_COLORS[0])
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const nameValidation = validatePlayerNames([name])
  const normalizedName = nameValidation.names[0]
  const validCode = Boolean(inviteToken || normalizeManualCode(code))
  const validInput = nameValidation.valid && validCode
  const title = inviteToken ? "Join invited lobby" : "Join with code"

  async function join() {
    const startedAt = Date.now()
    if (!isWebSocketConnected) {
      setError(onlineOnlyNotice("join"))
      return
    }
    try {
      setBusy(true)
      setError(undefined)
      if (!validInput) {
        setError("Enter a valid name and invitation code.")
        return
      }
      await syncUser({ displayName: normalizedName, avatarUrl: user?.imageUrl })
      const manualCode = inviteToken ? undefined : normalizeManualCode(code)
      if (!inviteToken && !manualCode) {
        setError("Enter a valid 6-character invitation code.")
        return
      }
      const result = await claimSeat({
        token: inviteToken,
        manualCode: manualCode ?? undefined,
        displayName: normalizedName,
        color: color.toUpperCase(),
        deviceId,
      })
      emitTelemetry("join.completed", { durationMs: Date.now() - startedAt, outcome: "success" })
      onJoined(result.publicId)
    } catch (cause) {
      emitTelemetry("join.failed", { durationMs: Date.now() - startedAt, outcome: "rejected" })
      setError(cause instanceof Error ? cause.message : "Could not join lobby")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header
        title={titleVisible ? title : ""}
        leftTx={onBack ? "common:back" : undefined}
        onLeftPress={onBack}
      />
      <ScrollView
        style={$styles.flex1}
        contentContainerStyle={themed($content)}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <View style={themed($hero)}>
          <Text preset="heading" accessibilityRole="header" text={title} />
          <Text
            size="sm"
            style={themed($dimmed)}
            text={
              inviteToken
                ? "Your invite is checked when you join. Lobby details stay hidden until your seat is claimed."
                : "Enter the 6-character code from the host, or scan their QR."
            }
          />
        </View>
        {!inviteToken ? (
          <View style={themed($section)}>
            <TextField
              testID="manual-code-input"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              label="Invite code"
              placeholder="ABC123"
              value={code}
              onChangeText={setCode}
              style={themed($codeInput)}
            />
            {onScan ? (
              <Button
                testID="scan-invite-button"
                text="Scan invite QR instead"
                style={themed($secondaryAction)}
                onPress={onScan}
              />
            ) : null}
          </View>
        ) : null}
        <View style={themed($section)}>
          <TextField
            testID="join-display-name"
            label="Display name"
            value={name}
            maxLength={MAX_PLAYER_NAME_LENGTH}
            status={nameValidation.errors[0] ? "error" : undefined}
            helper={nameValidation.errors[0]}
            onChangeText={setName}
          />
        </View>
        <View style={themed($section)}>
          <Text size="xs" style={themed($dimmed)} text="Your color" />
          <View style={themed($swatches)}>
            {PLAYER_COLORS.map((option, index) => {
              const selected = option.toUpperCase() === color.toUpperCase()
              return (
                <TouchableOpacity
                  key={option}
                  testID={`join-color-${option.replace("#", "").toLowerCase()}`}
                  accessibilityRole="radio"
                  accessibilityLabel={`Color ${index + 1}`}
                  accessibilityState={{ selected }}
                  activeOpacity={0.75}
                  style={[themed($swatch), selected && themed($selectedSwatch)]}
                  onPress={() => setColor(option)}
                >
                  <PlayerMark seatNumber={index + 1} color={option} size={32} />
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </ScrollView>
      <BottomActionBar>
        {error ? <AlertNote testID="join-error" text={error} /> : null}
        {!isWebSocketConnected ? <AlertNote text={onlineOnlyNotice("join")} /> : null}
        <Button
          testID="claim-seat-button"
          text={busy ? "Joining…" : "Claim open seat"}
          disabled={busy || !isWebSocketConnected || !validInput}
          preset="reversed"
          style={themed($primaryAction)}
          onPress={join}
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
const $codeInput: ThemedStyle<TextStyle> = () => ({ letterSpacing: 4 })
const $swatches: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $swatch: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  padding: spacing.xs,
  borderRadius: spacing.sm,
  borderWidth: 2,
  borderColor: colors.transparent,
})
const $selectedSwatch: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.tint })
const $primaryAction: ThemedStyle<ViewStyle> = () => ({ minHeight: 52 })
const $secondaryAction: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
