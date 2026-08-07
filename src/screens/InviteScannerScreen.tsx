import { useCallback, useEffect, useRef, useState } from "react"
import { AppState, Linking, Platform } from "react-native"
import { CameraView, ScanningResult, useCameraPermissions } from "expo-camera"
import * as Haptics from "expo-haptics"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { readPublicCloudConfig } from "@/features/auth/config"
import { InvitePayload, normalizeInvitePayload } from "@/features/connected/inviteLinks"
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
          "That QR is not a trusted Count invitation. Try another code or enter it manually.",
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
      <Screen preset="auto" safeAreaEdges={["top", "bottom"]}>
        <Text preset="heading" accessibilityRole="header" text="Scan invite" />
        <Text text="Camera QR scanning is available in the iOS and Android app. Enter the 6-character code instead." />
        <Button text="Enter code manually" onPress={onCancel} />
      </Screen>
    )
  }

  if (Platform.OS === "ios" && !permission?.granted) {
    return (
      <Screen preset="auto" safeAreaEdges={["top", "bottom"]}>
        <Text preset="heading" accessibilityRole="header" text="Camera permission" />
        <Text text="Count uses the camera only while this screen is open to read an invitation QR. Images are not captured, stored, or uploaded." />
        {permission?.canAskAgain !== false ? (
          <Button text="Allow camera" onPress={() => void requestPermission()} />
        ) : (
          <>
            <Text
              accessibilityRole="alert"
              text="Camera access is denied. You can enable it in system settings or enter the code manually."
            />
            <Button
              text="Open settings"
              onPress={() => void Linking.openSettings().then(() => AppState.currentState)}
            />
          </>
        )}
        <Button text="Enter code manually" onPress={onCancel} />
      </Screen>
    )
  }

  if (!modernScannerAvailable) {
    return (
      <Screen preset="auto" safeAreaEdges={["top", "bottom"]}>
        <Text preset="heading" accessibilityRole="header" text="Scan invite" />
        <Text
          accessibilityRole="alert"
          text="The native QR scanner is unavailable on this device. Enter the invitation code manually."
        />
        <Button text="Enter code manually" onPress={onCancel} />
      </Screen>
    )
  }

  return (
    <Screen preset="auto" safeAreaEdges={["top", "bottom"]}>
      <Text preset="heading" accessibilityRole="header" text="Scan invite" />
      <Text text="Use the device scanner to find a trusted Count invite QR. Recognition stays on-device and no image is saved." />
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" text={error} />
      ) : null}
      <Button
        text={openingScanner ? "Opening scanner…" : "Open QR scanner"}
        disabled={openingScanner}
        onPress={() => void openScanner()}
      />
      <Button text="Cancel and enter code" onPress={onCancel} />
    </Screen>
  )
}
