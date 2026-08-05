import { useRef, useState } from "react"
import { AppState, Linking, Platform, View } from "react-native"
import { BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { readPublicCloudConfig } from "@/features/auth/config"
import { InvitePayload, normalizeInvitePayload } from "@/features/connected/inviteLinks"
import { logInviteScanDiagnostic } from "@/features/connected/inviteScanDiagnostics"

export function InviteScannerScreen({
  onInvite,
  onCancel,
}: {
  onInvite: (invite: InvitePayload) => void
  onCancel: () => void
}) {
  const [permission, requestPermission] = useCameraPermissions()
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState("Starting camera preview…")
  const accepted = useRef(false)
  const lastPayload = useRef<{ value: string; at: number } | undefined>(undefined)
  const config = readPublicCloudConfig()

  function scan(result: BarcodeScanningResult) {
    if (accepted.current) return
    logInviteScanDiagnostic("barcode_event", {
      barcodeType: result.type,
      dataLength: result.data.length,
    })
    setStatus("QR recognized · validating invitation…")
    const now = Date.now()
    if (lastPayload.current?.value === result.data && now - lastPayload.current.at < 2_000) return
    lastPayload.current = { value: result.data, at: now }
    const invite = normalizeInvitePayload(
      result.data,
      config.configured ? config.value.inviteOrigin : undefined,
    )
    if (!invite) {
      logInviteScanDiagnostic("payload_rejected", { dataLength: result.data.length })
      setStatus("QR recognized · invitation rejected")
      setError("That QR is not a trusted Count invitation. Try another code or enter it manually.")
      return
    }
    accepted.current = true
    logInviteScanDiagnostic("payload_accepted", { inviteKind: invite.kind })
    setStatus("Invitation accepted · opening join screen…")
    onInvite(invite)
  }

  if (Platform.OS === "web") {
    return (
      <Screen preset="auto" safeAreaEdges={["top", "bottom"]}>
        <Text preset="heading" accessibilityRole="header" text="Scan invite" />
        <Text text="Camera QR scanning is available in the iOS and Android app. Enter the 6-character code instead." />
        <Button text="Enter code manually" onPress={onCancel} />
      </Screen>
    )
  }

  if (!permission?.granted) {
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

  return (
    <Screen preset="fixed" safeAreaEdges={["top", "bottom"]} contentContainerStyle={$screen}>
      <Text preset="heading" accessibilityRole="header" text="Scan invite" />
      <Text text="Point the camera at a trusted Count invite QR. No image is saved." />
      <View accessible={false} style={$cameraFrame}>
        <CameraView
          testID="invite-camera"
          style={$camera}
          facing="back"
          autofocus="on"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onCameraReady={() => {
            logInviteScanDiagnostic("camera_ready")
            setStatus("Camera ready · waiting for native QR recognition…")
          }}
          onMountError={(mountError) => {
            logInviteScanDiagnostic("camera_mount_error", { message: mountError.message })
            setStatus("Camera preview failed")
            setError(`Camera could not start: ${mountError.message}`)
          }}
          onBarcodeScanned={scan}
        />
      </View>
      <Text
        testID="scanner-debug-status"
        accessibilityLiveRegion="polite"
        text={`Scanner status: ${status}`}
      />
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" text={error} />
      ) : null}
      <Button text="Cancel and enter code" onPress={onCancel} />
    </Screen>
  )
}

const $screen = { flex: 1, gap: 12, padding: 16 } as const
const $cameraFrame = { flex: 1, minHeight: 240, overflow: "hidden", borderRadius: 16 } as const
const $camera = { flex: 1 } as const
