import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { AppState, Linking, Platform, ScrollView, View } from "react-native"
import { CameraView, ScanningResult, useCameraPermissions } from "expo-camera"
import * as Haptics from "expo-haptics"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { readPublicCloudConfig } from "@/features/auth/config"
import { InvitePayload, normalizeInvitePayload } from "@/features/connected/inviteLinks"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { delay } from "@/utils/delay"
import { useReducedMotion } from "@/utils/useReducedMotion"

const SCAN_CONFIRMATION_MS = 250

function wasScannerCancellation(cause: unknown): boolean {
  return cause instanceof Error && cause.message.toLowerCase().includes("cancel")
}

export function InviteScannerScreen({
  onInvite,
  onCancel,
}: {
  onInvite: (invite: InvitePayload) => void
  onCancel: () => void
}) {
  const [permission, requestPermission] = useCameraPermissions()
  const [error, setError] = useState<string>()
  const [openingScanner, setOpeningScanner] = useState(false)
  const accepted = useRef(false)
  const processing = useRef(false)
  const autoLaunched = useRef(false)
  const reducedMotion = useReducedMotion()
  const config = readPublicCloudConfig()
  const inviteOrigin = config.configured ? config.value.inviteOrigin : undefined
  const modernScannerAvailable = Platform.OS !== "web" && CameraView.isModernBarcodeScannerAvailable
  const hasRequiredPermission = Platform.OS !== "ios" || permission?.granted === true
  const scannerReady = modernScannerAvailable && hasRequiredPermission

  const scan = useCallback(
    async (result: ScanningResult) => {
      if (accepted.current || processing.current) return
      processing.current = true
      const invite = normalizeInvitePayload(result.data, inviteOrigin)

      if (!invite) {
        if (reducedMotion === false) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
            () => undefined,
          )
        }
        await CameraView.dismissScanner().catch(() => undefined)
        setError(
          "That QR is not a trusted Scryve invitation. Try another code or enter it manually.",
        )
        processing.current = false
        return
      }

      accepted.current = true
      if (reducedMotion === false) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        )
        await delay(SCAN_CONFIRMATION_MS)
      }
      await CameraView.dismissScanner().catch(() => undefined)
      onInvite(invite)
    },
    [inviteOrigin, onInvite, reducedMotion],
  )

  const openScanner = useCallback(async () => {
    if (!scannerReady || openingScanner) return
    setError(undefined)
    setOpeningScanner(true)
    try {
      await CameraView.launchScanner({
        barcodeTypes: ["qr"],
        isGuidanceEnabled: true,
        isHighlightingEnabled: true,
        isPinchToZoomEnabled: true,
      })
    } catch (cause) {
      if (!accepted.current && !wasScannerCancellation(cause)) {
        const message =
          cause instanceof Error ? cause.message : "The native scanner could not open."
        setError(`QR scanner could not open: ${message}`)
      }
    } finally {
      setOpeningScanner(false)
    }
  }, [openingScanner, scannerReady])

  useEffect(() => {
    if (!scannerReady) return
    const subscription = CameraView.onModernBarcodeScanned((result) => void scan(result))
    return () => subscription.remove()
  }, [scan, scannerReady])

  useEffect(() => {
    if (!scannerReady || autoLaunched.current) return
    autoLaunched.current = true
    void openScanner()
  }, [openScanner, scannerReady])

  if (Platform.OS === "web") {
    return (
      <ScannerLayout
        title="Scan invite"
        body="Camera QR scanning is available in the iOS and Android app. Enter the 6-character code instead."
        actions={<Button text="Enter code manually" preset="reversed" onPress={onCancel} />}
      />
    )
  }

  if (Platform.OS === "ios" && !permission?.granted) {
    const canAsk = permission?.canAskAgain !== false
    return (
      <ScannerLayout
        title="Camera permission"
        body="Scryve uses the camera only while this screen is open to read an invitation QR. Images are not captured, stored, or uploaded."
        notice={
          canAsk ? undefined : (
            <AlertNote
              tone="info"
              text="Camera access is denied. You can enable it in system settings or enter the code manually."
            />
          )
        }
        actions={
          <>
            {canAsk ? (
              <Button
                text="Allow camera"
                preset="reversed"
                onPress={() => void requestPermission()}
              />
            ) : (
              <Button
                text="Open settings"
                preset="reversed"
                onPress={() => void Linking.openSettings().then(() => AppState.currentState)}
              />
            )}
            <Button text="Enter code manually" onPress={onCancel} />
          </>
        }
      />
    )
  }

  if (!modernScannerAvailable) {
    return (
      <ScannerLayout
        title="Scan invite"
        notice={
          <AlertNote text="The native QR scanner is unavailable on this device. Enter the invitation code manually." />
        }
        actions={<Button text="Enter code manually" preset="reversed" onPress={onCancel} />}
      />
    )
  }

  return (
    <ScannerLayout
      title="Scan invite"
      body="Use the device scanner to find a trusted Scryve invite QR. Recognition stays on-device and no image is saved."
      notice={error ? <AlertNote text={error} /> : undefined}
      actions={
        <>
          <Button
            text={openingScanner ? "Opening scanner…" : "Open QR scanner"}
            preset="reversed"
            disabled={openingScanner}
            onPress={() => void openScanner()}
          />
          <Button text="Cancel and enter code" onPress={onCancel} />
        </>
      }
    />
  )
}

function ScannerLayout({
  title,
  body,
  notice,
  actions,
}: {
  title: string
  body?: string
  notice?: ReactNode
  actions: ReactNode
}) {
  const { themed } = useAppTheme()
  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["top", "bottom"]}
      contentContainerStyle={themed($screen)}
    >
      <ScrollView style={$styles.flex1} contentContainerStyle={themed($content)}>
        <View style={themed($hero)}>
          <Text preset="heading" accessibilityRole="header" text={title} />
          {body ? <Text size="sm" style={themed($dimmed)} text={body} /> : null}
        </View>
        {notice}
      </ScrollView>
      <BottomActionBar>{actions}</BottomActionBar>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  padding: spacing.lg,
})
const $hero: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $dimmed: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
