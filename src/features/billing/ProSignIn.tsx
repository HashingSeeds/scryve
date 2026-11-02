import { useEffect, useState } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { useRevenueCat } from "./RevenueCatContext"

type Step = "idle" | "explaining" | "signingIn"

const SESSION_SYNC_GRACE_MS = 5000

export function useProSignIn(openPaywall: () => void) {
  const auth = useAuthAccess()
  const billing = useRevenueCat()
  const [step, setStep] = useState<Step>("idle")
  const billingSettled = billing.isReady && !billing.isLoading

  const waitingForSession = step === "signingIn" && !auth.authVisible && !auth.isSignedIn
  useEffect(() => {
    if (!waitingForSession) return
    // why: Clerk's native sheet closes before JS sees the new session (0.6s on an Android emulator), so a closed sheet means cancelled only once the session has had time to land.
    const timer = setTimeout(() => setStep("idle"), SESSION_SYNC_GRACE_MS)
    return () => clearTimeout(timer)
  }, [waitingForSession])

  useEffect(() => {
    if (step !== "signingIn" || auth.authVisible || !auth.isSignedIn || !billingSettled) return
    setStep("idle")
    if (!billing.isCountPro) openPaywall()
  }, [step, auth.authVisible, auth.isSignedIn, billingSettled, billing.isCountPro, openPaywall])

  return {
    explaining: step === "explaining",
    request: () => (auth.isSignedIn ? openPaywall() : setStep("explaining")),
    dismiss: () => setStep((current) => (current === "explaining" ? "idle" : current)),
    signIn: () => {
      setStep("signingIn")
      auth.openAuth()
    },
  }
}

export function ProSignInNote({ onSignIn }: { onSignIn: () => void }) {
  const { themed } = useAppTheme()
  return (
    <View testID="pro-sign-in-note" style={themed($note)}>
      <Text size="xs" style={$flex1} tx="account:billing.proNeedsAccount" />
      <Button testID="pro-sign-in" preset="primary" tx="account:signIn" onPress={onSignIn} />
    </View>
  )
}

const $note: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $flex1: ViewStyle = { flex: 1 }
