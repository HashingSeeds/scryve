import { useMemo, useState } from "react"
import { FlatList, Linking, ScrollView, TouchableOpacity, View } from "react-native"
import type { ImageStyle, ViewStyle } from "react-native"
import * as Clipboard from "expo-clipboard"

import { Button } from "@/components/Button"
import { CardImage } from "@/components/CardImage"
import { DialogCard } from "@/components/DialogCard"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { CardScanner, type ScannedPrintingPayload } from "@/features/decks/CardScanner"
import { useCardNameIndex } from "@/features/decks/useCardNameIndex"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { formatCurrency, formatDate, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { catalogDb } from "@/storage/catalogDb"
import { useAppTheme } from "@/theme/context"
import { radius } from "@/theme/radius"
import type { ThemedStyle } from "@/theme/types"

import { lookupPrintingPrice, normalizePrintingName, useCatalogSync } from "./catalogSync"
import { exportCollectionCsv, importCollectionText } from "./collectionImportExport"
import {
  addCollectionCard,
  createBinder,
  deleteBinder,
  listBinders,
  listCollectionEntries,
  updateCollectionEntry,
  useCollectionRevision,
  type StoredBinder,
  type StoredCollectionEntry,
} from "./collectionStore"
import { PrintingPickerSheet } from "./PrintingPickerSheet"
import { ScanSessionView } from "./ScanSessionView"
import { cardKingdomCardUrl, tcgplayerCardUrl } from "./storeLinks"
import { TradeCalculatorModal } from "./TradeCalculatorModal"
import type { CardCondition, CardFinish } from "../../../convex/lib/cardPricing"
import { DEFAULT_DECK_GAME } from "../../../convex/lib/deckGames"

type SortMode = "value" | "name" | "recent"

export function CollectionShelf({
  mode,
  game = DEFAULT_DECK_GAME,
}: {
  mode: "collection" | "scans"
  game?: string
}) {
  const { themed, theme } = useAppTheme()
  const [deviceId] = useState(() => new LocalGameRepository().getDeviceId())
  const revision = useCollectionRevision()
  const sync = useCatalogSync(game, true)

  const [selectedBinderId, setSelectedBinderId] = useState<string | "all">("all")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortMode>("value")
  const [newBinderOpen, setNewBinderOpen] = useState(false)
  const [newBinderName, setNewBinderName] = useState("")
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState("")
  const [importMessage, setImportMessage] = useState<string>()
  const [tradeOpen, setTradeOpen] = useState(false)
  const [activeScanSession, setActiveScanSession] = useState<StoredBinder>()
  const [scanningSession, setScanningSession] = useState<StoredBinder>()
  const [editingEntry, setEditingEntry] = useState<StoredCollectionEntry>()
  const [addCardOpen, setAddCardOpen] = useState(false)
  const [addCardQuery, setAddCardQuery] = useState("")

  const nameIndex = useCardNameIndex(game, deviceId, Boolean(scanningSession))

  const binders = useMemo(() => {
    void revision
    return listBinders("binder")
  }, [revision])

  const scanSessions = useMemo(() => {
    void revision
    return listBinders("scan_session")
  }, [revision])

  const allEntries = useMemo(() => {
    void revision
    return listCollectionEntries({ game })
  }, [revision, game])

  const scanSessionIds = useMemo(
    () => new Set(scanSessions.map((session) => session.id)),
    [scanSessions],
  )

  const collectionEntries = useMemo(
    () =>
      allEntries.filter((entry) => {
        if (selectedBinderId === "all")
          return !entry.binderId || !scanSessionIds.has(entry.binderId)
        return entry.binderId === selectedBinderId
      }),
    [allEntries, selectedBinderId, scanSessionIds],
  )

  const pricedEntries = useMemo(() => {
    const term = search.trim().toLowerCase()
    const items = collectionEntries
      .filter(
        (entry) => !term || entry.name.toLowerCase().includes(term) || entry.setCode.includes(term),
      )
      .map((entry) => {
        const price = lookupPrintingPrice(
          entry.game,
          entry.printingId,
          entry.finish,
          entry.condition,
        )
        const printing = catalogDb.getPrinting(entry.game, entry.printingId)
        return {
          entry,
          printing,
          retailCents: price.retailCents ?? 0,
          buylistCents: price.buylistCents ?? 0,
        }
      })
    if (sort === "name") return items.sort((a, b) => a.entry.name.localeCompare(b.entry.name))
    if (sort === "recent") return items.sort((a, b) => b.entry.updatedAt - a.entry.updatedAt)
    return items.sort(
      (a, b) =>
        b.retailCents * b.entry.quantity - a.retailCents * a.entry.quantity ||
        a.entry.name.localeCompare(b.entry.name),
    )
  }, [collectionEntries, search, sort])

  const totals = useMemo(() => {
    let cards = 0
    let retailCents = 0
    let buylistCents = 0
    for (const item of pricedEntries) {
      cards += item.entry.quantity
      retailCents += item.retailCents * item.entry.quantity
      buylistCents += item.buylistCents * item.entry.quantity
    }
    return { cards, retailCents, buylistCents }
  }, [pricedEntries])

  const quickAddMatches = useMemo(() => {
    const norm = normalizePrintingName(addCardQuery)
    if (norm.length < 2) return []
    return catalogDb.findPrintingsByName(game, norm).slice(0, 8)
  }, [addCardQuery, game])

  function startNewScanSession() {
    const session = createBinder({
      kind: "scan_session",
      name: translate("decks:collection.scanSessionName", {
        date: formatDate(new Date(), {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
      }),
      game,
    })
    setScanningSession(session)
  }

  function handleScanIntoSession(session: StoredBinder, scan: ScannedPrintingPayload) {
    const printing = scan.printingId
      ? catalogDb.getPrinting(game, scan.printingId)
      : catalogDb.findPrintingsByName(game, normalizePrintingName(scan.name))[0]
    addCollectionCard({
      game,
      cardId: printing?.cardId ?? scan.cardId ?? `name:${normalizePrintingName(scan.name)}`,
      printingId:
        printing?.printingId ?? scan.printingId ?? `scan:${normalizePrintingName(scan.name)}`,
      name: printing?.name ?? scan.name,
      setCode: printing?.setCode ?? scan.setCode ?? "",
      collectorNumber: printing?.collectorNumber ?? scan.collectorNumber ?? "",
      finish: scan.finish,
      condition: scan.condition,
      language: scan.language,
      binderId: session.id,
      imageUrl: printing?.imageUrl ?? scan.imageUrl,
      smallImageUrl: printing?.smallImageUrl ?? scan.imageUrl,
    })
  }

  const scanningTotalCents = useMemo(() => {
    if (!scanningSession) return undefined
    void revision
    return listCollectionEntries({ binderId: scanningSession.id }).reduce((sum, entry) => {
      const price = lookupPrintingPrice(entry.game, entry.printingId, entry.finish, entry.condition)
      return sum + (price.retailCents ?? 0) * entry.quantity
    }, 0)
  }, [scanningSession, revision])

  if (mode === "scans") {
    return (
      <View style={$flex1}>
        <View style={themed($headerActions)}>
          <Button
            testID="new-scan-session-button"
            preset="primary"
            tx="decks:collection.newScanSession"
            onPress={startNewScanSession}
          />
          <Button
            testID="scans-trade-button"
            tx="decks:collection.trade"
            onPress={() => setTradeOpen(true)}
          />
        </View>
        <FlatList
          testID="scan-sessions-list"
          data={scanSessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={themed($listContent)}
          ListEmptyComponent={
            <View style={themed($empty)}>
              <Text
                size="sm"
                style={{ color: theme.colors.textDim }}
                tx="decks:collection.emptyScans"
              />
            </View>
          }
          renderItem={({ item }) => {
            const entries = listCollectionEntries({ binderId: item.id })
            const count = entries.reduce((sum, entry) => sum + entry.quantity, 0)
            const retail = entries.reduce(
              (sum, entry) =>
                sum +
                (lookupPrintingPrice(entry.game, entry.printingId, entry.finish, entry.condition)
                  .retailCents ?? 0) *
                  entry.quantity,
              0,
            )
            return (
              <TouchableOpacity
                testID={`scan-session-row-${item.id}`}
                accessibilityRole="button"
                style={themed($rowCard)}
                onPress={() => setActiveScanSession(item)}
              >
                <View style={$flex1}>
                  <Text weight="medium" text={item.name} />
                  <Text
                    size="xs"
                    style={{ color: theme.colors.textDim }}
                    text={joinParts([
                      translate("decks:cardCount", { count }),
                      formatCurrency(retail, "USD"),
                    ])}
                  />
                </View>
                <Button tx="decks:collection.scanMore" onPress={() => setScanningSession(item)} />
              </TouchableOpacity>
            )
          }}
        />
        {activeScanSession ? (
          <ScanSessionView
            visible
            session={activeScanSession}
            onScanMore={() => {
              const target = activeScanSession
              setActiveScanSession(undefined)
              setScanningSession(target)
            }}
            onClose={() => setActiveScanSession(undefined)}
          />
        ) : null}
        {scanningSession ? (
          <CardScanner
            game={game}
            nameIndex={nameIndex}
            singleton={false}
            copiesInDeck={() => 0}
            addCards={async (names) => names.map(() => ({}))}
            onScanPrinting={(scan) => handleScanIntoSession(scanningSession, scan)}
            sessionTotalCents={scanningTotalCents}
            initialSetLock={scanningSession.defaultSetCode}
            onClose={() => {
              const finished = scanningSession
              setScanningSession(undefined)
              setActiveScanSession(finished)
            }}
          />
        ) : null}
        <TradeCalculatorModal visible={tradeOpen} game={game} onClose={() => setTradeOpen(false)} />
      </View>
    )
  }

  return (
    <View style={$flex1}>
      <View style={themed($summaryBox)}>
        <View style={$summaryHeader}>
          <View style={$flex1}>
            <Text weight="bold" text={translate("decks:cardCount", { count: totals.cards })} />
            <Text
              size="xs"
              style={{ color: theme.colors.textDim }}
              text={joinParts([
                translate("decks:collection.retailTotal", {
                  total: formatCurrency(totals.retailCents, "USD"),
                }),
                totals.buylistCents > 0
                  ? translate("decks:collection.buylistTotal", {
                      total: formatCurrency(totals.buylistCents, "USD"),
                    })
                  : "",
                sync.syncing ? translate("decks:collection.syncingPrices") : "",
              ])}
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={$chipRow}
        >
          <Button
            testID="collection-scan-button"
            preset="primary"
            tx="decks:collection.newScanSession"
            onPress={startNewScanSession}
          />
          <Button
            testID="collection-add-card-button"
            tx="decks:collection.addCard"
            onPress={() => setAddCardOpen(true)}
          />
          <Button
            testID="collection-trade-button"
            tx="decks:collection.trade"
            onPress={() => setTradeOpen(true)}
          />
          <Button
            testID="collection-import-button"
            tx="decks:collection.importExport"
            onPress={() => {
              setImportMessage(undefined)
              setImportOpen(true)
            }}
          />
          <Button
            testID="collection-new-binder-button"
            tx="decks:collection.newBinder"
            onPress={() => setNewBinderOpen(true)}
          />
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={$chipRow}
        >
          <TouchableOpacity
            testID="binder-filter-all"
            accessibilityRole="button"
            style={[themed($binderChip), selectedBinderId === "all" && themed($binderChipSelected)]}
            onPress={() => setSelectedBinderId("all")}
          >
            <Text size="xs" weight="medium" tx="decks:collection.allCards" />
          </TouchableOpacity>
          {binders.map((binder) => (
            <TouchableOpacity
              key={binder.id}
              testID={`binder-filter-${binder.id}`}
              accessibilityRole="button"
              style={[
                themed($binderChip),
                selectedBinderId === binder.id && themed($binderChipSelected),
              ]}
              onPress={() => setSelectedBinderId(binder.id)}
            >
              <Text size="xs" weight="medium" text={binder.name} />
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TextField
          testID="collection-search-input"
          value={search}
          onChangeText={setSearch}
          placeholderTx="decks:collection.searchCards"
          autoCorrect={false}
          clearable
        />
        <SegmentedControl
          segments={[
            { id: "value", label: translate("decks:collection.sortValue") },
            { id: "name", label: translate("decks:collection.sortName") },
            { id: "recent", label: translate("decks:collection.sortRecent") },
          ]}
          selectedId={sort}
          onSelect={(id) => setSort(id as SortMode)}
        />
      </View>

      <FlatList
        testID="collection-entries-list"
        data={pricedEntries}
        keyExtractor={(item) => item.entry.id}
        contentContainerStyle={themed($listContent)}
        ListEmptyComponent={
          <View style={themed($empty)}>
            <Text
              size="sm"
              style={{ color: theme.colors.textDim }}
              tx="decks:collection.emptyCollection"
            />
          </View>
        }
        renderItem={({ item: { entry, printing, retailCents, buylistCents } }) => (
          <View style={themed($rowCard)}>
            <TouchableOpacity
              accessibilityRole="button"
              style={$cardLead}
              onPress={() => setEditingEntry(entry)}
            >
              <CardImage
                game={entry.game}
                source={entry.smallImageUrl ?? entry.imageUrl}
                compact
                style={$thumb}
                accessibilityLabel={entry.name}
              />
              <View style={$flex1}>
                <Text weight="medium" numberOfLines={1} text={entry.name} />
                <Text
                  size="xs"
                  style={{ color: theme.colors.textDim }}
                  text={joinParts([
                    entry.setCode.toUpperCase(),
                    entry.collectorNumber ? `#${entry.collectorNumber}` : "",
                    entry.finish,
                    entry.condition,
                  ])}
                />
                <Text
                  size="xs"
                  style={{ color: theme.colors.textDim }}
                  text={joinParts([
                    retailCents > 0 ? formatCurrency(retailCents * entry.quantity, "USD") : "",
                    buylistCents > 0
                      ? translate("decks:cardScan.buylistShort", {
                          value: formatCurrency(buylistCents * entry.quantity, "USD"),
                        })
                      : "",
                  ])}
                />
              </View>
            </TouchableOpacity>
            <View style={$rowActions}>
              <View style={$qtyRow}>
                <Button
                  text="−"
                  onPress={() => updateCollectionEntry(entry.id, { quantity: entry.quantity - 1 })}
                />
                <Text weight="medium" text={entry.quantity} />
                <Button
                  text="+"
                  onPress={() => updateCollectionEntry(entry.id, { quantity: entry.quantity + 1 })}
                />
              </View>
              <View style={$linkRow}>
                <TouchableOpacity
                  accessibilityRole="link"
                  onPress={() =>
                    void Linking.openURL(
                      tcgplayerCardUrl({
                        name: entry.name,
                        setCode: entry.setCode,
                        tcgplayerId: printing?.tcgplayerId,
                      }),
                    )
                  }
                >
                  <Text
                    size="xs"
                    style={{ color: theme.colors.tint }}
                    tx="decks:collection.tcgplayer"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="link"
                  onPress={() =>
                    void Linking.openURL(
                      cardKingdomCardUrl({ name: entry.name }, { buylist: true }),
                    )
                  }
                >
                  <Text
                    size="xs"
                    style={{ color: theme.colors.tint }}
                    tx="decks:collection.cardKingdomBuylist"
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListFooterComponent={
          selectedBinderId !== "all" ? (
            <Button
              tx="decks:collection.deleteBinder"
              onPress={() => {
                deleteBinder(selectedBinderId)
                setSelectedBinderId("all")
              }}
            />
          ) : null
        }
      />

      {newBinderOpen ? (
        <DialogCard
          visible
          onClose={() => setNewBinderOpen(false)}
          backdropAccessibilityLabel={translate("common:close")}
        >
          <Text preset="subheading" tx="decks:collection.newBinder" />
          <TextField
            testID="new-binder-name-input"
            value={newBinderName}
            onChangeText={setNewBinderName}
            placeholderTx="decks:collection.binderNamePlaceholder"
          />
          <Button
            testID="create-binder-submit"
            preset="primary"
            tx="decks:collection.createBinder"
            disabled={!newBinderName.trim()}
            onPress={() => {
              const created = createBinder({ kind: "binder", name: newBinderName.trim(), game })
              setNewBinderName("")
              setNewBinderOpen(false)
              setSelectedBinderId(created.id)
            }}
          />
        </DialogCard>
      ) : null}

      {importOpen ? (
        <DialogCard
          visible
          onClose={() => setImportOpen(false)}
          backdropAccessibilityLabel={translate("common:close")}
        >
          <Text preset="subheading" tx="decks:collection.importTitle" />
          <TextField
            testID="collection-import-input"
            value={importText}
            onChangeText={setImportText}
            placeholderTx="decks:collection.importPlaceholder"
            multiline
            style={$multiline}
          />
          {importMessage ? (
            <Text size="xs" style={{ color: theme.colors.tint }} text={importMessage} />
          ) : null}
          <View style={$dialogButtons}>
            <Button
              testID="collection-import-submit"
              preset="primary"
              tx="decks:collection.importAction"
              disabled={!importText.trim()}
              onPress={() => {
                const { imported, skipped } = importCollectionText(
                  importText,
                  game,
                  selectedBinderId === "all" ? undefined : selectedBinderId,
                )
                setImportText("")
                setImportMessage(
                  translate("decks:collection.importedSummary", { imported, skipped }),
                )
              }}
            />
            <Button
              testID="collection-export-copy"
              tx="decks:collection.exportCopy"
              onPress={() => {
                void Clipboard.setStringAsync(exportCollectionCsv(collectionEntries)).then(() => {
                  setImportMessage(translate("decks:collection.exportCopied"))
                })
              }}
            />
          </View>
        </DialogCard>
      ) : null}

      {addCardOpen ? (
        <DialogCard
          visible
          onClose={() => setAddCardOpen(false)}
          backdropAccessibilityLabel={translate("common:close")}
        >
          <Text preset="subheading" tx="decks:collection.addCard" />
          <TextField
            testID="collection-add-card-input"
            value={addCardQuery}
            onChangeText={setAddCardQuery}
            placeholderTx="decks:collection.searchCatalogPlaceholder"
            autoCorrect={false}
          />
          <View style={$dialogButtons}>
            {quickAddMatches.map((printing) => (
              <Button
                key={printing.printingId}
                text={joinParts([
                  printing.name,
                  printing.setCode.toUpperCase(),
                  `#${printing.collectorNumber}`,
                ])}
                onPress={() => {
                  addCollectionCard({
                    game,
                    cardId: printing.cardId,
                    printingId: printing.printingId,
                    name: printing.name,
                    setCode: printing.setCode,
                    collectorNumber: printing.collectorNumber,
                    binderId: selectedBinderId === "all" ? undefined : selectedBinderId,
                    imageUrl: printing.imageUrl,
                    smallImageUrl: printing.smallImageUrl,
                  })
                  setAddCardQuery("")
                  setAddCardOpen(false)
                }}
              />
            ))}
          </View>
        </DialogCard>
      ) : null}

      {editingEntry ? (
        <PrintingPickerSheet
          visible
          game={editingEntry.game}
          cardName={editingEntry.name}
          cardId={editingEntry.cardId}
          selectedPrintingId={editingEntry.printingId}
          initialFinish={
            (editingEntry.finish === "foil" || editingEntry.finish === "etched"
              ? editingEntry.finish
              : "nonfoil") as CardFinish
          }
          initialCondition={editingEntry.condition as CardCondition}
          onPick={({ printing, finish, condition }) => {
            updateCollectionEntry(editingEntry.id, {
              printingId: printing.printingId,
              setCode: printing.setCode,
              collectorNumber: printing.collectorNumber,
              finish,
              condition,
              imageUrl: printing.imageUrl,
              smallImageUrl: printing.smallImageUrl,
            })
            setEditingEntry(undefined)
          }}
          onClose={() => setEditingEntry(undefined)}
        />
      ) : null}

      {scanningSession ? (
        <CardScanner
          game={game}
          nameIndex={nameIndex}
          singleton={false}
          copiesInDeck={() => 0}
          addCards={async (names) => names.map(() => ({}))}
          onScanPrinting={(scan) => handleScanIntoSession(scanningSession, scan)}
          sessionTotalCents={scanningTotalCents}
          onClose={() => {
            const finished = scanningSession
            setScanningSession(undefined)
            setActiveScanSession(finished)
          }}
        />
      ) : null}

      {activeScanSession ? (
        <ScanSessionView
          visible
          session={activeScanSession}
          onScanMore={() => {
            const target = activeScanSession
            setActiveScanSession(undefined)
            setScanningSession(target)
          }}
          onClose={() => setActiveScanSession(undefined)}
        />
      ) : null}

      <TradeCalculatorModal visible={tradeOpen} game={game} onClose={() => setTradeOpen(false)} />
    </View>
  )
}

const $flex1: ViewStyle = { flex: 1 }
const $summaryBox: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingBottom: spacing.sm,
})
const $summaryHeader: ViewStyle = { flexDirection: "row", alignItems: "center" }
const $headerActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
  paddingBottom: spacing.sm,
})
const $chipRow: ViewStyle = { flexDirection: "row", gap: 8 }
const $binderChip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  borderRadius: radius.full,
  backgroundColor: colors.background,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $binderChipSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.tint,
})
const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingBottom: spacing.lg,
})
const $empty: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.xl,
  alignItems: "center",
})
const $rowCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  padding: spacing.sm,
  borderRadius: radius.md,
  backgroundColor: colors.background,
})
const $cardLead: ViewStyle = { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }
const $thumb: ImageStyle = { width: 40, height: 56 }
const $rowActions: ViewStyle = { alignItems: "flex-end", gap: 6 }
const $qtyRow: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 6 }
const $linkRow: ViewStyle = { flexDirection: "row", gap: 10 }
const $multiline: ViewStyle = { minHeight: 100 }
const $dialogButtons: ViewStyle = { gap: 8 }
