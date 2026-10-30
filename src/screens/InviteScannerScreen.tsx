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
import type { TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
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
  embedded = false,
}: {
  embedded?: boolean
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
        setError(translate("connected:scanner.untrusted"))
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
      if (!accepted.current && !wasScannerCancellation(cause))
        setError(translate("connected:scanner.openFailed"))
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

  useEffect(
    () => () => {
      if (autoLaunched.current) void CameraView.dismissScanner().catch(() => undefined)
    },
    [],
  )

  if (Platform.OS === "web") {
    return (
      <ScannerLayout
        embedded={embedded}
        titleTx="connected:scanner.title"
        bodyTx="connected:scanner.webUnavailable"
        actions={
          <Button tx="connected:scanner.enterManually" preset="primary" onPress={onCancel} />
        }
      />
    )
  }

  if (Platform.OS === "ios" && !permission?.granted) {
    const canAsk = permission?.canAskAgain !== false
    return (
      <ScannerLayout
        embedded={embedded}
        titleTx="connected:scanner.permission.title"
        bodyTx="connected:scanner.permission.body"
        notice={
          canAsk ? undefined : (
            <AlertNote tone="info" text={translate("connected:scanner.permission.denied")} />
          )
        }
        actions={
          <>
            {canAsk ? (
              <Button
                tx="connected:scanner.permission.allow"
                preset="primary"
                onPress={() => void requestPermission()}
              />
            ) : (
              <Button
                tx="connected:scanner.permission.openSettings"
                preset="primary"
                onPress={() => void Linking.openSettings().then(() => AppState.currentState)}
              />
            )}
            <Button tx="connected:scanner.enterManually" onPress={onCancel} />
          </>
        }
      />
    )
  }

  if (!modernScannerAvailable) {
    return (
      <ScannerLayout
        embedded={embedded}
        titleTx="connected:scanner.title"
        notice={<AlertNote text={translate("connected:scanner.nativeUnavailable")} />}
        actions={
          <Button tx="connected:scanner.enterManually" preset="primary" onPress={onCancel} />
        }
      />
    )
  }

  return (
    <ScannerLayout
      embedded={embedded}
      titleTx="connected:scanner.title"
      bodyTx="connected:scanner.body"
      notice={error ? <AlertNote text={error} /> : undefined}
      actions={
        <>
          <Button
            tx={openingScanner ? "connected:scanner.opening" : "connected:scanner.open"}
            preset="primary"
            disabled={openingScanner}
            onPress={() => void openScanner()}
          />
          <Button tx="connected:scanner.cancel" onPress={onCancel} />
        </>
      }
    />
  )
}

function ScannerLayout({
  embedded,
  titleTx,
  bodyTx,
  notice,
  actions,
}: {
  embedded?: boolean
  titleTx: TxKeyPath
  bodyTx?: TxKeyPath
  notice?: ReactNode
  actions: ReactNode
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  return (
    <Screen
      preset="fixed"
      safeAreaEdges={embedded ? ["bottom"] : ["top", "bottom"]}
      backgroundColor={embedded ? colors.surface : undefined}
      contentContainerStyle={themed($screen)}
    >
      <ScrollView style={$styles.flex1} contentContainerStyle={themed($content)}>
        <View style={themed($hero)}>
          <Text
            preset={embedded ? "subheading" : "heading"}
            accessibilityRole="header"
            tx={titleTx}
          />
          {bodyTx ? <Text size="sm" style={themed($dimmed)} tx={bodyTx} /> : null}
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
