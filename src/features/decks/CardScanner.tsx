import { useEffect, useRef, useState } from "react"
import {
  FlatList,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native"
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
import { $sizeStyles, Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { resolveScannedPrinting, useCatalogSync } from "@/features/collection/catalogSync"
import { PrintingPickerSheet } from "@/features/collection/PrintingPickerSheet"
import { LOCAL_KEYS, syncStatsEnabled } from "@/features/game/localPersistence"
import { prereleaseBuild } from "@/features/updates/appUpdate"
import { formatCurrency, joinParts } from "@/i18n/format"
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
import { collectorHintFromCardBottom, type CollectorHint } from "./cardScan"
import { CardScanStats } from "./CardScanStats"
import {
  framedLineObjectsFromCardBottom,
  framedLinesFromCardTop,
  type ScanFraming,
} from "./cardTextLayout"
import type { CardCondition, CardFinish } from "../../../convex/lib/cardPricing"
import {
  CardTextCamera,
  prepareScanHaptics,
  scanHaptic,
  type CardPhotoText,
  type CardScanMode,
  type CardTextLine,
} from "../../../modules/card-text-reader"

export type CardScan = { linesFromCardTop: string[]; photo: CardPhotoText; framing: ScanFraming }
export type ScannedCardAdd =
  { imageUrl?: string } | { error: string; retryable?: boolean; retryAfterMs?: number }

export type ScannedPrintingOverride = {
  scanId?: number
  printingId?: string
  setCode?: string
  collectorNumber?: string
  imageUrl?: string
  smallImageUrl?: string
}

export type ScannedPrintingPayload = {
  id: number
  name: string
  cardId?: string
  printingId?: string
  setCode?: string
  collectorNumber?: string
  finish: CardFinish
  condition: CardCondition
  language: string
  imageUrl?: string
  retailCents?: number
  buylistCents?: number
}

type ScannedCard = CardNameMatch & {
  id: number
  alternates: string[]
  imageUrl?: string
  cardId?: string
  printingId?: string
  setCode?: string
  collectorNumber?: string
  finish: CardFinish
  condition: CardCondition
  language: string
  retailCents?: number
  buylistCents?: number
  state: "adding" | "retrying" | "added" | "failed"
}
type ScanStatus =
  "looking" | "loading" | "steady" | "unsure" | { error: string } | { alreadyInDeck: string }
type LandCount = { card: Omit<ScannedCard, "id" | "state">; inDeck: number; count: number }

const ALTERNATE_COUNT = 5
const ADD_BATCH_SIZE = 10
const ADD_BATCH_WAIT_MS = 1500
const HIT_THRESHOLD_CENTS = 500
const BIG_HIT_THRESHOLD_CENTS = 2000
const HANDHELD_REACCEPT_COOLDOWN_MS = 4_500
const IN_FRAME_UPGRADE_WINDOW_MS = 2_500

const PRINTING_EVIDENCE_RANK = { none: 0, setOrNumber: 1, setAndNumber: 2 } as const
type PrintingEvidence = keyof typeof PRINTING_EVIDENCE_RANK

const collectorKey = (collectorNumber: string) =>
  collectorNumber.toLowerCase().replace(/^0+/, "") || "0"

// why: a misread number can fall back to another printing in the set, so set plus number only counts once the resolved printing carries both; until then later frames can still refine.
function printingEvidence(
  hint: CollectorHint,
  lockedSet: string,
  printing?: { setCode: string; collectorNumber: string },
): PrintingEvidence {
  const setCode = (hint.setCode || lockedSet).toLowerCase()
  const number = hint.collectorNumber
  const pinned = printing
    ? Boolean(
        number &&
        printing.setCode === setCode &&
        collectorKey(printing.collectorNumber) === collectorKey(number),
      )
    : Boolean(setCode && number)
  if (pinned) return "setAndNumber"
  return setCode || number ? "setOrNumber" : "none"
}
const FINISH_CYCLE: readonly CardFinish[] = ["nonfoil", "foil", "etched"]
const CONDITION_CYCLE: readonly CardCondition[] = ["NM", "LP", "MP", "HP", "DMG"]
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

const FRAME_WIDTH = 0.72

// why: the slot is a direct child of the full-size overlay, so the frame's rect is already in camera-view coordinates.
function frameIn(slot: LayoutRectangle): LayoutRectangle {
  const width = Math.min(slot.width * FRAME_WIDTH, (slot.height * 63) / 88)
  const height = (width * 88) / 63
  return {
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height,
  }
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
  onScanPrinting,
  onUpdatePrinting,
  instantLocalLookup = false,
  sessionTotalCents,
  initialSetLock,
  onClose,
}: {
  game: string
  nameIndex: CardNameIndex | undefined
  singleton: boolean
  copiesInDeck: (name: string) => number
  addCards: (
    names: string[],
    overrides?: readonly (ScannedPrintingOverride | undefined)[],
  ) => Promise<ScannedCardAdd[]>
  removeCard?: (name: string, scanId?: number) => void
  onRead?: (scan: CardScan, match: string | undefined) => void
  onScanPrinting?: (scan: ScannedPrintingPayload) => void
  onUpdatePrinting?: (
    id: number,
    update: {
      name: string
      printingId: string
      setCode: string
      collectorNumber: string
      finish: CardFinish
      condition: CardCondition
      imageUrl?: string
      smallImageUrl?: string
      retailCents?: number
      buylistCents?: number
    },
  ) => boolean | void
  instantLocalLookup?: boolean
  sessionTotalCents?: number
  initialSetLock?: string
  onClose: () => void
}) {
  const [permission, requestPermission] = useCameraPermissions()
  const [settings] = useMMKVString(LOCAL_KEYS.settings, storage)
  const showStats = syncStatsEnabled(settings)
  const showPrereleaseHud = prereleaseBuild()
  useCatalogSync(game, showPrereleaseHud)
  const [lastPhoto, setLastPhoto] = useState<CardPhotoText>()
  const view = useRef<LayoutRectangle>(undefined)
  const [frame, setFrame] = useState<LayoutRectangle>()
  const [added, setAdded] = useState<ScannedCard[]>([])
  const addedRef = useRef(added)
  const [status, setStatus] = useState<ScanStatus>("looking")
  const [fixing, setFixing] = useState<ScannedCard>()
  const [pickingPrinting, setPickingPrinting] = useState<ScannedCard>()
  const [reviewing, setReviewing] = useState(false)
  const [landCount, setLandCount] = useState<LandCount>()
  const [torch, setTorch] = useState(false)
  const [scanMode, setScanMode] = useState<CardScanMode>("handheld")
  const [finish, setFinish] = useState<CardFinish>("nonfoil")
  const [finishLocked, setFinishLocked] = useState(false)
  const [condition, setCondition] = useState<CardCondition>("NM")
  const [setLock, setSetLock] = useState(initialSetLock?.toUpperCase() ?? "")
  const [setLockOpen, setSetLockOpen] = useState(false)
  const [setLockDraft, setSetLockDraft] = useState(initialSetLock?.toUpperCase() ?? "")
  const [acceptedToken, setAcceptedToken] = useState(0)
  const landCountOpen = useRef(false)
  const countedLands = useRef(new Set<string>())
  const candidateName = useRef<string>(undefined)
  const candidateBottomLines = useRef<string[]>([])
  const candidateFoilStar = useRef(false)
  const recentVotes = useRef<(string | undefined)[]>([])
  const emptyFrames = useRef(0)
  const blankFrames = useRef(0)
  const starSeen = useRef<{ setCode: string; collectorNumber: string; at: number }>(undefined)
  const nameInFrame = useRef<string>(undefined)
  const printingInFrame = useRef<string>(undefined)
  const recentSeenAtByName = useRef(new Map<string, number>())
  const lastAcceptedCard = useRef<{
    id: number
    name: string
    printingId?: string
    setCode?: string
    collectorNumber?: string
    finish: CardFinish
    condition: CardCondition
    evidence: PrintingEvidence
    acceptedAt: number
  }>(undefined)
  const rejectedBySetLock = useRef(false)
  const waiting = useRef<ScannedCard[]>([])
  const batchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lookups = useRef(new Map<number, Promise<ScannedCardAdd>>())
  const settleLookup = useRef(new Map<number, (result: ScannedCardAdd) => void>())
  const retries = useRef(new Map<number, number>())
  const retryTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const printingEditRevision = useRef(new Map<number, number>())
  const corrections = useRef(new Set<Promise<void>>())
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  // why: native emits frames on its own clock; when JS falls behind, only the newest frame is worth reading.
  const pendingPhoto = useRef<CardPhotoText>(undefined)
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
  const { width: screenWidth, fontScale } = useWindowDimensions()

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
    if (instantLocalLookup || waiting.current.length >= ADD_BATCH_SIZE) void addWaitingCards()
    else batchTimer.current = setTimeout(() => void addWaitingCards(), ADD_BATCH_WAIT_MS)
  }

  function settle(card: ScannedCard, result: ScannedCardAdd) {
    settleLookup.current.get(card.id)?.(result)
    settleLookup.current.delete(card.id)
    if (!("error" in result)) return updateCard(card.id, { ...result, state: "added" })
    countedLands.current.delete(card.name)
    recentSeenAtByName.current.delete(card.name)
    updateCard(card.id, { state: "failed" })
  }

  async function addWaitingCards() {
    clearTimeout(batchTimer.current)
    const batch = waiting.current.splice(0)
    if (!batch.length) return
    const sendOverrides =
      Boolean(onUpdatePrinting) || batch.some((card) => Boolean(card.printingId))
    const results = sendOverrides
      ? await addCardsRef.current(
          batch.map((card) => card.name),
          batch.map((card) => ({
            scanId: card.id,
            ...(card.printingId
              ? {
                  printingId: card.printingId,
                  setCode: card.setCode,
                  collectorNumber: card.collectorNumber,
                  imageUrl: card.imageUrl,
                }
              : {}),
          })),
        )
      : await addCardsRef.current(batch.map((card) => card.name))
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

  function add(
    card: Omit<ScannedCard, "id" | "state">,
    evidence: PrintingEvidence = "setAndNumber",
  ) {
    const id = nextId.current++
    const scanned: ScannedCard = {
      ...card,
      id,
      state: onScanPrinting ? "added" : "adding",
    }
    const priceCents = card.retailCents ?? 0
    scanHaptic(
      priceCents >= BIG_HIT_THRESHOLD_CENTS
        ? "bigHit"
        : priceCents >= HIT_THRESHOLD_CENTS
          ? "hit"
          : "added",
    )
    if (__DEV__) {
      const ms = Date.now() - lastAcceptedAt.current
      console.log(
        `SCANACCEPT ${JSON.stringify({
          name: card.name,
          ms,
          set: card.setCode,
          num: card.collectorNumber,
          finish: card.finish,
          retailCents: card.retailCents,
        })}`,
      )
    }
    const acceptedAt = Date.now()
    lastAcceptedAt.current = acceptedAt
    lastAcceptedCard.current = {
      id,
      name: card.name,
      printingId: card.printingId,
      setCode: card.setCode,
      collectorNumber: card.collectorNumber,
      finish: card.finish,
      condition: card.condition,
      evidence,
      acceptedAt,
    }
    setAdded((current) => [scanned, ...current])
    if (onScanPrinting) {
      onScanPrinting({
        id,
        name: card.name,
        cardId: card.cardId,
        printingId: card.printingId,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
        finish: card.finish,
        condition: card.condition,
        language: card.language,
        imageUrl: card.imageUrl,
        retailCents: card.retailCents,
        buylistCents: card.buylistCents,
      })
      lookups.current.set(id, Promise.resolve({ imageUrl: card.imageUrl }))
      return
    }
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

  function primaryFoilStar(lines: readonly CardTextLine[]): boolean {
    const collectorLines = lines.filter((line) => {
      const parsed = collectorHintFromCardBottom([line.text])
      return Boolean(parsed.setCode || parsed.language || parsed.isFoilStar || line.foilStar)
    })
    if (collectorLines.length === 0) return false
    // why: pick the lowest line in the frame so a foil card peeking above cannot override this card's collector strip; the parsed set hint can come from that card, so it must not steer the pick.
    let primary = collectorLines[0]
    for (let i = 1; i < collectorLines.length; i += 1) {
      if (collectorLines[i].y > primary.y) primary = collectorLines[i]
    }
    return Boolean(primary.foilStar || collectorHintFromCardBottom([primary.text]).isFoilStar)
  }

  function maybeUpgradeLastAccepted(
    matchName: string,
    bottomHint: CollectorHint,
    frameHasFoilStar: boolean,
    lockedSet: string,
  ) {
    const last = lastAcceptedCard.current
    if (!last || last.name !== matchName) return
    if (Date.now() - last.acceptedAt > IN_FRAME_UPGRADE_WINDOW_MS) return
    const wantsFoilUpgrade = last.finish === "nonfoil" && !finishLocked && frameHasFoilStar
    const evidence = printingEvidence(bottomHint, lockedSet)
    const wantsPrintingRefine =
      PRINTING_EVIDENCE_RANK[evidence] > PRINTING_EVIDENCE_RANK[last.evidence]
    if (!wantsFoilUpgrade && !wantsPrintingRefine) return
    const targetFinish: CardFinish = wantsFoilUpgrade ? "foil" : last.finish
    // why: a foil star alone says nothing about the printing, so keep the accepted one and only reprice it.
    const hint = wantsPrintingRefine
      ? bottomHint
      : { setCode: last.setCode, collectorNumber: last.collectorNumber }
    const refined = resolveScannedPrinting(game, matchName, hint, {
      setLock: lockedSet || undefined,
      finish: targetFinish,
      condition: last.condition,
    })
    const nextFinish = refined.finish
    const finishChanged = nextFinish !== last.finish
    const nextPrinting = refined.printing
    const printingChanged = Boolean(
      wantsPrintingRefine &&
      nextPrinting?.printingId &&
      nextPrinting.printingId !== last.printingId,
    )
    const nextEvidence =
      wantsPrintingRefine && nextPrinting
        ? printingEvidence(bottomHint, lockedSet, nextPrinting)
        : last.evidence
    if (!finishChanged && !printingChanged) {
      lastAcceptedCard.current = { ...last, evidence: nextEvidence }
      return
    }
    lastAcceptedCard.current = {
      ...last,
      finish: nextFinish,
      printingId: nextPrinting?.printingId ?? last.printingId,
      setCode: nextPrinting?.setCode ?? last.setCode,
      collectorNumber: nextPrinting?.collectorNumber ?? last.collectorNumber,
      evidence: nextEvidence,
    }
    if (printingChanged && nextPrinting?.printingId) {
      printingInFrame.current = nextPrinting.printingId
    }
    const scannerUpdate = {
      finish: nextFinish,
      ...(nextPrinting
        ? {
            cardId: nextPrinting.cardId,
            printingId: nextPrinting.printingId,
            setCode: nextPrinting.setCode,
            collectorNumber: nextPrinting.collectorNumber,
            imageUrl: nextPrinting.smallImageUrl ?? nextPrinting.imageUrl,
          }
        : {}),
      retailCents: refined.price.retailCents,
      buylistCents: refined.price.buylistCents,
    }
    const revision = (printingEditRevision.current.get(last.id) ?? 0) + 1
    printingEditRevision.current.set(last.id, revision)
    const queued = waiting.current.find((item) => item.id === last.id)
    if (queued) {
      Object.assign(queued, scannerUpdate)
      updateCard(last.id, scannerUpdate)
      return
    }
    if (!onUpdatePrinting || !nextPrinting) return
    // why: an add already sent to the deck has no scan ID there until it settles, so wait for it like a manual correction does.
    const apply = async () => {
      await lookups.current.get(last.id)
      if (printingEditRevision.current.get(last.id) !== revision) return
      const accepted = onUpdatePrinting(last.id, {
        name: matchName,
        printingId: nextPrinting.printingId,
        setCode: nextPrinting.setCode,
        collectorNumber: nextPrinting.collectorNumber,
        finish: nextFinish,
        condition: last.condition,
        imageUrl: nextPrinting.imageUrl,
        smallImageUrl: nextPrinting.smallImageUrl,
        retailCents: refined.price.retailCents,
        buylistCents: refined.price.buylistCents,
      })
      if (accepted !== false) return updateCard(last.id, scannerUpdate)
      if (lastAcceptedCard.current?.id !== last.id) return
      // why: the row only changes once the deck accepts, so it holds what the deck has; reset evidence so a later frame can retry.
      const shown = addedRef.current.find((card) => card.id === last.id)
      lastAcceptedCard.current = {
        ...last,
        printingId: shown?.printingId,
        setCode: shown?.setCode,
        collectorNumber: shown?.collectorNumber,
        finish: shown?.finish ?? last.finish,
        evidence: "none",
      }
      printingInFrame.current = shown?.printingId
    }
    const task = apply().finally(() => corrections.current.delete(task))
    corrections.current.add(task)
  }

  function starMatches(printing?: { setCode?: string; collectorNumber?: string }) {
    const star = starSeen.current
    return Boolean(
      star &&
      printing?.setCode &&
      printing.collectorNumber &&
      Date.now() - star.at <= IN_FRAME_UPGRADE_WINDOW_MS &&
      printing.setCode.toLowerCase() === star.setCode &&
      collectorKey(printing.collectorNumber) === star.collectorNumber,
    )
  }

  // why: the star often shows only when the card tilts and its name leaves the frame, so the set and collector number on the starred strip identify the card instead.
  function noteFoilStar(lines: readonly CardTextLine[], lockedSet: string) {
    const hint = collectorHintFromCardBottom(lines.map((line) => line.text))
    const setCode = (hint.setCode || lockedSet).toLowerCase()
    if (!setCode || !hint.collectorNumber) return
    starSeen.current = {
      setCode,
      collectorNumber: collectorKey(hint.collectorNumber),
      at: Date.now(),
    }
    const last = lastAcceptedCard.current
    if (last?.finish === "nonfoil" && !finishLocked && starMatches(last))
      maybeUpgradeLastAccepted(last.name, {}, true, "")
  }

  function readText(photo: CardPhotoText) {
    if (closingRef.current || !view.current || !frame) return
    if (photo.sceneChanged) {
      candidateName.current = undefined
      candidateBottomLines.current = []
      candidateFoilStar.current = false
      nameInFrame.current = undefined
      printingInFrame.current = undefined
      if (scanMode === "bulk") {
        recentSeenAtByName.current.clear()
        starSeen.current = undefined
      }
      recentVotes.current = []
      emptyFrames.current = 0
      blankFrames.current = 0
    }
    const framing = { view: view.current, frame }
    const linesFromCardTop = framedLinesFromCardTop(photo, framing)
    const match = nameIndex ? nameFromCardTop(nameIndex, linesFromCardTop) : undefined
    const frameBottomLineObjects =
      photo.bottomLines && photo.bottomLines.length > 0
        ? photo.bottomLines
        : framedLineObjectsFromCardBottom(photo, framing)
    const frameHasFoilStar = primaryFoilStar(frameBottomLineObjects)
    const lockedSet = setLock.trim().toUpperCase()
    if (frameHasFoilStar) noteFoilStar(frameBottomLineObjects, lockedSet)
    if (linesFromCardTop.length) onRead?.({ linesFromCardTop, photo, framing }, match?.name)
    if (!linesFromCardTop.length) {
      emptyFrames.current += 1
      const fullyEmpty = photo.lines.length === 0 && (photo.bottomLines?.length ?? 0) === 0
      // why: glare can blank the text while the card is still in view, so only frames with no text and no outlined card unlock immediate repeat scans.
      blankFrames.current = fullyEmpty && !photo.cardCorners ? blankFrames.current + 1 : 0
      if (blankFrames.current >= 2) {
        if (nameInFrame.current) recentSeenAtByName.current.delete(nameInFrame.current)
        candidateName.current = undefined
        candidateBottomLines.current = []
        candidateFoilStar.current = false
        nameInFrame.current = undefined
        printingInFrame.current = undefined
        recentVotes.current = []
      } else if (emptyFrames.current >= 3) {
        candidateName.current = undefined
        candidateBottomLines.current = []
        candidateFoilStar.current = false
        recentVotes.current = []
      }
      setStatus("looking")
      return
    }
    emptyFrames.current = 0
    blankFrames.current = 0
    if (!nameIndex || !match) {
      recentVotes.current = [...recentVotes.current.slice(-2), undefined]
      setStatus(nameIndex ? "unsure" : "loading")
      return
    }
    const frameBottomLines = frameBottomLineObjects.map((line) => line.text)
    const combinedBottomLines =
      candidateName.current === match.name
        ? [...candidateBottomLines.current, ...frameBottomLines]
        : frameBottomLines
    const bottomHint = collectorHintFromCardBottom(combinedBottomLines)
    const detectedFoilStar =
      frameHasFoilStar || (candidateName.current === match.name && candidateFoilStar.current)
    const effectiveFinish: CardFinish = finishLocked ? finish : detectedFoilStar ? "foil" : finish
    const firstResolved = resolveScannedPrinting(game, match.name, bottomHint, {
      setLock: lockedSet || undefined,
      finish: effectiveFinish,
      condition,
    })
    const starredJustBefore =
      !finishLocked && effectiveFinish !== "foil" && starMatches(firstResolved.printing)
    const resolved = starredJustBefore
      ? resolveScannedPrinting(game, match.name, bottomHint, {
          setLock: lockedSet || undefined,
          finish: "foil",
          condition,
        })
      : firstResolved
    const last = lastAcceptedCard.current
    // why: a card accepted before its printing was pinned is still being refined, so a pinned read of another printing corrects it rather than counting a new copy.
    const stillRefining = Boolean(
      last &&
      last.name === match.name &&
      last.evidence !== "setAndNumber" &&
      Date.now() - last.acceptedAt <= IN_FRAME_UPGRADE_WINDOW_MS,
    )
    // why: handheld OCR occasionally drops a leading digit on extended-art printings (#169 -> #69), so reprint auto-swap stays bulk-only.
    const reprintSwapped = Boolean(
      scanMode === "bulk" &&
      !stillRefining &&
      bottomHint.setCode &&
      bottomHint.collectorNumber &&
      resolved.printing?.printingId &&
      printingInFrame.current &&
      resolved.printing.printingId !== printingInFrame.current,
    )
    if (match.name === nameInFrame.current && !reprintSwapped) {
      // why: the cooldown counts from the last sighting, so a card that stays peeking behind the next one never re-adds.
      if (scanMode === "handheld") recentSeenAtByName.current.set(match.name, Date.now())
      maybeUpgradeLastAccepted(match.name, bottomHint, frameHasFoilStar, lockedSet)
      candidateName.current = undefined
      candidateBottomLines.current = []
      candidateFoilStar.current = false
      recentVotes.current = []
      return
    }
    if (scanMode === "handheld") {
      const lastSeenAt = recentSeenAtByName.current.get(match.name)
      if (lastSeenAt !== undefined && Date.now() - lastSeenAt < HANDHELD_REACCEPT_COOLDOWN_MS) {
        recentSeenAtByName.current.set(match.name, Date.now())
        nameInFrame.current = match.name
        maybeUpgradeLastAccepted(match.name, bottomHint, frameHasFoilStar, lockedSet)
        candidateName.current = undefined
        candidateBottomLines.current = []
        candidateFoilStar.current = false
        recentVotes.current = []
        return
      }
    }
    const fastExact = match.similarity === 1 && (scanMode === "bulk" || Boolean(photo.cardCorners))
    if (!fastExact) {
      recentVotes.current = [...recentVotes.current.slice(-2), match.name]
      const votes = recentVotes.current.filter((entry) => entry === match.name).length
      if (votes < 2) {
        candidateName.current = match.name
        candidateBottomLines.current = combinedBottomLines.slice(-12)
        candidateFoilStar.current = detectedFoilStar
        prepareScanHaptics()
        setStatus("steady")
        return
      }
    }
    candidateName.current = undefined
    candidateBottomLines.current = []
    candidateFoilStar.current = false
    recentVotes.current = []
    nameInFrame.current = match.name
    printingInFrame.current = resolved.printing?.printingId
    recentSeenAtByName.current.set(match.name, Date.now())
    setAcceptedToken((token) => token + 1)
    setStatus("looking")
    const alternates = closestNamesFromCardTop(nameIndex, linesFromCardTop, ALTERNATE_COUNT + 1)
      .filter((name) => name !== match.name)
      .slice(0, ALTERNATE_COUNT)
    if (lockedSet && !resolved.printing) {
      rejectedBySetLock.current = true
      session.current.skipped += 1
      scanHaptic("skipped")
      setStatus({
        error: translate("decks:cardScan.notInLockedSet", { card: match.name, set: lockedSet }),
      })
      return
    }
    rejectedBySetLock.current = false
    accept(
      {
        ...match,
        alternates,
        cardId: resolved.printing?.cardId,
        printingId: resolved.printing?.printingId,
        setCode: resolved.printing?.setCode ?? bottomHint.setCode,
        collectorNumber: resolved.printing?.collectorNumber ?? bottomHint.collectorNumber,
        finish: resolved.finish,
        condition,
        language: bottomHint.language ?? "en",
        imageUrl: resolved.printing?.smallImageUrl ?? resolved.printing?.imageUrl,
        retailCents: resolved.price.retailCents,
        buylistCents: resolved.price.buylistCents,
      },
      printingEvidence(bottomHint, lockedSet, resolved.printing),
    )
  }

  function skip(name: string) {
    session.current.skipped += 1
    scanHaptic("skipped")
    setStatus({ alreadyInDeck: name })
  }

  function accept(
    card: Omit<ScannedCard, "id" | "state">,
    evidence: PrintingEvidence = "setAndNumber",
  ) {
    if (BASIC_LANDS.has(card.name)) {
      if (countedLands.current.has(card.name)) return skip(card.name)
      const stillAdding = addedRef.current.filter(
        (scanned) =>
          scanned.name === card.name &&
          (scanned.state === "adding" || scanned.state === "retrying"),
      ).length
      const inDeck = copiesInDeck(card.name) + stillAdding
      landCountOpen.current = true
      setReviewing(false)
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
    add(card, evidence)
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
    const lockedSet = setLock.trim().toUpperCase()
    const replacement = name
      ? resolveScannedPrinting(
          game,
          name,
          {},
          {
            setLock: lockedSet || undefined,
            finish: wrong.finish,
            condition: wrong.condition,
          },
        )
      : undefined
    if (name && lockedSet && !replacement?.printing) {
      session.current.skipped += 1
      scanHaptic("skipped")
      setStatus({
        error: translate("decks:cardScan.notInLockedSet", { card: name, set: lockedSet }),
      })
      return
    }
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
      if (result && !("error" in result)) removeCard?.(wrong.name, wrong.id)
    }
    if (name) {
      accept({
        name,
        similarity: 1,
        alternates: [],
        cardId: replacement?.printing?.cardId,
        printingId: replacement?.printing?.printingId,
        setCode: replacement?.printing?.setCode,
        collectorNumber: replacement?.printing?.collectorNumber,
        finish: replacement?.finish ?? wrong.finish,
        condition: wrong.condition,
        language: wrong.language,
        imageUrl: replacement?.printing?.smallImageUrl ?? replacement?.printing?.imageUrl,
        retailCents: replacement?.price.retailCents,
        buylistCents: replacement?.price.buylistCents,
      })
    }
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
  const addedSummary = joinParts([
    translate("decks:cardScan.addedCount", { count: added.length - failedCount - retryingCount }),
    retryingCount ? translate("decks:cardScan.retryingCount", { count: retryingCount }) : "",
    failedCount ? translate("decks:cardScan.failedCount", { count: failedCount }) : "",
  ])
  const scanning =
    Boolean(permission?.granted) &&
    !fixing &&
    !pickingPrinting &&
    !setLockOpen &&
    !landCount &&
    !closing &&
    !reviewing

  const lastDetails = last
    ? joinParts([
        last.setCode ? last.setCode.toUpperCase() : "",
        last.collectorNumber ? `#${last.collectorNumber}` : "",
        last.retailCents !== undefined ? formatCurrency(last.retailCents, "USD") : "",
      ])
    : ""

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
              torch={torch}
              scanMode={scanMode}
              acceptedToken={acceptedToken}
              onText={(event) => {
                const photo = event.nativeEvent
                count(photo)
                const queued = pendingPhoto.current
                pendingPhoto.current = queued?.sceneChanged
                  ? { ...photo, sceneChanged: true }
                  : photo
                if (queued) return
                // why: the timer runs after frames already queued behind this one, so a slow read skips stale frames instead of replaying them.
                setTimeout(() => {
                  const next = pendingPhoto.current
                  pendingPhoto.current = undefined
                  if (!next) return
                  readText(next)
                  if (showStats) setLastPhoto(next)
                }, 0)
              }}
            />
            <View
              style={$overlay}
              pointerEvents="box-none"
              accessibilityElementsHidden={reviewing}
              importantForAccessibility={reviewing ? "no-hide-descendants" : "auto"}
            >
              <View style={$spacer} />
              {landCount ? (
                <View style={$readout}>
                  <View style={$readoutText}>
                    <Text
                      weight="medium"
                      numberOfLines={1}
                      style={$onCamera}
                      text={cardLabel(landCount.card)}
                    />
                    <Text size="xs" style={$onCameraDim} tx="decks:cardScan.howMany" />
                  </View>
                </View>
              ) : last ? (
                <TouchableOpacity
                  testID="card-scan-review"
                  accessibilityRole="button"
                  accessibilityLabel={translate("decks:cardScan.review")}
                  style={$readout}
                  onPress={() => setReviewing(true)}
                >
                  <CardImage
                    game={game}
                    source={last.imageUrl}
                    compact
                    style={$readoutImage}
                    accessibilityLabel={last.name}
                  />
                  <View style={$readoutText}>
                    <Text
                      weight="medium"
                      numberOfLines={1}
                      style={$onCamera}
                      text={cardLabel(last)}
                    />
                    {lastDetails ? (
                      <Text size="xs" style={{ color: theme.colors.tint }} text={lastDetails} />
                    ) : null}
                    <Text size="xs" style={$onCameraDim} text={addedSummary} />
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={$readout}>
                  <Text
                    size="sm"
                    style={[$onCameraDim, $readoutText]}
                    tx={onScanPrinting ? "decks:collection.emptySession" : "decks:cardScan.empty"}
                  />
                </View>
              )}
              <Text
                size="sm"
                numberOfLines={2}
                style={[$hint, { minHeight: 2 * $sizeStyles.sm.lineHeight * fontScale }]}
                text={statusText(status)}
              />
              <View
                testID="card-scan-frame-slot"
                style={[$frameSlot, { height: (screenWidth * FRAME_WIDTH * 88) / 63 }]}
                pointerEvents="none"
                onLayout={(event) => setFrame(frameIn(event.nativeEvent.layout))}
              >
                {frame ? (
                  <View style={[$frame, { width: frame.width, height: frame.height }]} />
                ) : null}
              </View>
              <View style={$actions}>
                {landCount ? (
                  <>
                    <Button
                      text="−"
                      accessibilityLabel={translate("decks:cardRow.decrease", {
                        card: landCount.card.name,
                      })}
                      disabled={landCount.count <= landCount.inDeck}
                      onPress={() => setLandCount({ ...landCount, count: landCount.count - 1 })}
                    />
                    <Text
                      weight="medium"
                      testID="card-scan-land-count"
                      style={$landCount}
                      text={landCount.count}
                    />
                    <Button
                      text="+"
                      accessibilityLabel={translate("decks:cardRow.increase", {
                        card: landCount.card.name,
                      })}
                      onPress={() => setLandCount({ ...landCount, count: landCount.count + 1 })}
                    />
                    <Button
                      testID="card-scan-add-lands"
                      style={$action}
                      tx={
                        landCount.count > landCount.inDeck
                          ? "decks:cardScan.addLands"
                          : "common:close"
                      }
                      onPress={() => addLands(landCount)}
                    />
                  </>
                ) : last ? (
                  <>
                    {showPrereleaseHud && (onUpdatePrinting || last.state !== "added") ? (
                      <Button
                        testID="card-scan-printing"
                        style={$action}
                        tx="decks:cardScan.changePrinting"
                        onPress={() => setPickingPrinting(last)}
                      />
                    ) : null}
                    {removeCard ? (
                      <Button
                        testID="card-scan-wrong"
                        style={$action}
                        tx="decks:cardScan.wrongCard"
                        onPress={() => setFixing(last)}
                      />
                    ) : null}
                  </>
                ) : null}
              </View>
              <View style={$spacer} />
              {showPrereleaseHud ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={$hudScroll}
                  contentContainerStyle={$hudRow}
                >
                  <TouchableOpacity
                    testID="card-scan-torch"
                    hitSlop={HUD_HIT_SLOP}
                    accessibilityRole="button"
                    style={[$hudPill, torch && { backgroundColor: theme.colors.tint }]}
                    onPress={() => setTorch((on) => !on)}
                  >
                    <Text size="xs" weight="medium" style={$onCamera} tx="decks:cardScan.torch" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="card-scan-mode"
                    hitSlop={HUD_HIT_SLOP}
                    accessibilityRole="button"
                    style={[
                      $hudPill,
                      scanMode === "bulk" && { backgroundColor: theme.colors.tint },
                    ]}
                    onPress={() =>
                      setScanMode((mode) => (mode === "handheld" ? "bulk" : "handheld"))
                    }
                  >
                    <Text
                      size="xs"
                      weight="medium"
                      style={$onCamera}
                      tx={scanMode === "bulk" ? "decks:cardScan.bulk" : "decks:cardScan.handheld"}
                    />
                  </TouchableOpacity>
                  {scanMode === "bulk" ? (
                    <TouchableOpacity
                      testID="card-scan-next-copy"
                      hitSlop={HUD_HIT_SLOP}
                      accessibilityRole="button"
                      style={$hudPill}
                      onPress={() => {
                        candidateName.current = undefined
                        nameInFrame.current = undefined
                        printingInFrame.current = undefined
                        recentVotes.current = []
                        setStatus("looking")
                      }}
                    >
                      <Text
                        size="xs"
                        weight="medium"
                        style={$onCamera}
                        tx="decks:cardScan.nextCopy"
                      />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    testID="card-scan-finish"
                    hitSlop={HUD_HIT_SLOP}
                    accessibilityRole="button"
                    style={[
                      $hudPill,
                      finish !== "nonfoil" && { backgroundColor: theme.colors.tint },
                    ]}
                    onPress={() => {
                      const next =
                        FINISH_CYCLE[(FINISH_CYCLE.indexOf(finish) + 1) % FINISH_CYCLE.length]
                      setFinish(next)
                      setFinishLocked(next !== "nonfoil")
                    }}
                  >
                    <Text
                      size="xs"
                      weight="medium"
                      style={$onCamera}
                      tx={`decks:cardScan.finish.${finish}`}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="card-scan-condition"
                    hitSlop={HUD_HIT_SLOP}
                    accessibilityRole="button"
                    style={[$hudPill, condition !== "NM" && { backgroundColor: theme.colors.tint }]}
                    onPress={() =>
                      setCondition(
                        CONDITION_CYCLE[
                          (CONDITION_CYCLE.indexOf(condition) + 1) % CONDITION_CYCLE.length
                        ],
                      )
                    }
                  >
                    <Text
                      size="xs"
                      weight="medium"
                      style={$onCamera}
                      tx={`decks:cardScan.condition.${condition}`}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="card-scan-set-lock"
                    hitSlop={HUD_HIT_SLOP}
                    accessibilityRole="button"
                    style={[$hudPill, Boolean(setLock) && { backgroundColor: theme.colors.tint }]}
                    onPress={() => {
                      setSetLockDraft(setLock)
                      setSetLockOpen(true)
                    }}
                  >
                    <Text
                      size="xs"
                      weight="medium"
                      style={$onCamera}
                      text={
                        setLock
                          ? `${translate("decks:cardScan.setLock")}: ${setLock}`
                          : translate("decks:cardScan.setLockAny")
                      }
                    />
                  </TouchableOpacity>
                  {sessionTotalCents !== undefined ? (
                    <View style={$hudPill}>
                      <Text
                        size="xs"
                        weight="medium"
                        style={$onCamera}
                        text={translate("decks:cardScan.sessionTotal", {
                          total: formatCurrency(sessionTotalCents, "USD"),
                        })}
                      />
                    </View>
                  ) : null}
                </ScrollView>
              ) : null}
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
        {permission && !permission.granted ? (
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
      {pickingPrinting ? (
        <PrintingPickerSheet
          visible
          game={game}
          cardName={pickingPrinting.name}
          cardId={pickingPrinting.cardId}
          selectedPrintingId={pickingPrinting.printingId}
          initialFinish={pickingPrinting.finish}
          initialCondition={pickingPrinting.condition}
          onPick={({
            printing,
            finish: nextFinish,
            condition: nextCondition,
            retailCents,
            buylistCents,
          }) => {
            const target = pickingPrinting
            setPickingPrinting(undefined)
            if (lastAcceptedCard.current?.id === target.id) {
              lastAcceptedCard.current = undefined
            }
            const revision = (printingEditRevision.current.get(target.id) ?? 0) + 1
            printingEditRevision.current.set(target.id, revision)
            const queued = waiting.current.find((item) => item.id === target.id)
            if (queued) {
              queued.printingId = printing.printingId
              queued.setCode = printing.setCode
              queued.collectorNumber = printing.collectorNumber
              queued.finish = nextFinish
              queued.condition = nextCondition
              queued.imageUrl = printing.smallImageUrl ?? printing.imageUrl
              queued.retailCents = retailCents
              queued.buylistCents = buylistCents
              updateCard(target.id, {
                printingId: printing.printingId,
                setCode: printing.setCode,
                collectorNumber: printing.collectorNumber,
                finish: nextFinish,
                condition: nextCondition,
                imageUrl: printing.smallImageUrl ?? printing.imageUrl,
                retailCents,
                buylistCents,
              })
              return
            }
            const apply = async () => {
              await lookups.current.get(target.id)
              if (printingEditRevision.current.get(target.id) !== revision) return
              if (!onUpdatePrinting) return
              const accepted = onUpdatePrinting(target.id, {
                name: target.name,
                printingId: printing.printingId,
                setCode: printing.setCode,
                collectorNumber: printing.collectorNumber,
                finish: nextFinish,
                condition: nextCondition,
                imageUrl: printing.imageUrl,
                smallImageUrl: printing.smallImageUrl,
                retailCents,
                buylistCents,
              })
              if (accepted === false) return
              if (printingEditRevision.current.get(target.id) !== revision) return
              updateCard(target.id, {
                printingId: printing.printingId,
                setCode: printing.setCode,
                collectorNumber: printing.collectorNumber,
                finish: nextFinish,
                condition: nextCondition,
                imageUrl: printing.smallImageUrl ?? printing.imageUrl,
                retailCents,
                buylistCents,
              })
            }
            const task = apply().finally(() => corrections.current.delete(task))
            corrections.current.add(task)
          }}
          onClose={() => setPickingPrinting(undefined)}
        />
      ) : null}
      {setLockOpen ? (
        <DialogCard
          visible
          onClose={() => setSetLockOpen(false)}
          backdropAccessibilityLabel={translate("common:close")}
        >
          <Text preset="subheading" tx="decks:cardScan.setLockTitle" />
          <TextField
            testID="card-scan-set-lock-input"
            value={setLockDraft}
            onChangeText={(value) => setSetLockDraft(value.toUpperCase().slice(0, 6))}
            placeholder={translate("decks:cardScan.setLockPlaceholder")}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <View style={$alternates}>
            <Button
              preset="primary"
              tx="common:done"
              onPress={() => {
                setSetLock(setLockDraft.trim().toUpperCase())
                if (rejectedBySetLock.current) {
                  if (nameInFrame.current) recentSeenAtByName.current.delete(nameInFrame.current)
                  nameInFrame.current = undefined
                  printingInFrame.current = undefined
                  candidateName.current = undefined
                  recentVotes.current = []
                  rejectedBySetLock.current = false
                }
                setSetLockOpen(false)
              }}
            />
            {setLock ? (
              <Button
                tx="decks:cardScan.setLockClear"
                onPress={() => {
                  setSetLock("")
                  setSetLockDraft("")
                  if (rejectedBySetLock.current) {
                    if (nameInFrame.current) recentSeenAtByName.current.delete(nameInFrame.current)
                    nameInFrame.current = undefined
                    printingInFrame.current = undefined
                    candidateName.current = undefined
                    recentVotes.current = []
                    rejectedBySetLock.current = false
                  }
                  setSetLockOpen(false)
                }}
              />
            ) : null}
          </View>
        </DialogCard>
      ) : null}
    </Modal>
  )
}

const $screen: ViewStyle = { flex: 1 }
// why: the pills draw 33 pt tall, so the slop and the row's matching padding make each target 45 pt.
const HUD_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 }
const $hudScroll: ViewStyle = { flexGrow: 0, flexShrink: 0 }
const $hudRow: ViewStyle = {
  flexDirection: "row",
  gap: 8,
  paddingHorizontal: 12,
  paddingVertical: 6,
}
const CAMERA_BACKING = "rgba(0,0,0,0.62)"
const $hudPill: ViewStyle = {
  backgroundColor: CAMERA_BACKING,
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: radius.full,
}
const $onCamera: TextStyle = { color: "#FFFFFF" }
const $onCameraDim: TextStyle = { color: "rgba(255,255,255,0.72)" }
const $overlay: ViewStyle = { ...StyleSheet.absoluteFill, gap: 8 }
const $spacer: ViewStyle = { flex: 1 }
const $readout: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  minHeight: 80,
  marginHorizontal: 12,
  padding: 8,
  borderRadius: radius.lg,
  backgroundColor: CAMERA_BACKING,
}
const $readoutImage: ImageStyle = { width: 46, height: 64 }
const $readoutText: ViewStyle = { flex: 1 }
const $hint: TextStyle = { color: "#FFFFFF", textAlign: "center", paddingHorizontal: 24 }
const $frameSlot: ViewStyle = { flexShrink: 1, alignItems: "center", justifyContent: "center" }
const $frame: ViewStyle = { borderWidth: 2, borderColor: "#FFFFFF", borderRadius: radius.xl }
const $actions: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  minHeight: 56,
  paddingHorizontal: 12,
}
const $action: ViewStyle = { flex: 1 }
const $landCount: TextStyle = {
  ...$onCamera,
  minWidth: 40,
  paddingVertical: 8,
  borderRadius: radius.lg,
  overflow: "hidden",
  textAlign: "center",
  backgroundColor: CAMERA_BACKING,
}
const $permission: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  paddingVertical: spacing.lg,
  paddingHorizontal: spacing.md,
})
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
