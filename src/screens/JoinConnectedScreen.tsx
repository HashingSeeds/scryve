import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { useUser } from "@clerk/expo"
import { useConvexConnectionState, useMutation } from "convex/react"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { onlineOnlyNotice } from "@/features/connected/connectedCopy"
import { normalizeManualCode } from "@/features/connected/inviteLinks"
import { connectedProfileName } from "@/features/connected/useConnectedProfile"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { captureAnalytics } from "@/utils/analytics"
import { emitTelemetry } from "@/utils/telemetry"

import { InviteScannerScreen } from "./InviteScannerScreen"
import { api } from "../../convex/_generated/api"
import {
  PLAYER_COLOR_CHOICES,
  shapeForSeat,
  type PlayerAppearance,
} from "../../convex/lib/appearance"

export function JoinConnectedScreen({
  inviteToken,
  access,
  onJoined,
  onScan,
  initialCode = "",
  onBack,
  embedded = false,
  onCodeChange,
}: {
  embedded?: boolean
  onCodeChange?: (code: string) => void
  inviteToken?: string
  access?: CloudAccess
  onJoined: (publicId: string) => void
  onScan?: () => void
  initialCode?: string
  onBack?: () => void
}) {
  const {
    themed,
    theme: { colors, spacing },
  } = useAppTheme()
  const { bottom } = useSafeAreaInsets()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const { user } = useUser()
  const { isWebSocketConnected } = useConvexConnectionState()
  const syncUser = useMutation(api.users.syncCurrent)
  const claimSeat = useMutation(api.games.claimSeat)
  const deviceId = useState(() => new LocalGameRepository().getDeviceId())[0]
  const [code, setCode] = useState(initialCode)
  const [scanning, setScanning] = useState(false)
  const [scannedToken, setScannedToken] = useState<string>()
  const token = scannedToken ?? inviteToken
  function changeCode(value: string) {
    setCode(value)
    onCodeChange?.(value)
  }
  const [appearance] = useState<PlayerAppearance>({
    color: PLAYER_COLOR_CHOICES[0],
    shape: shapeForSeat(1),
  })
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const profileName = connectedProfileName(user?.username)
  const validInput = Boolean(token || normalizeManualCode(code))
  const title = token ? "Join invited lobby" : "Join with code"

  async function join() {
    captureAnalytics("connection_attempt", { action: "join", stage: "started" })
    if (access && !access.ready) {
      captureAnalytics("connection_attempt", { action: "join", stage: "failed", reason: "access" })
      access.request()
      return
    }
    const startedAt = Date.now()
    let failureReason: "profile" | "request" = "profile"
    if (!isWebSocketConnected) {
      captureAnalytics("connection_attempt", { action: "join", stage: "failed", reason: "offline" })
      setError(onlineOnlyNotice("join"))
      return
    }
    let requestSucceeded = false
    try {
      setBusy(true)
      setError(undefined)
      if (!validInput) {
        captureAnalytics("connection_attempt", { action: "join", stage: "failed", reason: "input" })
        setError("Enter a valid invitation code.")
        return
      }
      await syncUser({ displayName: profileName, avatarUrl: user?.imageUrl })
      const manualCode = token ? undefined : normalizeManualCode(code)
      if (!token && !manualCode) {
        captureAnalytics("connection_attempt", { action: "join", stage: "failed", reason: "input" })
        setError("Enter a valid 6-character invitation code.")
        return
      }
      failureReason = "request"
      const result = await claimSeat({
        token,
        manualCode: manualCode ?? undefined,
        displayName: profileName,
        color: appearance.color.toUpperCase(),
        shape: appearance.shape,
        deviceId,
      })
      requestSucceeded = true
      emitTelemetry("join.completed", { durationMs: Date.now() - startedAt, outcome: "success" })
      captureAnalytics("connection_attempt", { action: "join", stage: "succeeded" })
      onJoined(result.publicId)
    } catch (cause) {
      if (!requestSucceeded) {
        captureAnalytics("connection_attempt", {
          action: "join",
          stage: "failed",
          reason: failureReason,
        })
        emitTelemetry("join.failed", { durationMs: Date.now() - startedAt, outcome: "rejected" })
      }
      setError(cause instanceof Error ? cause.message : "Could not join lobby")
    } finally {
      setBusy(false)
    }
  }

  if (scanning)
    return (
      <InviteScannerScreen
        embedded={embedded}
        onCancel={() => setScanning(false)}
        onInvite={(invite) => {
          setError(undefined)
          if (invite.kind === "token") setScannedToken(invite.token)
          else {
            setScannedToken(undefined)
            changeCode(invite.code)
          }
          setScanning(false)
        }}
      />
    )

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={embedded ? [] : ["bottom"]}
      backgroundColor={embedded ? colors.surface : undefined}
      contentContainerStyle={themed($screen)}
    >
      {!embedded ? (
        <Header
          title={titleVisible ? title : ""}
          leftTx={onBack ? "common:back" : undefined}
          onLeftPress={onBack}
        />
      ) : null}
      <ScrollView
        style={$styles.flex1}
        contentContainerStyle={[themed($content), embedded && themed($embeddedContent)]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <View style={themed($hero)}>
          <Text
            preset={embedded ? "subheading" : "heading"}
            accessibilityRole="header"
            text={title}
          />
          <Text
            size="sm"
            style={themed($dimmed)}
            text={
              token
                ? "Join your friends using this invitation."
                : "Enter the host's 6-character code."
            }
          />
        </View>
        {!token ? (
          <View style={themed($section)}>
            <TextField
              testID="manual-code-input"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              label="Invite code"
              placeholder="ABC123"
              value={code}
              onChangeText={changeCode}
              style={themed($codeInput)}
            />
            {onScan || embedded ? (
              <Button
                testID="scan-invite-button"
                text="Scan QR code"
                style={themed($secondaryAction)}
                onPress={onScan ?? (() => setScanning(true))}
              />
            ) : null}
          </View>
        ) : null}
        {scannedToken ? (
          <Button text="Use a different invitation" onPress={() => setScannedToken(undefined)} />
        ) : null}
        {user?.username ? (
          <View style={themed($section)}>
            <Text testID="join-username" weight="medium" text={`Joining as @${user.username}`} />
          </View>
        ) : null}
        {access?.message ? <Text size="xs" text={access.message} /> : null}
        {error ? <AlertNote testID="join-error" text={error} /> : null}
        {!isWebSocketConnected ? <AlertNote text={onlineOnlyNotice("join")} /> : null}
      </ScrollView>
      <BottomActionBar
        style={
          embedded
            ? [themed($embeddedFooter), { paddingBottom: Math.max(bottom, spacing.sm) }]
            : undefined
        }
      >
        <View style={embedded ? themed($embeddedActions) : undefined}>
          <Button
            testID="claim-seat-button"
            text={
              busy
                ? "Joining…"
                : access && !access.ready && !access.loading
                  ? (access.actionLabel ?? "Join game")
                  : "Join game"
            }
            disabled={
              busy || Boolean(access?.loading) || (!access && !isWebSocketConnected) || !validInput
            }
            preset="reversed"
            style={embedded ? undefined : themed($primaryAction)}
            onPress={join}
          />
          {embedded ? <View style={$footerSpace} /> : null}
        </View>
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
const $codeInput: ThemedStyle<TextStyle> = () => ({ letterSpacing: 4 })
const $primaryAction: ThemedStyle<ViewStyle> = () => ({ minHeight: 52 })
const $secondaryAction: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })

const $embeddedContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  paddingTop: 0,
  gap: spacing.md,
})
const $embeddedFooter: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.surface,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.sm,
  paddingBottom: spacing.sm,
})
const $footerSpace: ViewStyle = { height: 44 }

const $embeddedActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720 - spacing.lg * 2,
  alignSelf: "center",
  gap: spacing.xs,
})
