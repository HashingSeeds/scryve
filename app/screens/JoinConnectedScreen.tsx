import { useState } from "react"
import { useUser } from "@clerk/expo"
import { useConvexConnectionState, useMutation } from "convex/react"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { normalizeManualCode } from "@/features/connected/inviteLinks"
import { MAX_PLAYER_NAME_LENGTH, validatePlayerNames } from "@/features/game/domain"
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
  const { user } = useUser()
  const { isWebSocketConnected } = useConvexConnectionState()
  const syncUser = useMutation(api.users.syncCurrent)
  const claimSeat = useMutation(api.games.claimSeat)
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState(user?.fullName || user?.firstName || "Player")
  const [color, setColor] = useState("#2563EB")
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const nameValidation = validatePlayerNames([name])
  const normalizedName = nameValidation.names[0]
  const validColor = /^#[0-9A-Fa-f]{6}$/.test(color.trim())
  const validCode = Boolean(inviteToken || normalizeManualCode(code))
  const validInput = nameValidation.valid && validColor && validCode
  async function join() {
    const startedAt = Date.now()
    if (!isWebSocketConnected) {
      setError("Reconnect before claiming a seat; this action is not queued.")
      return
    }
    try {
      setBusy(true)
      setError(undefined)
      if (!validInput) {
        setError("Enter a valid name, color, and invitation code.")
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
        manualCode,
        displayName: normalizedName,
        color: color.trim().toUpperCase(),
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
    <Screen preset="scroll" safeAreaEdges={["top", "bottom"]}>
      <Header
        title={inviteToken ? "Join invited lobby" : "Join with code"}
        leftTx={onBack ? "common:back" : undefined}
        onLeftPress={onBack}
      />
      <Text
        preset="heading"
        accessibilityRole="header"
        text={inviteToken ? "Join invited lobby" : "Join with code"}
      />
      {!inviteToken ? (
        <>
          <TextField
            testID="manual-code-input"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            label="6-character code"
            value={code}
            onChangeText={setCode}
          />
          {onScan ? (
            <Button testID="scan-invite-button" text="Scan invite QR" onPress={onScan} />
          ) : null}
        </>
      ) : (
        <Text text="The private invite will be validated when you join; lobby details remain hidden until membership is claimed." />
      )}
      <TextField
        testID="join-display-name"
        label="Display name"
        value={name}
        maxLength={MAX_PLAYER_NAME_LENGTH}
        status={nameValidation.errors[0] ? "error" : undefined}
        helper={nameValidation.errors[0]}
        onChangeText={setName}
      />
      <TextField
        testID="join-color"
        label="Color (hex)"
        autoCapitalize="characters"
        value={color}
        status={validColor ? undefined : "error"}
        helper={validColor ? undefined : "Enter a 6-digit hex color such as #2563EB."}
        onChangeText={setColor}
      />
      {error ? <Text accessibilityRole="alert" text={error} /> : null}
      {!isWebSocketConnected ? (
        <Text accessibilityRole="alert" text="Seat claims are online-only." />
      ) : null}
      <Button
        testID="claim-seat-button"
        text={busy ? "Joining…" : "Claim open seat"}
        disabled={busy || !isWebSocketConnected || !validInput}
        preset="reversed"
        onPress={join}
      />
    </Screen>
  )
}
