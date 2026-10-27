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
type ScanStatus =
  "looking" | "loading" | "steady" | "unsure" | { error: string } | { alreadyInDeck: string }
type LandCount = { card: Omit<ScannedCard, "id" | "state">; inDeck: number; count: number }

const ALTERNATE_COUNT = 5
const ADD_BATCH_SIZE = 10
const ADD_BATCH_WAIT_MS = 1500
const BASIC_LANDS = new Set([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
  "Snow-Covered Plains",
  "Snow-Covered Island",
  "Snow-Covered Swamp",
  "Snow-Covered Mountain",
  "Snow-Covered Forest",
  "Snow-Covered Wastes",
])

function statusText(status: ScanStatus) {
  if (typeof status === "object")
    return "error" in status
      ? status.error
      : translate("decks:cardScan.alreadyInDeck", { card: status.alreadyInDeck })
  return translate(`decks:cardScan.${status}`)
}

function cardLabel(card: CardNameMatch) {
  return card.printedName ? `${card.printedName} (${card.name})` : card.name
}

export function CardScanner({
  game,
  nameIndex,
  singleton,
  copiesInDeck,
  addCards,
  removeCard,
  onRead,
  onClose,
}: {
  game: string
  nameIndex: CardNameIndex | undefined
  singleton: boolean
  copiesInDeck: (name: string) => number
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
  const [landCount, setLandCount] = useState<LandCount>()
  const landCountOpen = useRef(false)
  const countedLands = useRef(new Set<string>())
  const candidateName = useRef<string>(undefined)
  const nameInFrame = useRef<string>(undefined)
  const waiting = useRef<ScannedCard[]>([])
  const batchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lookups = useRef(new Map<number, Promise<ScannedCardAdd>>())
  const corrections = useRef(new Set<Promise<void>>())
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
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
    const results = addCards(batch.map((card) => card.name))
    await Promise.all(
      batch.map(async (card, index) => {
        const lookup = results.then(
          (all) => all[index] ?? { error: translate("decks:cardScan.failed") },
        )
        lookups.current.set(card.id, lookup)
        const result = await lookup
        if ("error" in result) countedLands.current.delete(card.name)
        updateCard(card.id, "error" in result ? { state: result } : { ...result, state: "added" })
      }),
    )
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
    if (closingRef.current || !view.current || !frame.current) return
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
    accept({ ...match, alternates })
  }

  function accept(card: Omit<ScannedCard, "id" | "state">) {
    if (BASIC_LANDS.has(card.name)) {
      if (countedLands.current.has(card.name)) {
        setStatus({ alreadyInDeck: card.name })
        return
      }
      const stillAdding = addedRef.current.filter(
        (scanned) => scanned.name === card.name && scanned.state === "adding",
      ).length
      const inDeck = copiesInDeck(card.name) + stillAdding
      landCountOpen.current = true
      setLandCount({ card, inDeck, count: Math.max(inDeck, 1) })
      return
    }
    if (
      singleton &&
      (copiesInDeck(card.name) > 0 ||
        addedRef.current.some(
          (scanned) => scanned.name === card.name && typeof scanned.state !== "object",
        ))
    ) {
      setStatus({ alreadyInDeck: card.name })
      return
    }
    add(card)
  }

  function addLands({ card, inDeck, count }: LandCount) {
    landCountOpen.current = false
    setLandCount(undefined)
    countedLands.current.add(card.name)
    for (let copy = inDeck; copy < count; copy++) add(card)
  }

  function correct(wrong: ScannedCard, name?: string) {
    const correction = replace(wrong, name).finally(() => corrections.current.delete(correction))
    corrections.current.add(correction)
  }

  async function replace(wrong: ScannedCard, name?: string) {
    setFixing(undefined)
    setAdded((current) => current.filter((card) => card.id !== wrong.id))
    const stillWaiting = waiting.current.findIndex((card) => card.id === wrong.id)
    if (stillWaiting >= 0) waiting.current.splice(stillWaiting, 1)
    else {
      const result = await lookups.current.get(wrong.id)
      if (result && !("error" in result)) removeCard?.(wrong.name)
    }
    if (name) accept({ name, similarity: 1, alternates: [] })
  }

  async function close() {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    await Promise.all(corrections.current)
    if (landCountOpen.current) {
      closingRef.current = false
      setClosing(false)
      return
    }
    await addWaitingCards()
    await Promise.all(lookups.current.values())
    onClose()
  }

  const canAsk = permission?.canAskAgain !== false
  const last = added[0]
  const scanning = Boolean(permission?.granted) && !fixing && !landCount && !closing

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
            {landCount ? (
              <>
                <View style={$addedName}>
                  <Text weight="medium" numberOfLines={1} text={cardLabel(landCount.card)} />
                  <Text
                    size="xs"
                    style={{ color: theme.colors.textDim }}
                    tx="decks:cardScan.howMany"
                  />
                </View>
                <Button
                  text="−"
                  accessibilityLabel={translate("decks:cardRow.decrease", {
                    card: landCount.card.name,
                  })}
                  disabled={landCount.count <= 1}
                  onPress={() => setLandCount({ ...landCount, count: landCount.count - 1 })}
                />
                <Text weight="medium" testID="card-scan-land-count" text={`${landCount.count}`} />
                <Button
                  text="+"
                  accessibilityLabel={translate("decks:cardRow.increase", {
                    card: landCount.card.name,
                  })}
                  onPress={() => setLandCount({ ...landCount, count: landCount.count + 1 })}
                />
                <Button
                  testID="card-scan-add-lands"
                  tx="decks:cardScan.addLands"
                  onPress={() => addLands(landCount)}
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
              <Button key={name} text={name} onPress={() => correct(fixing, name)} />
            ))}
            <Button tx="decks:cardScan.removeIt" onPress={() => correct(fixing)} />
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
