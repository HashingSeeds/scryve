import { useRef, useState } from "react"
import { Linking, Modal, StyleSheet, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import { extractTextFromImage } from "expo-text-extractor"

import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { likelyCardNamesTopFirst } from "./cardScan"

export function CardScanner({
  onScan,
  onClose,
}: {
  onScan: (names: string[]) => void
  onClose: () => void
}) {
  const camera = useRef<CameraView>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string>()
  const { themed, theme } = useAppTheme()

  async function read() {
    if (!camera.current || reading) return
    setReading(true)
    setError(undefined)
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.6, shutterSound: false })
      const names = likelyCardNamesTopFirst(await extractTextFromImage(photo.uri))
      if (names.length) onScan(names)
      else setError(translate("decks:cardScan.noText"))
    } catch {
      setError(translate("decks:cardScan.failed"))
    } finally {
      setReading(false)
    }
  }

  const canAsk = permission?.canAskAgain !== false

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <Screen
        preset="fixed"
        safeAreaEdges={["bottom"]}
        backgroundColor={theme.colors.background}
        contentContainerStyle={$screen}
      >
        <Header
          titleTx="decks:cardScan.title"
          leftTx="common:back"
          onLeftPress={onClose}
          backgroundColor={theme.colors.background}
        />
        {permission?.granted ? (
          <View style={$screen}>
            <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
            <View style={$overlay} pointerEvents="none">
              <View style={$frame} />
              <Text size="sm" style={$hint} text={error ?? translate("decks:cardScan.hint")} />
            </View>
          </View>
        ) : (
          <View style={themed($permission)}>
            {permission ? (
              <Text tx={canAsk ? "decks:cardScan.permission" : "decks:cardScan.permissionDenied"} />
            ) : null}
          </View>
        )}
        <BottomActionBar>
          {permission?.granted ? (
            <Button
              testID="card-scan-read"
              preset="reversed"
              tx={reading ? "decks:cardScan.reading" : "decks:cardScan.read"}
              disabled={reading}
              onPress={() => void read()}
            />
          ) : permission ? (
            <Button
              preset="reversed"
              tx={canAsk ? "decks:cardScan.allow" : "decks:cardScan.openSettings"}
              onPress={() => void (canAsk ? requestPermission() : Linking.openSettings())}
            />
          ) : null}
        </BottomActionBar>
      </Screen>
    </Modal>
  )
}

const $screen: ViewStyle = { flex: 1 }
const $overlay: ViewStyle = {
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
}
const $frame: ViewStyle = {
  width: "72%",
  aspectRatio: 63 / 88,
  borderWidth: 2,
  borderColor: "#FFFFFF",
  borderRadius: 12,
}
const $hint: TextStyle = { color: "#FFFFFF", textAlign: "center", paddingHorizontal: 24 }
const $permission: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, padding: spacing.lg })
