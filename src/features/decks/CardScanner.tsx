import { useEffect, useRef, useState } from "react"
import { Linking, Modal, StyleSheet, View } from "react-native"
import type { ImageStyle, LayoutRectangle, TextStyle, ViewStyle } from "react-native"
import { useCameraPermissions } from "expo-camera"
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

import {
  closestNamesFromCardTop,
  nameFromCardTop,
  type CardNameIndex,
  type CardNameMatch,
} from "./cardNameMatch"
import { framedLinesFromCardTop, type ScanFraming } from "./cardTextLayout"
import { CardTextCamera, type CardPhotoText } from "../../../modules/card-text-reader"

export type CardScan = { linesFromCardTop: string[]; photo: CardPhotoText; framing: ScanFraming }
export type ScannedCardAdd = { imageUrl?: string } | { error: string }

type ScannedCard = CardNameMatch & {
  id: number
  alternates: string[]
  imageUrl?: string
  state: "adding" | "added" | { error: string }
}
type ScanStatus = "looking" | "loading" | "steady" | "unsure" | { error: string }

const ALTERNATE_COUNT = 5
const ADD_BATCH_SIZE = 10
const ADD_BATCH_WAIT_MS = 1500

function statusText(status: ScanStatus) {
  if (typeof status === "object") return status.error
  return translate(`decks:cardScan.${status}`)
}

function cardLabel(card: CardNameMatch) {
  return card.printedName ? `${card.printedName} (${card.name})` : card.name
}

export function CardScanner({
  game,
  nameIndex,
  addCards,
  removeCard,
  onRead,
  onClose,
}: {
  game: string
  nameIndex: CardNameIndex | undefined
  addCards: (names: string[]) => Promise<ScannedCardAdd[]>
  removeCard?: (name: string) => void
  onRead?: (scan: CardScan, match: string | undefined) => void
  onClose: () => void
}) {
  const [permission, requestPermission] = useCameraPermissions()
  const view = useRef<LayoutRectangle>(undefined)
  const frame = useRef<LayoutRectangle>(undefined)
  const [added, setAdded] = useState<ScannedCard[]>([])
  const addedRef = useRef(added)
  const [status, setStatus] = useState<ScanStatus>("looking")
  const [fixing, setFixing] = useState<ScannedCard>()
  const [repeat, setRepeat] = useState<Omit<ScannedCard, "state">>()
  const candidateName = useRef<string>(undefined)
  const nameInFrame = useRef<string>(undefined)
  const waiting = useRef<ScannedCard[]>([])
  const batchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const nextId = useRef(0)
  const lastAcceptedAt = useRef(Date.now())
  const { themed, theme } = useAppTheme()

  useEffect(() => {
    addedRef.current = added
  }, [added])

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
      () => undefined,
    )
    return () => {
      clearTimeout(batchTimer.current)
      void ScreenOrientation.unlockAsync().catch(() => undefined)
    }
  }, [])

  function updateCard(id: number, change: Partial<ScannedCard>) {
    setAdded((current) => current.map((card) => (card.id === id ? { ...card, ...change } : card)))
  }

  async function addWaitingCards() {
    clearTimeout(batchTimer.current)
    const batch = waiting.current.splice(0)
    if (!batch.length) return
    const results = await addCards(batch.map((card) => card.name))
    batch.forEach((card, index) => {
      const result = results[index] ?? { error: translate("decks:cardScan.failed") }
      updateCard(card.id, "error" in result ? { state: result } : { ...result, state: "added" })
    })
  }

  function add(card: Omit<ScannedCard, "id" | "state">) {
    const scanned = { ...card, id: nextId.current++, state: "adding" as const }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
    if (__DEV__) {
      const ms = Date.now() - lastAcceptedAt.current
      console.log(`SCANACCEPT ${JSON.stringify({ name: card.name, ms })}`)
    }
    lastAcceptedAt.current = Date.now()
    setAdded((current) => [scanned, ...current])
    waiting.current.push(scanned)
    clearTimeout(batchTimer.current)
    if (waiting.current.length >= ADD_BATCH_SIZE) void addWaitingCards()
    else batchTimer.current = setTimeout(() => void addWaitingCards(), ADD_BATCH_WAIT_MS)
  }

  function readText(photo: CardPhotoText) {
    if (!view.current || !frame.current) return
    const framing = { view: view.current, frame: frame.current }
    const linesFromCardTop = framedLinesFromCardTop(photo, framing)
    const match = nameIndex ? nameFromCardTop(nameIndex, linesFromCardTop) : undefined
    if (linesFromCardTop.length) onRead?.({ linesFromCardTop, photo, framing }, match?.name)
    if (!linesFromCardTop.length) {
      candidateName.current = undefined
      nameInFrame.current = undefined
      setStatus("looking")
      return
    }
    if (!nameIndex || !match) {
      candidateName.current = undefined
      setStatus(nameIndex ? "unsure" : "loading")
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
    setStatus("looking")
    const alternates = closestNamesFromCardTop(nameIndex, linesFromCardTop, ALTERNATE_COUNT + 1)
      .filter((name) => name !== match.name)
      .slice(0, ALTERNATE_COUNT)
    const card = { ...match, alternates }
    if (addedRef.current.some((scanned) => scanned.name === match.name)) {
      setRepeat({ ...card, id: -1 })
      return
    }
    setRepeat(undefined)
    add(card)
  }

  async function replace(wrong: ScannedCard, name?: string) {
    setFixing(undefined)
    const stillWaiting = waiting.current.indexOf(wrong)
    if (stillWaiting >= 0) waiting.current.splice(stillWaiting, 1)
    else if (wrong.state === "added") removeCard?.(wrong.name)
    setAdded((current) => current.filter((card) => card !== wrong))
    if (name) {
      add({ name, similarity: 1, alternates: [] })
      await addWaitingCards()
    }
  }

  async function close() {
    await addWaitingCards()
    onClose()
  }

  const canAsk = permission?.canAskAgain !== false
  const last = added[0]
  const scanning = Boolean(permission?.granted) && !fixing

  return (
    <Modal visible animationType="slide" onRequestClose={() => void close()}>
      <Screen
        preset="fixed"
        safeAreaEdges={["bottom"]}
        backgroundColor={theme.colors.background}
        contentContainerStyle={$screen}
      >
        <Header
          titleTx="decks:cardScan.title"
          leftTx="common:back"
          onLeftPress={() => void close()}
          rightTx="common:done"
          onRightPress={() => void close()}
          backgroundColor={theme.colors.background}
        />
        {permission?.granted ? (
          <View style={$screen} onLayout={(event) => (view.current = event.nativeEvent.layout)}>
            <CardTextCamera
              style={StyleSheet.absoluteFill}
              active={scanning}
              onText={(event) => readText(event.nativeEvent)}
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
            {repeat ? (
              <>
                <View style={$addedName}>
                  <Text
                    weight="medium"
                    numberOfLines={2}
                    tx="decks:cardScan.again"
                    txOptions={{ card: cardLabel(repeat) }}
                  />
                </View>
                <Button
                  testID="card-scan-add-another"
                  tx="decks:cardScan.addAnother"
                  onPress={() => {
                    setRepeat(undefined)
                    add(repeat)
                  }}
                />
              </>
            ) : last ? (
              <>
                <CardImage
                  game={game}
                  source={last.imageUrl}
                  compact
                  style={$addedImage}
                  accessibilityLabel={last.name}
                />
                <View style={$addedName}>
                  <Text weight="medium" numberOfLines={2} text={cardLabel(last)} />
                  <Text
                    size="xs"
                    style={{ color: theme.colors.textDim }}
                    text={
                      typeof last.state === "object"
                        ? last.state.error
                        : translate("decks:cardScan.addedCount", { count: added.length })
                    }
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
