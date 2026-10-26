import { useEffect, useRef, useState } from "react"
import { Linking, Modal, StyleSheet, View } from "react-native"
import type { ImageStyle, LayoutRectangle, TextStyle, ViewStyle } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import { File } from "expo-file-system"
import * as Haptics from "expo-haptics"
import * as ScreenOrientation from "expo-screen-orientation"

import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { CardImage } from "@/components/CardImage"
import { DialogCard } from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { closestNamesFromCardTop, nameFromCardTop, type CardNameIndex } from "./cardNameMatch"
import { framedLinesFromCardTop, type ScanFraming } from "./cardTextLayout"
import { readCardText, type CardPhotoText } from "../../../modules/card-text-reader"

export type CardScan = { linesFromCardTop: string[]; photo: CardPhotoText; framing: ScanFraming }
export type ScannedCardAdd = { imageUrl?: string } | { error: string }

type ScannedCard = { name: string; imageUrl?: string; alternates: string[] }
type ScanStatus = "looking" | "loading" | "steady" | "unsure" | { error: string }

const ALTERNATE_COUNT = 5
const NOT_READY_RETRY_MS = 150

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function statusText(status: ScanStatus) {
  if (typeof status === "object") return status.error
  return translate(`decks:cardScan.${status}`)
}

export function CardScanner({
  game,
  nameIndex,
  addCard,
  removeCard,
  onRead,
  onClose,
}: {
  game: string
  nameIndex: CardNameIndex | undefined
  addCard: (name: string) => Promise<ScannedCardAdd>
  removeCard?: (name: string) => void
  onRead?: (scan: CardScan, match: string | undefined) => void
  onClose: () => void
}) {
  const camera = useRef<CameraView>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const view = useRef<LayoutRectangle>(undefined)
  const frame = useRef<LayoutRectangle>(undefined)
  const [added, setAdded] = useState<ScannedCard[]>([])
  const [status, setStatus] = useState<ScanStatus>("looking")
  const [fixing, setFixing] = useState<ScannedCard>()
  const [cameraReady, setCameraReady] = useState(false)
  const candidateName = useRef<string>(undefined)
  const nameInFrame = useRef<string>(undefined)
  const latest = useRef({ nameIndex, addCard, onRead })
  const { themed, theme } = useAppTheme()

  useEffect(() => {
    latest.current = { nameIndex, addCard, onRead }
  })

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
      () => undefined,
    )
    return () => void ScreenOrientation.unlockAsync().catch(() => undefined)
  }, [])

  const scanning = Boolean(permission?.granted) && cameraReady && !fixing

  useEffect(() => {
    if (!scanning) return
    let active = true

    async function readFrame() {
      if (!camera.current || !view.current || !frame.current) return wait(NOT_READY_RETRY_MS)
      const shot = await camera.current.takePictureAsync({ quality: 0.6, shutterSound: false })
      const photo = await readCardText(shot.uri).finally(() => new File(shot.uri).delete())
      const framing = { view: view.current, frame: frame.current }
      const linesFromCardTop = framedLinesFromCardTop(photo, framing)
      const { nameIndex: index, addCard: add, onRead: record } = latest.current
      const match = index ? nameFromCardTop(index, linesFromCardTop) : undefined
      record?.({ linesFromCardTop, photo, framing }, match?.name)
      if (!active) return
      if (!linesFromCardTop.length) {
        candidateName.current = undefined
        nameInFrame.current = undefined
        setStatus("looking")
        return
      }
      if (!index || !match) {
        candidateName.current = undefined
        setStatus(index ? "unsure" : "loading")
        return
      }
      if (match.name === nameInFrame.current) return
      if (match.name !== candidateName.current) {
        candidateName.current = match.name
        setStatus("steady")
        return
      }
      candidateName.current = undefined
      nameInFrame.current = match.name
      const result = await add(match.name)
      if (!active) return
      if ("error" in result) {
        nameInFrame.current = undefined
        setStatus({ error: result.error })
        return
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      )
      setStatus("looking")
      const alternates = closestNamesFromCardTop(index, linesFromCardTop, ALTERNATE_COUNT + 1)
        .filter((name) => name !== match.name)
        .slice(0, ALTERNATE_COUNT)
      setAdded((current) => [
        { name: match.name, imageUrl: result.imageUrl, alternates },
        ...current,
      ])
    }

    void (async () => {
      while (active) {
        try {
          await readFrame()
        } catch {
          if (active) setStatus({ error: translate("decks:cardScan.failed") })
          await wait(500)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [scanning])

  async function replace(wrong: ScannedCard, name?: string) {
    removeCard?.(wrong.name)
    if (!name) {
      setAdded((current) => current.filter((card) => card !== wrong))
      setFixing(undefined)
      return
    }
    const result = await addCard(name)
    setAdded((current) =>
      current.map((card) =>
        card === wrong
          ? { name, imageUrl: "error" in result ? undefined : result.imageUrl, alternates: [] }
          : card,
      ),
    )
    if ("error" in result) setStatus({ error: result.error })
    setFixing(undefined)
  }

  const canAsk = permission?.canAskAgain !== false
  const last = added[0]

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
          rightTx="common:done"
          onRightPress={onClose}
          backgroundColor={theme.colors.background}
        />
        {permission?.granted ? (
          <View style={$screen} onLayout={(event) => (view.current = event.nativeEvent.layout)}>
            <CameraView
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing="back"
              pictureSize="1920x1080"
              onCameraReady={() => setCameraReady(true)}
            />
            <View style={$overlay} pointerEvents="none">
              <View
                style={$frame}
                onLayout={(event) => (frame.current = event.nativeEvent.layout)}
              />
              <Text size="sm" style={$hint} text={statusText(status)} />
            </View>
          </View>
        ) : (
          <View style={themed($permission)}>
            {permission ? (
              <Text tx={canAsk ? "decks:cardScan.permission" : "decks:cardScan.permissionDenied"} />
            ) : null}
          </View>
        )}
        {permission?.granted ? (
          <View style={themed($added)}>
            {last ? (
              <>
                <CardImage
                  game={game}
                  source={last.imageUrl}
                  compact
                  style={$addedImage}
                  accessibilityLabel={last.name}
                />
                <View style={$addedName}>
                  <Text weight="medium" numberOfLines={1} text={last.name} />
                  <Text
                    size="xs"
                    style={{ color: theme.colors.textDim }}
                    tx="decks:cardScan.addedCount"
                    txOptions={{ count: added.length }}
                  />
                </View>
                {removeCard ? (
                  <Button
                    testID="card-scan-wrong"
                    tx="decks:cardScan.wrongCard"
                    onPress={() => setFixing(last)}
                  />
                ) : null}
              </>
            ) : (
              <Text size="sm" style={{ color: theme.colors.textDim }} tx="decks:cardScan.empty" />
            )}
          </View>
        ) : permission ? (
          <BottomActionBar>
            <Button
              preset="reversed"
              tx={canAsk ? "decks:cardScan.allow" : "decks:cardScan.openSettings"}
              onPress={() => void (canAsk ? requestPermission() : Linking.openSettings())}
            />
          </BottomActionBar>
        ) : null}
      </Screen>
      {fixing ? (
        <DialogCard
          visible
          onClose={() => setFixing(undefined)}
          dialogTestID="card-scan-alternates"
          backdropAccessibilityLabel={translate("common:close")}
        >
          <Text preset="subheading" tx="decks:cardScan.whichCard" />
          <View style={$alternates}>
            {fixing.alternates.map((name) => (
              <Button key={name} text={name} onPress={() => void replace(fixing, name)} />
            ))}
            <Button tx="decks:cardScan.removeIt" onPress={() => void replace(fixing)} />
          </View>
        </DialogCard>
      ) : null}
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
const $added: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 88,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
})
const $addedImage: ImageStyle = { width: 46, height: 64 }
const $addedName: ViewStyle = { flex: 1 }
const $alternates: ViewStyle = { gap: 8 }
