import { useMemo, useState } from "react"
import { FlatList, Modal, TouchableOpacity, View } from "react-native"
import type { ViewStyle } from "react-native"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
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
  const nameIndex = useCardNameIndex(game, deviceId, Boolean(scanningSide))

  const quickResults = useMemo(() => {
    const trimmed = normalizePrintingName(search)
    if (trimmed.length < 2) return []
    return catalogDb.findPrintingsByName(game, trimmed).slice(0, 6)
  }, [game, search])

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

  function addItem(targetSide: TradeSide, item: Omit<TradeItem, "key" | "quantity">) {
    setCommittedMessage(undefined)
    setTradeError(undefined)
    const key = `${item.printingId}:${item.finish}:${item.condition}`
    setSideItems(targetSide, (prev) => {
      const existing = prev.find((entry) => entry.key === key)
      if (existing) {
        return prev.map((entry) =>
          entry.key === key ? { ...entry, quantity: entry.quantity + 1 } : entry,
        )
      }
      return [{ ...item, key, quantity: 1 }, ...prev]
    })
  }

  function adjustQty(targetSide: TradeSide, key: string, change: number) {
    setTradeError(undefined)
    setSideItems(targetSide, (prev) =>
      prev
        .map((entry) =>
          entry.key === key ? { ...entry, quantity: entry.quantity + change } : entry,
        )
        .filter((entry) => entry.quantity > 0),
    )
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
    addItem(targetSide, {
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
  }

  function commitTrade() {
    const scanSessionIds = new Set(listBinders("scan_session").map((session) => session.id))
    const remainingByEntryId = new Map<string, number>()

    for (const item of giveItems) {
      let needed = item.quantity
      const matches = listCollectionEntries({ game, cardId: item.cardId }).filter(
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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen
        preset="fixed"
        safeAreaEdges={["bottom"]}
        backgroundColor={theme.colors.background}
        contentContainerStyle={$screen}
      >
        <Header
          titleTx="decks:collection.tradeTitle"
          leftTx="common:back"
          onLeftPress={onClose}
          rightTx="decks:collection.tradeClear"
          onRightPress={() => {
            setGiveItems([])
            setReceiveItems([])
            setCommittedMessage(undefined)
            setTradeError(undefined)
          }}
          backgroundColor={theme.colors.background}
        />
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
          {quickResults.length > 0 ? (
            <View style={themed($quickList)}>
              {quickResults.map((printing) => {
                const price = lookupPrintingPrice(
                  game,
                  printing.printingId,
                  DEFAULT_FINISH,
                  DEFAULT_CONDITION,
                )
                return (
                  <TouchableOpacity
                    key={printing.printingId}
                    accessibilityRole="button"
                    style={themed($quickRow)}
                    onPress={() => {
                      addItem(side, {
                        cardId: printing.cardId,
                        printingId: printing.printingId,
                        name: printing.name,
                        setCode: printing.setCode,
                        collectorNumber: printing.collectorNumber,
                        finish: "nonfoil",
                        condition: "NM",
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
              })}
            </View>
          ) : null}
        </View>

        <FlatList
          testID="trade-items-list"
          data={activeItems}
          keyExtractor={(item) => item.key}
          contentContainerStyle={themed($listContent)}
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
                    item.finish,
                    item.condition,
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

        {giveItems.length > 0 || receiveItems.length > 0 ? (
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
          sessionTotalCents={scanningSide === "give" ? giveTotal : receiveTotal}
          onClose={() => setScanningSide(undefined)}
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

const $screen: ViewStyle = { flex: 1 }
const $flex1: ViewStyle = { flex: 1 }
const $summary: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.md,
  gap: spacing.xs,
})
const $summaryCols: ViewStyle = { flexDirection: "row", justifyContent: "space-between" }
const $summaryCol: ViewStyle = { gap: 2 }
const $inputRow: ViewStyle = { flexDirection: "row", gap: 8, alignItems: "center" }
const $quickList: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: radius.md,
  backgroundColor: colors.surface,
  padding: spacing.xs,
  gap: spacing.xs,
})
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
