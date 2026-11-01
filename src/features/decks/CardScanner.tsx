import { useEffect, useRef, useState } from "react"
import { FlatList, Linking, Modal, StyleSheet, TouchableOpacity, View } from "react-native"
import type { ImageStyle, LayoutRectangle, TextStyle, ViewStyle } from "react-native"
import { useCameraPermissions } from "expo-camera"
import * as ScreenOrientation from "expo-screen-orientation"
import { useMMKVString } from "react-native-mmkv"

import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { CardImage } from "@/components/CardImage"
import { DialogCard } from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { LOCAL_KEYS, syncStatsEnabled } from "@/features/game/localPersistence"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { radius } from "@/theme/radius"
import type { ThemedStyle } from "@/theme/types"
import { captureAnalytics } from "@/utils/analytics"
import { storage } from "@/utils/storage"

import {
  closestNamesFromCardTop,
  nameFromCardTop,
  type CardNameIndex,
  type CardNameMatch,
} from "./cardNameMatch"
import { CardScanStats } from "./CardScanStats"
import { framedLinesFromCardTop, type ScanFraming } from "./cardTextLayout"
import {
  CardTextCamera,
  prepareScanHaptics,
  scanHaptic,
  type CardPhotoText,
} from "../../../modules/card-text-reader"

export type CardScan = { linesFromCardTop: string[]; photo: CardPhotoText; framing: ScanFraming }
export type ScannedCardAdd =
  { imageUrl?: string } | { error: string; retryable?: boolean; retryAfterMs?: number }

type ScannedCard = CardNameMatch & {
  id: number
  alternates: string[]
  imageUrl?: string
  state: "adding" | "retrying" | "added" | "failed"
}
type ScanStatus =
  "looking" | "loading" | "steady" | "unsure" | { error: string } | { alreadyInDeck: string }
type LandCount = { card: Omit<ScannedCard, "id" | "state">; inDeck: number; count: number }

const ALTERNATE_COUNT = 5
const ADD_BATCH_SIZE = 10
const ADD_BATCH_WAIT_MS = 1500
// why: Scryfall pauses lookups for 30 seconds after a 429, so the last waits outlast a pause.
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000]
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

const HEAT = ["nominal", "fair", "serious", "critical"] as const

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
  const [settings] = useMMKVString(LOCAL_KEYS.settings, storage)
  const showStats = syncStatsEnabled(settings)
  const [lastPhoto, setLastPhoto] = useState<CardPhotoText>()
  const view = useRef<LayoutRectangle>(undefined)
  const [frame, setFrame] = useState<LayoutRectangle>()
  const [added, setAdded] = useState<ScannedCard[]>([])
  const addedRef = useRef(added)
  const [status, setStatus] = useState<ScanStatus>("looking")
  const [fixing, setFixing] = useState<ScannedCard>()
  const [reviewing, setReviewing] = useState(false)
  const [landCount, setLandCount] = useState<LandCount>()
  const landCountOpen = useRef(false)
  const countedLands = useRef(new Set<string>())
  const candidateName = useRef<string>(undefined)
  const nameInFrame = useRef<string>(undefined)
  const waiting = useRef<ScannedCard[]>([])
  const batchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lookups = useRef(new Map<number, Promise<ScannedCardAdd>>())
  const settleLookup = useRef(new Map<number, (result: ScannedCardAdd) => void>())
  const retries = useRef(new Map<number, number>())
  const retryTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const corrections = useRef(new Set<Promise<void>>())
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const nextId = useRef(0)
  const lastAcceptedAt = useRef(Date.now())
  // why: retry timers outlive renders, so a retry after reconnecting must use the latest addCards.
  const addCardsRef = useRef(addCards)
  addCardsRef.current = addCards
  const session = useRef<{
    startedAt: number
    reads: number
    outlinedReads: number
    skipped: number
    fixed: number
    peakHeat?: NonNullable<NonNullable<CardPhotoText["detection"]>["thermal"]>
  }>({ startedAt: Date.now(), reads: 0, outlinedReads: 0, skipped: 0, fixed: 0 })
  const { themed, theme } = useAppTheme()

  useEffect(() => {
    addedRef.current = added
  }, [added])

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
      () => undefined,
    )
    const timers = retryTimers.current
    return () => {
      clearTimeout(batchTimer.current)
      for (const timer of timers.values()) clearTimeout(timer)
      void ScreenOrientation.unlockAsync().catch(() => undefined)
    }
  }, [])

  function updateCard(id: number, change: Partial<ScannedCard>) {
    setAdded((current) => current.map((card) => (card.id === id ? { ...card, ...change } : card)))
  }

  function queue(card: ScannedCard) {
    waiting.current.push(card)
    clearTimeout(batchTimer.current)
    if (waiting.current.length >= ADD_BATCH_SIZE) void addWaitingCards()
    else batchTimer.current = setTimeout(() => void addWaitingCards(), ADD_BATCH_WAIT_MS)
  }

  function settle(card: ScannedCard, result: ScannedCardAdd) {
    settleLookup.current.get(card.id)?.(result)
    settleLookup.current.delete(card.id)
    if (!("error" in result)) return updateCard(card.id, { ...result, state: "added" })
    countedLands.current.delete(card.name)
    updateCard(card.id, { state: "failed" })
  }

  async function addWaitingCards() {
    clearTimeout(batchTimer.current)
    const batch = waiting.current.splice(0)
    if (!batch.length) return
    const results = await addCardsRef.current(batch.map((card) => card.name))
    batch.forEach((card, index) => {
      const result = results[index] ?? { error: translate("decks:cardScan.failed") }
      const retry = retries.current.get(card.id) ?? 0
      const delay = RETRY_DELAYS_MS[retry]
      if (!("error" in result) || !result.retryable || delay === undefined)
        return settle(card, result)
      retries.current.set(card.id, retry + 1)
      updateCard(card.id, { state: "retrying" })
      const timer = setTimeout(
        () => {
          retryTimers.current.delete(card.id)
          queue(card)
        },
        Math.max(delay, result.retryAfterMs ?? 0),
      )
      retryTimers.current.set(card.id, timer)
    })
  }

  function add(card: Omit<ScannedCard, "id" | "state">) {
    const scanned = { ...card, id: nextId.current++, state: "adding" as const }
    scanHaptic("added")
    if (__DEV__) {
      const ms = Date.now() - lastAcceptedAt.current
      console.log(`SCANACCEPT ${JSON.stringify({ name: card.name, ms })}`)
    }
    lastAcceptedAt.current = Date.now()
    setAdded((current) => [scanned, ...current])
    lookups.current.set(
      scanned.id,
      new Promise((resolve) => settleLookup.current.set(scanned.id, resolve)),
    )
    queue(scanned)
  }

  function count({ cardCorners, detection }: CardPhotoText) {
    const scan = session.current
    scan.reads += 1
    if (cardCorners) scan.outlinedReads += 1
    const heat = detection?.thermal
    if (heat && HEAT.indexOf(heat) > (scan.peakHeat ? HEAT.indexOf(scan.peakHeat) : -1))
      scan.peakHeat = heat
  }

  function readText(photo: CardPhotoText) {
    if (closingRef.current || !view.current || !frame) return
    const framing = { view: view.current, frame }
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
      prepareScanHaptics()
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

  function skip(name: string) {
    session.current.skipped += 1
    scanHaptic("skipped")
    setStatus({ alreadyInDeck: name })
  }

  function accept(card: Omit<ScannedCard, "id" | "state">) {
    if (BASIC_LANDS.has(card.name)) {
      if (countedLands.current.has(card.name)) return skip(card.name)
      const stillAdding = addedRef.current.filter(
        (scanned) =>
          scanned.name === card.name &&
          (scanned.state === "adding" || scanned.state === "retrying"),
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
          (scanned) => scanned.name === card.name && scanned.state !== "failed",
        ))
    )
      return skip(card.name)
    add(card)
  }

  function addLands({ card, inDeck, count }: LandCount) {
    landCountOpen.current = false
    setLandCount(undefined)
    if (count <= inDeck) return
    countedLands.current.add(card.name)
    for (let copy = inDeck; copy < count; copy++) add(card)
  }

  function correct(wrong: ScannedCard, name?: string) {
    session.current.fixed += 1
    const correction = replace(wrong, name).finally(() => corrections.current.delete(correction))
    corrections.current.add(correction)
  }

  async function replace(wrong: ScannedCard, name?: string) {
    setFixing(undefined)
    setAdded((current) => current.filter((card) => card.id !== wrong.id))
    const stillWaiting = waiting.current.findIndex((card) => card.id === wrong.id)
    const retryTimer = retryTimers.current.get(wrong.id)
    if (stillWaiting >= 0 || retryTimer) {
      if (stillWaiting >= 0) waiting.current.splice(stillWaiting, 1)
      clearTimeout(retryTimer)
      retryTimers.current.delete(wrong.id)
      settleLookup.current.get(wrong.id)?.({ error: translate("decks:cardScan.failed") })
      settleLookup.current.delete(wrong.id)
    } else {
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
    const results = await Promise.all(lookups.current.values())
    const failed = results.filter((result) => "error" in result).length
    captureAnalytics("card_scan_completed", {
      duration_ms: Date.now() - session.current.startedAt,
      added_count: results.length - failed,
      failed_count: failed,
      skipped_count: session.current.skipped,
      fixed_count: session.current.fixed,
      read_count: session.current.reads,
      outlined_read_count: session.current.outlinedReads,
      ...(session.current.peakHeat && { peak_heat: session.current.peakHeat }),
    })
    onClose()
  }

  const canAsk = permission?.canAskAgain !== false
  const last = added[0]
  const failedCount = added.filter((card) => card.state === "failed").length
  const retryingCount = added.filter((card) => card.state === "retrying").length
  const addedSummary = [
    translate("decks:cardScan.addedCount", { count: added.length - failedCount - retryingCount }),
    retryingCount ? translate("decks:cardScan.retryingCount", { count: retryingCount }) : "",
    failedCount ? translate("decks:cardScan.failedCount", { count: failedCount }) : "",
  ]
    .filter(Boolean)
    .join(" · ")
  const scanning = Boolean(permission?.granted) && !fixing && !landCount && !closing && !reviewing

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
              guide={frame}
              onText={(event) => {
                count(event.nativeEvent)
                readText(event.nativeEvent)
                if (showStats) setLastPhoto(event.nativeEvent)
              }}
            />
            <View style={$overlay} pointerEvents="none">
              <View style={$frame} onLayout={(event) => setFrame(event.nativeEvent.layout)} />
              <Text size="sm" style={$hint} text={statusText(status)} />
            </View>
            {showStats && lastPhoto ? <CardScanStats photo={lastPhoto} /> : null}
            {reviewing ? (
              <View style={[StyleSheet.absoluteFill, themed($review)]}>
                <FlatList
                  testID="card-scan-review-list"
                  data={added}
                  keyExtractor={(card) => `${card.id}`}
                  renderItem={({ item }) => (
                    <View style={themed($reviewRow)}>
                      <View style={$addedName}>
                        <Text numberOfLines={1} text={cardLabel(item)} />
                        {item.state !== "added" ? (
                          <Text
                            size="xs"
                            style={{ color: theme.colors.textDim }}
                            tx={`decks:cardScan.state.${item.state}`}
                          />
                        ) : null}
                      </View>
                      {removeCard ? (
                        <Button tx="decks:cardScan.wrongCard" onPress={() => setFixing(item)} />
                      ) : null}
                    </View>
                  )}
                />
                <Button
                  testID="card-scan-keep-scanning"
                  preset="primary"
                  tx="decks:cardScan.keepScanning"
                  onPress={() => setReviewing(false)}
                />
              </View>
            ) : null}
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
                  disabled={landCount.count <= landCount.inDeck}
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
                  tx={
                    landCount.count > landCount.inDeck ? "decks:cardScan.addLands" : "common:close"
                  }
                  onPress={() => addLands(landCount)}
                />
              </>
            ) : last ? (
              <>
                <TouchableOpacity
                  testID="card-scan-review"
                  accessibilityRole="button"
                  accessibilityLabel={translate("decks:cardScan.review")}
                  style={$addedCard}
                  onPress={() => setReviewing(true)}
                >
                  <CardImage
                    game={game}
                    source={last.imageUrl}
                    compact
                    style={$addedImage}
                    accessibilityLabel={last.name}
                  />
                  <View style={$addedName}>
                    <Text weight="medium" numberOfLines={2} text={cardLabel(last)} />
                    <Text size="xs" style={{ color: theme.colors.textDim }} text={addedSummary} />
                  </View>
                </TouchableOpacity>
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
              preset="primary"
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
  borderRadius: radius.xl,
}
const $hint: TextStyle = { color: "#FFFFFF", textAlign: "center", paddingHorizontal: 24 }
const $permission: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  paddingVertical: spacing.lg,
  paddingHorizontal: spacing.md,
})
const $added: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 88,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
})
const $addedImage: ImageStyle = { width: 46, height: 64 }
const $addedCard: ViewStyle = { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }
const $review: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.background,
  padding: spacing.md,
  gap: spacing.sm,
})
const $reviewRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
})
const $addedName: ViewStyle = { flex: 1 }
const $alternates: ViewStyle = { gap: 8 }
