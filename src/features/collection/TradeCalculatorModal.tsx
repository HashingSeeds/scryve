import { useEffect, useMemo, useRef, useState } from "react"
import type { ComponentProps } from "react"
import { FlatList, Modal, TouchableOpacity, View } from "react-native"
import type { ListRenderItem, ViewStyle } from "react-native"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { searchCardNames } from "@/features/decks/cardNameMatch"
import { CardScanner, type ScannedPrintingPayload } from "@/features/decks/CardScanner"
import { useCardNameIndex } from "@/features/decks/useCardNameIndex"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { formatCurrency, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { catalogDb } from "@/storage/catalogDb"
import { localCardDb } from "@/storage/localDb"
import { useAppTheme } from "@/theme/context"
import { radius } from "@/theme/radius"
import type { ThemedStyle } from "@/theme/types"

import { lookupPrintingPrice, normalizePrintingName } from "./catalogSync"
import {
  addCollectionCard,
  listBinders,
  listCollectionEntries,
  updateCollectionEntry,
} from "./collectionStore"
import { PrintingPickerSheet } from "./PrintingPickerSheet"
import type { CardCondition, CardFinish } from "../../../convex/lib/cardPricing"
import { DEFAULT_DECK_GAME } from "../../../convex/lib/deckGames"

type TradeSide = "give" | "receive"
const DEFAULT_FINISH: CardFinish = "nonfoil"
const DEFAULT_CONDITION: CardCondition = "NM"

interface TradeItem {
  key: string
  cardId: string
  printingId: string
  name: string
  setCode: string
  collectorNumber: string
  finish: CardFinish
  condition: CardCondition
  quantity: number
  unitPriceCents: number
  imageUrl?: string
  smallImageUrl?: string
}

type TradeItemDraft = Omit<TradeItem, "key" | "quantity">
type CatalogPrinting = ReturnType<typeof catalogDb.findPrintingsByName>[number]
const NAME_SUGGESTIONS = 8
type PrintingUpdate = Parameters<
  NonNullable<ComponentProps<typeof CardScanner>["onUpdatePrinting"]>
>[1]

const itemKey = (item: TradeItemDraft) => `${item.printingId}:${item.finish}:${item.condition}`

function withCopy(items: TradeItem[], item: TradeItemDraft): TradeItem[] {
  const key = itemKey(item)
  if (!items.some((entry) => entry.key === key)) return [{ ...item, key, quantity: 1 }, ...items]
  // why: a row added before prices loaded shows $0, so a copy that arrives with a price reprices the row.
  return items.map((entry) =>
    entry.key === key
      ? {
          ...entry,
          quantity: entry.quantity + 1,
          unitPriceCents: item.unitPriceCents || entry.unitPriceCents,
        }
      : entry,
  )
}

function changeQuantity(items: TradeItem[], key: string, change: number): TradeItem[] {
  return items
    .map((entry) => (entry.key === key ? { ...entry, quantity: entry.quantity + change } : entry))
    .filter((entry) => entry.quantity > 0)
}

export function TradeCalculatorModal({
  visible,
  game = DEFAULT_DECK_GAME,
  onClose,
}: {
  visible: boolean
  game?: string
  onClose: () => void
}) {
  const { themed, theme } = useAppTheme()
  const [deviceId] = useState(() => new LocalGameRepository().getDeviceId())
  const [side, setSide] = useState<TradeSide>("give")
  const [giveItems, setGiveItems] = useState<TradeItem[]>([])
  const [receiveItems, setReceiveItems] = useState<TradeItem[]>([])
  const [search, setSearch] = useState("")
  const [scanningSide, setScanningSide] = useState<TradeSide>()
  const [editingItem, setEditingItem] = useState<{ side: TradeSide; item: TradeItem }>()
  const [committedMessage, setCommittedMessage] = useState<string>()
  const [tradeError, setTradeError] = useState<string>()
  const nameIndex = useCardNameIndex(game, deviceId, visible)
  // why: the scanner refines a card by its scan ID after adding it, so remember which row each scan landed in.
  const scanItemKeys = useRef(new Map<number, string>())

  useEffect(() => {
    setGiveItems([])
    setReceiveItems([])
    setSearch("")
    setScanningSide(undefined)
    setEditingItem(undefined)
    setCommittedMessage(undefined)
    setTradeError(undefined)
    scanItemKeys.current.clear()
  }, [game])

  // why: an exact name lists its printings; anything else suggests names, and tapping one fills it in.
  const searchResults = useMemo(() => {
    const key = normalizePrintingName(search)
    if (key.length < 2) return undefined
    const printings = catalogDb.findPrintingsByName(game, key)
    if (printings.length) return { printings, names: [] }
    const names = nameIndex ? searchCardNames(nameIndex, search, NAME_SUGGESTIONS) : []
    return { printings, names }
  }, [game, nameIndex, search])

  const giveTotal = useMemo(
    () => giveItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0),
    [giveItems],
  )
  const receiveTotal = useMemo(
    () => receiveItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0),
    [receiveItems],
  )
  const delta = receiveTotal - giveTotal

  function setSideItems(targetSide: TradeSide, updater: (prev: TradeItem[]) => TradeItem[]) {
    if (targetSide === "give") setGiveItems(updater)
    else setReceiveItems(updater)
  }

  function addItem(targetSide: TradeSide, item: TradeItemDraft) {
    setCommittedMessage(undefined)
    setTradeError(undefined)
    setSideItems(targetSide, (prev) => withCopy(prev, item))
    return itemKey(item)
  }

  function adjustQty(targetSide: TradeSide, key: string, change: number) {
    setTradeError(undefined)
    setSideItems(targetSide, (prev) => changeQuantity(prev, key, change))
  }

  function handleScan(targetSide: TradeSide, scan: ScannedPrintingPayload) {
    const printing = scan.printingId
      ? catalogDb.getPrinting(game, scan.printingId)
      : catalogDb.findPrintingsByName(game, normalizePrintingName(scan.name))[0]
    const printingId =
      printing?.printingId ?? scan.printingId ?? `scan:${normalizePrintingName(scan.name)}`
    const price =
      scan.retailCents ??
      lookupPrintingPrice(game, printingId, scan.finish, scan.condition).retailCents ??
      0
    const key = addItem(targetSide, {
      cardId: printing?.cardId ?? scan.cardId ?? `name:${normalizePrintingName(scan.name)}`,
      printingId,
      name: printing?.name ?? scan.name,
      setCode: printing?.setCode ?? scan.setCode ?? "",
      collectorNumber: printing?.collectorNumber ?? scan.collectorNumber ?? "",
      finish: scan.finish,
      condition: scan.condition,
      unitPriceCents: price,
      imageUrl: printing?.imageUrl ?? scan.imageUrl,
      smallImageUrl: printing?.smallImageUrl ?? scan.imageUrl,
    })
    scanItemKeys.current.set(scan.id, key)
  }

  // why: a refinement corrects one scanned copy, so it moves that copy and leaves the rest of its row alone.
  function handleScanUpdate(targetSide: TradeSide, scanId: number, update: PrintingUpdate) {
    const fromKey = scanItemKeys.current.get(scanId)
    if (!fromKey) return false
    const printing = catalogDb.getPrinting(game, update.printingId)
    const next: TradeItemDraft = {
      cardId: printing?.cardId ?? `name:${normalizePrintingName(update.name)}`,
      printingId: update.printingId,
      name: printing?.name ?? update.name,
      setCode: update.setCode,
      collectorNumber: update.collectorNumber,
      finish: update.finish,
      condition: update.condition,
      unitPriceCents:
        update.retailCents ??
        lookupPrintingPrice(game, update.printingId, update.finish, update.condition).retailCents ??
        0,
      imageUrl: update.imageUrl ?? printing?.imageUrl,
      smallImageUrl: update.smallImageUrl ?? printing?.smallImageUrl ?? update.imageUrl,
    }
    setSideItems(targetSide, (prev) =>
      prev.some((entry) => entry.key === fromKey)
        ? changeQuantity(withCopy(prev, next), fromKey, -1)
        : prev,
    )
    scanItemKeys.current.set(scanId, itemKey(next))
    return true
  }

  function commitTrade() {
    const scanSessionIds = new Set(listBinders("scan_session").map((session) => session.id))
    const gameEntries = listCollectionEntries({ game })
    const remainingByEntryId = new Map<string, number>()

    for (const item of giveItems) {
      let needed = item.quantity
      const matches = gameEntries.filter(
        (entry) =>
          entry.printingId === item.printingId &&
          entry.finish === item.finish &&
          entry.condition === item.condition &&
          (!entry.binderId || !scanSessionIds.has(entry.binderId)),
      )
      for (const entry of matches) {
        if (needed <= 0) break
        const available = remainingByEntryId.get(entry.id) ?? entry.quantity
        if (available <= 0) continue
        const take = Math.min(needed, available)
        remainingByEntryId.set(entry.id, available - take)
        needed -= take
      }
      if (needed > 0) {
        setCommittedMessage(undefined)
        setTradeError(translate("decks:collection.tradeInsufficientStock", { card: item.name }))
        return
      }
    }

    localCardDb.transaction(() => {
      for (const [entryId, nextQuantity] of remainingByEntryId) {
        updateCollectionEntry(entryId, { quantity: nextQuantity })
      }
      for (const item of receiveItems) {
        addCollectionCard({
          game,
          cardId: item.cardId,
          printingId: item.printingId,
          name: item.name,
          setCode: item.setCode,
          collectorNumber: item.collectorNumber,
          finish: item.finish,
          condition: item.condition,
          quantity: item.quantity,
          imageUrl: item.imageUrl,
          smallImageUrl: item.smallImageUrl,
        })
      }
    })
    setTradeError(undefined)
    setGiveItems([])
    setReceiveItems([])
    setCommittedMessage(translate("decks:collection.tradeCommitted"))
  }

  const activeItems = side === "give" ? giveItems : receiveItems

  const renderPrinting: ListRenderItem<CatalogPrinting> = ({ item: printing }) => {
    const rowFinish: CardFinish =
      printing.finishes.length === 0 || printing.finishes.includes(DEFAULT_FINISH)
        ? DEFAULT_FINISH
        : printing.finishes[0] === "foil" || printing.finishes[0] === "etched"
          ? printing.finishes[0]
          : DEFAULT_FINISH
    const price = lookupPrintingPrice(game, printing.printingId, rowFinish, DEFAULT_CONDITION)
    return (
      <TouchableOpacity
        accessibilityRole="button"
        style={themed($quickRow)}
        onPress={() => {
          addItem(side, {
            cardId: printing.cardId,
            printingId: printing.printingId,
            name: printing.name,
            setCode: printing.setCode,
            collectorNumber: printing.collectorNumber,
            finish: rowFinish,
            condition: DEFAULT_CONDITION,
            unitPriceCents: price.retailCents ?? 0,
            imageUrl: printing.imageUrl,
            smallImageUrl: printing.smallImageUrl,
          })
          setSearch("")
        }}
      >
        <Text
          style={$flex1}
          numberOfLines={1}
          text={joinParts([
            printing.name,
            printing.setCode.toUpperCase(),
            `#${printing.collectorNumber}`,
          ])}
        />
        {price.retailCents !== undefined ? (
          <Text size="xs" text={formatCurrency(price.retailCents, "USD")} />
        ) : null}
      </TouchableOpacity>
    )
  }

  const renderName: ListRenderItem<string> = ({ item: name }) => (
    <TouchableOpacity
      accessibilityRole="button"
      style={themed($quickRow)}
      onPress={() => setSearch(name)}
    >
      <Text style={$flex1} numberOfLines={1} text={name} />
    </TouchableOpacity>
  )

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen
        preset="fixed"
        safeAreaEdges={["bottom"]}
        backgroundColor={theme.colors.background}
        contentContainerStyle={$screen}
        header={{
          titleTx: "decks:collection.tradeTitle",
          leftTx: "common:back",
          onLeftPress: onClose,
          rightTx: "decks:collection.tradeClear",
          onRightPress: () => {
            setGiveItems([])
            setReceiveItems([])
            setCommittedMessage(undefined)
            setTradeError(undefined)
          },
          backgroundColor: theme.colors.background,
        }}
      >
        <View style={themed($summary)}>
          <View style={$summaryCols}>
            <View style={$summaryCol}>
              <Text
                size="xs"
                style={{ color: theme.colors.textDim }}
                tx="decks:collection.tradeGive"
              />
              <Text weight="bold" text={formatCurrency(giveTotal, "USD")} />
            </View>
            <View style={$summaryCol}>
              <Text
                size="xs"
                style={{ color: theme.colors.textDim }}
                tx="decks:collection.tradeReceive"
              />
              <Text weight="bold" text={formatCurrency(receiveTotal, "USD")} />
            </View>
          </View>
          <Text
            size="sm"
            weight="medium"
            style={{ color: delta >= 0 ? theme.colors.tint : theme.colors.error }}
            text={
              delta === 0
                ? translate("decks:collection.tradeEven")
                : delta > 0
                  ? translate("decks:collection.tradeAhead", {
                      delta: formatCurrency(delta, "USD"),
                    })
                  : translate("decks:collection.tradeBehind", {
                      delta: formatCurrency(Math.abs(delta), "USD"),
                    })
            }
          />
          {committedMessage ? (
            <Text size="xs" style={{ color: theme.colors.tint }} text={committedMessage} />
          ) : null}
          {tradeError ? (
            <Text
              testID="trade-error-message"
              size="xs"
              style={{ color: theme.colors.error }}
              text={tradeError}
            />
          ) : null}
          <SegmentedControl
            testID="trade-side-segment"
            segments={[
              { id: "give", label: translate("decks:collection.tradeGive") },
              { id: "receive", label: translate("decks:collection.tradeReceive") },
            ]}
            selectedId={side}
            onSelect={(id) => setSide(id as TradeSide)}
          />
          <View style={$inputRow}>
            <TextField
              testID="trade-search-input"
              value={search}
              onChangeText={setSearch}
              placeholderTx="decks:collection.searchCatalogPlaceholder"
              containerStyle={$flex1}
              autoCorrect={false}
            />
            <Button
              testID="trade-scan-button"
              tx={
                side === "give"
                  ? "decks:collection.tradeScanGive"
                  : "decks:collection.tradeScanReceive"
              }
              onPress={() => setScanningSide(side)}
            />
          </View>
        </View>

        {searchResults?.printings.length ? (
          <FlatList
            testID="trade-search-results"
            style={$results}
            data={searchResults.printings}
            keyExtractor={(printing) => printing.printingId}
            renderItem={renderPrinting}
            contentContainerStyle={themed($listContent)}
            keyboardShouldPersistTaps="handled"
          />
        ) : searchResults?.names.length ? (
          <FlatList
            testID="trade-search-results"
            style={$results}
            data={searchResults.names}
            keyExtractor={(name) => name}
            renderItem={renderName}
            contentContainerStyle={themed($listContent)}
            keyboardShouldPersistTaps="handled"
          />
        ) : searchResults ? (
          <View style={[$results, themed($listContent)]}>
            <Text style={{ color: theme.colors.textDim }} tx="decks:cardSearch.noResults" />
          </View>
        ) : (
          <FlatList
            testID="trade-items-list"
            style={$results}
            data={activeItems}
            keyExtractor={(item) => item.key}
            contentContainerStyle={themed($listContent)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={themed($itemRow)}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={$flex1}
                  onPress={() => setEditingItem({ side, item })}
                >
                  <Text weight="medium" numberOfLines={1} text={item.name} />
                  <Text
                    size="xs"
                    style={{ color: theme.colors.textDim }}
                    text={joinParts([
                      item.setCode.toUpperCase(),
                      item.collectorNumber ? `#${item.collectorNumber}` : "",
                      item.finish !== DEFAULT_FINISH &&
                        translate(`decks:cardScan.finish.${item.finish}`),
                      item.condition !== DEFAULT_CONDITION &&
                        translate(`decks:cardScan.condition.${item.condition}`),
                      formatCurrency(item.unitPriceCents * item.quantity, "USD"),
                    ])}
                  />
                </TouchableOpacity>
                <View style={$qtyRow}>
                  <Button text="−" onPress={() => adjustQty(side, item.key, -1)} />
                  <Text weight="medium" text={item.quantity} />
                  <Button text="+" onPress={() => adjustQty(side, item.key, 1)} />
                </View>
              </View>
            )}
          />
        )}

        {!searchResults && (giveItems.length > 0 || receiveItems.length > 0) ? (
          <View style={themed($footer)}>
            <Button
              testID="trade-commit-button"
              preset="primary"
              tx="decks:collection.tradeCommit"
              onPress={commitTrade}
            />
          </View>
        ) : null}
      </Screen>

      {scanningSide ? (
        <CardScanner
          game={game}
          nameIndex={nameIndex}
          singleton={false}
          copiesInDeck={() => 0}
          addCards={async (names) => names.map(() => ({}))}
          onScanPrinting={(scan) => handleScan(scanningSide, scan)}
          onUpdatePrinting={(scanId, update) => handleScanUpdate(scanningSide, scanId, update)}
          sessionTotalCents={scanningSide === "give" ? giveTotal : receiveTotal}
          onClose={() => {
            scanItemKeys.current.clear()
            setScanningSide(undefined)
          }}
        />
      ) : null}

      {editingItem ? (
        <PrintingPickerSheet
          visible
          game={game}
          cardName={editingItem.item.name}
          cardId={editingItem.item.cardId}
          selectedPrintingId={editingItem.item.printingId}
          initialFinish={editingItem.item.finish}
          initialCondition={editingItem.item.condition}
          onPick={({ printing, finish, condition, retailCents }) => {
            setTradeError(undefined)
            const nextKey = `${printing.printingId}:${finish}:${condition}`
            setSideItems(editingItem.side, (prev) => {
              const source = prev.find((entry) => entry.key === editingItem.item.key)
              if (!source) return prev
              const updated: TradeItem = {
                ...source,
                key: nextKey,
                cardId: printing.cardId,
                printingId: printing.printingId,
                setCode: printing.setCode,
                collectorNumber: printing.collectorNumber,
                finish,
                condition,
                unitPriceCents: retailCents ?? 0,
                imageUrl: printing.imageUrl,
                smallImageUrl: printing.smallImageUrl,
              }
              if (nextKey === editingItem.item.key) {
                return prev.map((entry) => (entry.key === editingItem.item.key ? updated : entry))
              }
              const existingTarget = prev.find((entry) => entry.key === nextKey)
              if (existingTarget) {
                return prev
                  .filter((entry) => entry.key !== editingItem.item.key)
                  .map((entry) =>
                    entry.key === nextKey
                      ? { ...updated, quantity: existingTarget.quantity + source.quantity }
                      : entry,
                  )
              }
              return prev.map((entry) => (entry.key === editingItem.item.key ? updated : entry))
            })
            setEditingItem(undefined)
          }}
          onClose={() => setEditingItem(undefined)}
        />
      ) : null}
    </Modal>
  )
}

// why: the fixed preset bottom-aligns content, so a column taller than the space above the keyboard would slide up under the header.
const $screen: ViewStyle = { flex: 1, justifyContent: "flex-start" }
const $flex1: ViewStyle = { flex: 1 }
const $summary: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.md,
  gap: spacing.xs,
})
const $summaryCols: ViewStyle = { flexDirection: "row", justifyContent: "space-between" }
const $summaryCol: ViewStyle = { gap: 2 }
const $inputRow: ViewStyle = { flexDirection: "row", gap: 8, alignItems: "center" }
// why: the keyboard shrinks the screen, so the results give up height instead of pushing the header off screen.
const $results: ViewStyle = { flex: 1, minHeight: 0 }
const $quickRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.xs,
  gap: spacing.xs,
})
const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  gap: spacing.xs,
})
const $itemRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  padding: spacing.sm,
  borderRadius: radius.md,
  backgroundColor: colors.surface,
})
const $qtyRow: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 6 }
const $footer: ThemedStyle<ViewStyle> = ({ spacing }) => ({ padding: spacing.md })
