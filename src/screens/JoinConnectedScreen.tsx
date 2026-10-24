import { useState, type ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { useUser } from "@clerk/expo"
import { useMutation } from "convex/react"

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
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { hasLocalGameStarted } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { PLAY_SYSTEM_IDS } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { captureAnalytics } from "@/utils/analytics"
import { convexErrorMessage } from "@/utils/convexError"
import { emitTelemetry } from "@/utils/telemetry"

import { InviteScannerScreen } from "./InviteScannerScreen"
import { api } from "../../convex/_generated/api"
import { PLAYER_COLOR_CHOICES } from "../../convex/lib/appearance"

// why: the server refuses games in a system this build cannot play, rather than letting it render as another one.
const PLAYABLE_SYSTEMS = [...PLAY_SYSTEM_IDS]
const PLAYABLE_VARIANTS = ["treachery"]

const MANUAL_CODE_EXAMPLE = "ABC123"

export function JoinConnectedScreen({
  inviteToken,
  access,
  onJoined,
  onScan,
  initialCode = "",
  onBack,
  embedded = false,
  onCodeChange,
  nearby,
}: {
  embedded?: boolean
  nearby?: ReactNode
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
    theme: { colors },
  } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const { user } = useUser()
  const isWebSocketConnected = useConvexOnline()
  const syncUser = useMutation(api.users.syncCurrent)
  const claimSeat = useMutation(api.games.claimSeat)
  const claimableSeats = useMutation(api.games.claimableSeats)
  const deviceId = useState(() => new LocalGameRepository().getDeviceId())[0]
  const [code, setCode] = useState(initialCode)
  const [scanning, setScanning] = useState(false)
  const [scannedToken, setScannedToken] = useState<string>()
  const token = scannedToken ?? inviteToken
  function changeCode(value: string) {
    setCode(value)
    setOpenSeats(undefined)
    onCodeChange?.(value)
  }
  function chooseToken(value?: string) {
    setScannedToken(value)
    setOpenSeats(undefined)
  }
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [openSeats, setOpenSeats] = useState<number[]>()
  const profileName = connectedProfileName(user?.username)
  const validInput = Boolean(token || normalizeManualCode(code))
  const picking = (openSeats?.length ?? 0) > 1
  const title = translate(token ? "connected:join.invitedTitle" : "connected:join.codeTitle")

  async function join(seat?: number) {
    captureAnalytics("connection_attempt", { action: "join", stage: "started" })
    if (access && !access.ready) {
      captureAnalytics("connection_attempt", { action: "join", stage: "failed", reason: "access" })
      access.request()
      return
    }
    const startedAt = Date.now()
    let failureReason: "profile" | "request" | "local-active" = "profile"
    const activeLocal = new LocalGameRepository().loadActiveGame()
    if (activeLocal && hasLocalGameStarted(activeLocal)) {
      captureAnalytics("connection_attempt", {
        action: "join",
        stage: "failed",
        reason: "local-active",
      })
      setError(translate("connected:join.localGameActive"))
      return
    }
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
        setError(translate("connected:join.invalidCode"))
        return
      }
      await syncUser({
        displayName: profileName,
        avatarUrl: user?.imageUrl,
        username: user?.username ?? "",
      })
      const manualCode = token ? undefined : normalizeManualCode(code)
      if (!token && !manualCode) {
        captureAnalytics("connection_attempt", { action: "join", stage: "failed", reason: "input" })
        setError(translate("connected:join.invalidManualCode"))
        return
      }
      failureReason = "request"
      const lookup = await claimableSeats({
        token,
        manualCode: manualCode ?? undefined,
        systems: PLAYABLE_SYSTEMS,
        variants: PLAYABLE_VARIANTS,
      })
      if ("invalid" in lookup) throw new Error(translate("connected:join.invalidInvite"))
      const seats = lookup.seats
      if (seats.length > 1 && seat === undefined) {
        setOpenSeats(seats)
        return
      }
      if (seat !== undefined && !seats.includes(seat)) {
        setOpenSeats(seats.length > 1 ? seats : undefined)
        setError(translate("connected:join.seatTaken"))
        return
      }
      const result = await claimSeat({
        token,
        manualCode: manualCode ?? undefined,
        ...(seat === undefined ? {} : { seat }),
        displayName: profileName,
        color: PLAYER_COLOR_CHOICES[0],
        deviceId,
        systems: PLAYABLE_SYSTEMS,
        variants: PLAYABLE_VARIANTS,
      })
      if (!result) throw new Error(translate("connected:join.invalidInvite"))
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
      setError(
        convexErrorMessage(
          cause,
          cause instanceof Error ? cause.message : translate("connected:join.failed"),
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const joinOfflineNotice = onlineOnlyNotice("join")

  if (scanning)
    return (
      <InviteScannerScreen
        embedded={embedded}
        onCancel={() => setScanning(false)}
        onInvite={(invite) => {
          setError(undefined)
          if (invite.kind === "token") chooseToken(invite.token)
          else {
            chooseToken(undefined)
            changeCode(invite.code)
          }
          setScanning(false)
        }}
      />
    )

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
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
        {token ? null : nearby}
        <View style={themed($hero)}>
          <Text
            preset={embedded ? "subheading" : "heading"}
            accessibilityRole="header"
            text={title}
          />
          <Text
            size="sm"
            style={themed($dimmed)}
            tx={token ? "connected:join.invitedBody" : "connected:join.codeBody"}
          />
        </View>
        {!token ? (
          <View style={themed($section)}>
            <TextField
              testID="manual-code-input"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              labelTx="connected:invite.code"
              placeholder={MANUAL_CODE_EXAMPLE}
              value={code}
              onChangeText={changeCode}
              style={themed($codeInput)}
            />
            {onScan || embedded ? (
              <Button
                testID="scan-invite-button"
                tx="connected:join.scan"
                style={themed($secondaryAction)}
                onPress={onScan ?? (() => setScanning(true))}
              />
            ) : null}
          </View>
        ) : null}
        {scannedToken ? (
          <Button tx="connected:join.differentInvitation" onPress={() => chooseToken(undefined)} />
        ) : null}
        {user?.username ? (
          <View style={themed($section)}>
            <Text
              testID="join-username"
              weight="medium"
              tx="connected:join.joiningAs"
              txOptions={{ username: user.username }}
            />
          </View>
        ) : null}
        {picking ? (
          <View style={themed($section)}>
            <Text weight="medium" tx="connected:join.pickSeat" />
            <Text size="xs" style={themed($dimmed)} tx="connected:join.pickSeatBody" />
            {openSeats?.map((seat) => (
              <Button
                key={seat}
                testID={`claim-seat-${seat}-button`}
                tx="connected:seatNumber"
                txOptions={{ seat }}
                disabled={busy}
                onPress={() => void join(seat)}
              />
            ))}
          </View>
        ) : null}
        {access?.message ? <Text size="xs" text={access.message} /> : null}
        {error ? <AlertNote testID="join-error" text={error} /> : null}
        {!isWebSocketConnected ? <AlertNote text={joinOfflineNotice} /> : null}
      </ScrollView>
      <BottomActionBar style={embedded ? themed($embeddedFooter) : undefined}>
        <View style={embedded ? themed($embeddedActions) : undefined}>
          <Button
            testID="claim-seat-button"
            disabled={
              busy ||
              picking ||
              Boolean(access?.loading) ||
              (!access && !isWebSocketConnected) ||
              !validInput
            }
            text={
              busy
                ? translate("connected:join.joining")
                : access && !access.ready && !access.loading
                  ? (access.actionLabel ?? translate("connected:join.join"))
                  : translate("connected:join.join")
            }
            preset="reversed"
            style={embedded ? undefined : themed($primaryAction)}
            onPress={() => void join()}
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
})
const $footerSpace: ViewStyle = { height: 44 }

const $embeddedActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720 - spacing.lg * 2,
  alignSelf: "center",
  gap: spacing.xs,
})
