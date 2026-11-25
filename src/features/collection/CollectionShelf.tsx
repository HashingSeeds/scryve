import { useMemo, useRef, useState } from "react"
import { FlatList, ScrollView, TouchableOpacity, View } from "react-native"
import type { ViewStyle } from "react-native"
import * as Clipboard from "expo-clipboard"

import { Button } from "@/components/Button"
import { DialogCard } from "@/components/DialogCard"
import { $floatingNavigationClearance } from "@/components/FloatingAppNavigation"
import { SegmentedControl } from "@/components/SegmentedControl"
import { $sheetScroll, $sheetScrollContent } from "@/components/sheetStyles"
import { Tabs } from "@/components/Tabs"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { TextField } from "@/components/TextField"
import { searchCardNames } from "@/features/decks/cardNameMatch"
import { CardScanner, type ScannedPrintingPayload } from "@/features/decks/CardScanner"
import { useCardNameIndex } from "@/features/decks/useCardNameIndex"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { formatCurrency, joinParts } from "@/i18n/format"
import { translate, translateForStorage } from "@/i18n/translate"
import { catalogDb } from "@/storage/catalogDb"
import { localCardDb } from "@/storage/localDb"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { normalizePrintingName, useCatalogSync, valueCollectionEntries } from "./catalogSync"
import { CollectionEntryRow } from "./CollectionEntryRow"
import { exportCollectionCsv, importCollectionText } from "./collectionImportExport"
import {
  addCollectionCard,
  createBinder,
  deleteBinderKeepingCards,
  getCollectionEntry,
  listBinders,
  listCollectionEntries,
  updateCollectionEntry,
  useCollectionRevision,
  valuedCollection,
  type StoredBinder,
  type StoredCollectionEntry,
} from "./collectionStore"
import { PrintingPickerSheet } from "./PrintingPickerSheet"
import { ScanSessionView } from "./ScanSessionView"
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
  const liveRevision = useCollectionRevision()
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
  const scanEntryIdByScanId = useRef(new Map<number, string>())
  const [editingEntry, setEditingEntry] = useState<StoredCollectionEntry>()
  const [addCardOpen, setAddCardOpen] = useState(false)
  const [addCardQuery, setAddCardQuery] = useState("")
  const [addCardName, setAddCardName] = useState<string>()

  // why: the shelf stays mounted under the scanner and session view; following each scan's revision re-listed and re-valued the whole collection behind them.
  const scanOpen = Boolean(scanningSession || activeScanSession)
  const [shelfRevision, setShelfRevision] = useState(liveRevision)
  if (!scanOpen && shelfRevision !== liveRevision) setShelfRevision(liveRevision)
  const revision = scanOpen ? shelfRevision : liveRevision

  const activeScanGame = scanningSession?.game ?? game
  const nameIndex = useCardNameIndex(
    activeScanGame,
    deviceId,
    Boolean(scanningSession) || addCardOpen,
  )

  const binders = useMemo(() => {
    void revision
    return listBinders("binder").filter((binder) => !binder.game || binder.game === game)
  }, [revision, game])

  const scanSessions = useMemo(() => {
    void revision
    return listBinders("scan_session").filter((session) => !session.game || session.game === game)
  }, [revision, game])

  const activeBinderId =
    selectedBinderId === "all" || binders.some((binder) => binder.id === selectedBinderId)
      ? selectedBinderId
      : "all"

  const scanSessionIds = useMemo(
    () => new Set(scanSessions.map((session) => session.id)),
    [scanSessions],
  )

  const allValued = useMemo(() => {
    void revision
    void sync.version
    if (mode === "scans" && scanSessions.length === 0) return []
    return valuedCollection(game)
  }, [revision, sync.version, game, mode, scanSessions])

  const valuedEntries = useMemo(() => {
    if (mode === "scans") return []
    return allValued.filter(({ entry }) => {
      if (activeBinderId === "all") return !entry.binderId || !scanSessionIds.has(entry.binderId)
      return entry.binderId === activeBinderId
    })
  }, [mode, allValued, activeBinderId, scanSessionIds])

  const pricedEntries = useMemo(() => {
    if (mode === "scans") return []
    const term = search.trim().toLowerCase()
    const items = term
      ? valuedEntries.filter(
          ({ entry }) => entry.name.toLowerCase().includes(term) || entry.setCode.includes(term),
        )
      : [...valuedEntries]
    if (sort === "name") return items.sort((a, b) => a.entry.name.localeCompare(b.entry.name))
    if (sort === "recent") return items.sort((a, b) => b.entry.updatedAt - a.entry.updatedAt)
    return items.sort(
      (a, b) =>
        b.retailCents * b.entry.quantity - a.retailCents * a.entry.quantity ||
        a.entry.name.localeCompare(b.entry.name),
    )
  }, [mode, valuedEntries, search, sort])

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

  const scanSessionSummaries = useMemo(() => {
    const summaryById = new Map<string, { count: number; retailCents: number }>()
    if (mode !== "scans") return summaryById
    for (const { entry, retailCents } of allValued) {
      if (!entry.binderId || !scanSessionIds.has(entry.binderId)) continue
      const summary = summaryById.get(entry.binderId) ?? { count: 0, retailCents: 0 }
      summary.count += entry.quantity
      summary.retailCents += retailCents * entry.quantity
      summaryById.set(entry.binderId, summary)
    }
    return summaryById
  }, [mode, allValued, scanSessionIds])

  const addCardNames = useMemo(() => {
    void sync.version
    if (addCardQuery.trim().length < 2) return []
    const fuzzy = nameIndex ? searchCardNames(nameIndex, addCardQuery, ADD_CARD_LIMIT) : []
    const exact = catalogDb.findPrintingsByName(game, normalizePrintingName(addCardQuery))[0]?.name
    return exact && !fuzzy.includes(exact) ? [exact, ...fuzzy].slice(0, ADD_CARD_LIMIT) : fuzzy
  }, [nameIndex, addCardQuery, game, sync.version])

  const addCardPrintings = useMemo(() => {
    void sync.version
    return addCardName
      ? catalogDb.findPrintingsByName(game, normalizePrintingName(addCardName))
      : []
  }, [addCardName, game, sync.version])

  function closeAddCard() {
    setAddCardOpen(false)
    setAddCardQuery("")
    setAddCardName(undefined)
  }

  function finishScanning(session: StoredBinder) {
    scanEntryIdByScanId.current.clear()
    setScanningSession(undefined)
    if (listCollectionEntries({ binderId: session.id }).length === 0) {
      deleteBinderKeepingCards(session.id)
    } else {
      setActiveScanSession(session)
    }
  }

  function startNewScanSession() {
    const session = createBinder({
      kind: "scan_session",
      name: translateForStorage("decks:collection.scanSessionName", {
        date: new Date(),
      }),
      game,
    })
    setScanningSession(session)
  }

  function handleScanIntoSession(session: StoredBinder, scan: ScannedPrintingPayload) {
    const sessionGame = session.game ?? game
    const printing = scan.printingId
      ? catalogDb.getPrinting(sessionGame, scan.printingId)
      : catalogDb.findPrintingsByName(sessionGame, normalizePrintingName(scan.name))[0]
    const saved = addCollectionCard({
      game: sessionGame,
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
    scanEntryIdByScanId.current.set(scan.id, saved.id)
  }

  function handleUpdateScannedPrinting(
    session: StoredBinder,
    scanId: number,
    update: {
      name: string
      printingId: string
      setCode: string
      collectorNumber: string
      finish: CardFinish
      condition: CardCondition
      imageUrl?: string
      smallImageUrl?: string
    },
  ) {
    const entryId = scanEntryIdByScanId.current.get(scanId)
    if (!entryId) return false
    const sessionGame = session.game ?? game
    const current = getCollectionEntry(entryId)
    if (!current || current.binderId !== session.id) return false
    const printing = catalogDb.getPrinting(sessionGame, update.printingId)
    const nextCardId = printing?.cardId ?? current.cardId
    let nextId: string | undefined
    localCardDb.transaction(() => {
      if (current.quantity > 1) {
        updateCollectionEntry(current.id, { quantity: current.quantity - 1 })
        const split = addCollectionCard({
          game: sessionGame,
          cardId: nextCardId,
          printingId: update.printingId,
          name: printing?.name ?? update.name,
          setCode: update.setCode,
          collectorNumber: update.collectorNumber,
          finish: update.finish,
          condition: update.condition,
          language: current.language,
          quantity: 1,
          binderId: session.id,
          imageUrl: update.imageUrl ?? printing?.imageUrl ?? current.imageUrl,
          smallImageUrl: update.smallImageUrl ?? printing?.smallImageUrl ?? current.smallImageUrl,
        })
        nextId = split.id
      } else {
        const updated = updateCollectionEntry(current.id, {
          cardId: nextCardId,
          printingId: update.printingId,
          setCode: update.setCode,
          collectorNumber: update.collectorNumber,
          finish: update.finish,
          condition: update.condition,
          imageUrl: update.imageUrl ?? printing?.imageUrl ?? current.imageUrl,
          smallImageUrl: update.smallImageUrl ?? printing?.smallImageUrl ?? current.smallImageUrl,
        })
        nextId = updated?.id
      }
    })
    if (nextId) scanEntryIdByScanId.current.set(scanId, nextId)
    return Boolean(nextId)
  }

  const scanningTotalCents = useMemo(() => {
    if (!scanningSession) return undefined
    void liveRevision
    void sync.version
    const sessionGame = scanningSession.game ?? game
    const entries = listCollectionEntries({ binderId: scanningSession.id })
    return valueCollectionEntries(sessionGame, entries).totals.retailCents
  }, [scanningSession, liveRevision, sync.version, game])

  if (mode === "scans") {
    return (
      <View style={$flex1}>
        <FlatList
          testID="scan-sessions-list"
          data={scanSessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={themed($floatingNavigationClearance)}
          ListHeaderComponent={
            <View style={themed([$header, $actions])}>
              <Button
                testID="new-scan-session-button"
                preset="primary"
                tx="decks:collection.newScanSession"
                style={$compactButton}
                onPress={startNewScanSession}
              />
              <Button
                testID="scans-trade-button"
                tx="decks:collection.trade"
                style={$compactButton}
                onPress={() => setTradeOpen(true)}
              />
            </View>
          }
          ListEmptyComponent={
            <View style={themed($empty)}>
              <Text size="sm" tone="dim" tx="decks:collection.emptyScans" />
            </View>
          }
          renderItem={({ item }) => {
            const summary = scanSessionSummaries.get(item.id) ?? { count: 0, retailCents: 0 }
            return (
              <View style={themed($row)}>
                <TouchableOpacity
                  testID={`scan-session-row-${item.id}`}
                  accessibilityRole="button"
                  style={themed($rowLead)}
                  onPress={() => setActiveScanSession(item)}
                >
                  <Text size="sm" weight="medium" numberOfLines={1} text={item.name} />
                  <Text
                    size="meta"
                    tone="dim"
                    numberOfLines={1}
                    text={joinParts([
                      translate("decks:cardCount", { count: summary.count }),
                      formatCurrency(summary.retailCents, "USD"),
                    ])}
                  />
                </TouchableOpacity>
                <TextAction
                  tx="decks:collection.scanMore"
                  onPress={() => setScanningSession(item)}
                />
              </View>
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
            game={activeScanGame}
            nameIndex={nameIndex}
            singleton={false}
            copiesInDeck={() => 0}
            addCards={async (names) => names.map(() => ({}))}
            onScanPrinting={(scan) => handleScanIntoSession(scanningSession, scan)}
            onUpdatePrinting={(scanId, update) =>
              handleUpdateScannedPrinting(scanningSession, scanId, update)
            }
            sessionTotalCents={scanningTotalCents}
            initialSetLock={scanningSession.defaultSetCode}
            onClose={() => finishScanning(scanningSession)}
          />
        ) : null}
        <TradeCalculatorModal visible={tradeOpen} game={game} onClose={() => setTradeOpen(false)} />
      </View>
    )
  }

  return (
    <View style={$flex1}>
      <FlatList
        testID="collection-entries-list"
        data={pricedEntries}
        // why: the default 21-screen window rendered every row of a 1,000-card collection within seconds of opening, and opening the scanner re-rendered them all.
        windowSize={5}
        keyExtractor={(item) => item.entry.id}
        contentContainerStyle={themed($floatingNavigationClearance)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={themed($header)}>
            <View>
              <Text weight="bold" text={translate("decks:cardCount", { count: totals.cards })} />
              <Text
                size="meta"
                tone="dim"
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
            <View style={themed($actions)}>
              <Button
                testID="collection-scan-button"
                preset="primary"
                tx="decks:collection.newScanSession"
                style={$compactButton}
                onPress={startNewScanSession}
              />
              <Button
                testID="collection-add-card-button"
                tx="decks:collection.addCard"
                style={$compactButton}
                onPress={() => setAddCardOpen(true)}
              />
              <Button
                testID="collection-trade-button"
                tx="decks:collection.trade"
                style={$compactButton}
                onPress={() => setTradeOpen(true)}
              />
              <Button
                testID="collection-import-button"
                tx="decks:collection.importExport"
                style={$compactButton}
                onPress={() => {
                  setImportMessage(undefined)
                  setImportOpen(true)
                }}
              />
            </View>
            <Tabs
              testID="binder-filter"
              accessibilityLabel={translate("decks:collection.binders")}
              tabs={[
                { id: "all", label: translate("decks:collection.allCards") },
                ...binders.map((binder) => ({ id: binder.id, label: binder.name })),
              ]}
              selectedId={activeBinderId}
              onSelect={setSelectedBinderId}
              trailing={
                <TextAction
                  testID="collection-new-binder-button"
                  tx="decks:collection.newBinder"
                  onPress={() => setNewBinderOpen(true)}
                />
              }
            />
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
        }
        ListEmptyComponent={
          <View style={themed($empty)}>
            <Text size="sm" tone="dim" tx="decks:collection.emptyCollection" />
          </View>
        }
        renderItem={({ item: { entry, retailCents, buylistCents } }) => (
          <CollectionEntryRow
            entry={entry}
            retailCents={retailCents * entry.quantity}
            buylistCents={buylistCents * entry.quantity}
            onEdit={() => setEditingEntry(entry)}
          />
        )}
        ListFooterComponent={
          activeBinderId !== "all" ? (
            <Button
              testID="delete-binder-button"
              tx="decks:collection.deleteBinder"
              style={themed($deleteBinder)}
              onPress={() => {
                deleteBinderKeepingCards(activeBinderId)
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
                  activeBinderId === "all" ? undefined : activeBinderId,
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
                void Clipboard.setStringAsync(
                  exportCollectionCsv(valuedEntries.map(({ entry }) => entry)),
                ).then(() => {
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
          onClose={closeAddCard}
          backdropAccessibilityLabel={translate("common:close")}
        >
          <Text preset="subheading" tx="decks:collection.addCard" />
          <TextField
            testID="collection-add-card-input"
            value={addCardQuery}
            onChangeText={(query) => {
              setAddCardQuery(query)
              setAddCardName(undefined)
            }}
            placeholderTx="decks:collection.searchCatalogPlaceholder"
            autoCorrect={false}
          />
          {addCardName ? <Text size="sm" weight="medium" text={addCardName} /> : null}
          <ScrollView
            style={themed($sheetScroll)}
            contentContainerStyle={themed($sheetScrollContent)}
            keyboardShouldPersistTaps="handled"
          >
            {addCardName ? (
              addCardPrintings.length ? (
                addCardPrintings.map((printing) => (
                  <TouchableOpacity
                    key={printing.printingId}
                    accessibilityRole="button"
                    style={themed($pickRow)}
                    onPress={() => {
                      addCollectionCard({
                        game,
                        cardId: printing.cardId,
                        printingId: printing.printingId,
                        name: printing.name,
                        setCode: printing.setCode,
                        collectorNumber: printing.collectorNumber,
                        binderId: activeBinderId === "all" ? undefined : activeBinderId,
                        imageUrl: printing.imageUrl,
                        smallImageUrl: printing.smallImageUrl,
                      })
                      closeAddCard()
                    }}
                  >
                    <Text
                      size="sm"
                      numberOfLines={1}
                      text={joinParts([
                        printing.setCode.toUpperCase(),
                        `#${printing.collectorNumber}`,
                        printing.setName ?? "",
                      ])}
                    />
                  </TouchableOpacity>
                ))
              ) : (
                <Text size="sm" tone="dim" tx="decks:collection.noPrintings" />
              )
            ) : addCardNames.length ? (
              addCardNames.map((name) => (
                <TouchableOpacity
                  key={name}
                  accessibilityRole="button"
                  style={themed($pickRow)}
                  onPress={() => setAddCardName(name)}
                >
                  <Text size="sm" weight="medium" numberOfLines={1} text={name} />
                </TouchableOpacity>
              ))
            ) : nameIndex && addCardQuery.trim().length >= 2 ? (
              <Text size="sm" tone="dim" tx="decks:cardSearch.noResults" />
            ) : null}
          </ScrollView>
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
              cardId: printing.cardId,
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
          game={activeScanGame}
          nameIndex={nameIndex}
          singleton={false}
          copiesInDeck={() => 0}
          addCards={async (names) => names.map(() => ({}))}
          onScanPrinting={(scan) => handleScanIntoSession(scanningSession, scan)}
          onUpdatePrinting={(scanId, update) =>
            handleUpdateScannedPrinting(scanningSession, scanId, update)
          }
          sessionTotalCents={scanningTotalCents}
          onClose={() => finishScanning(scanningSession)}
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

const ADD_CARD_LIMIT = 8

const $flex1: ViewStyle = { flex: 1 }
const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  paddingBottom: spacing.xs,
})
const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $compactButton: ViewStyle = { minHeight: 44 }
const $empty: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.xl,
  alignItems: "center",
})
const $row: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: 66,
  flexDirection: "row",
  alignItems: "center",
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $rowLead: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  gap: spacing.xxxs,
  paddingVertical: spacing.sm,
})
const $deleteBinder: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  marginTop: spacing.md,
})
const $pickRow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: 44,
  justifyContent: "center",
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $multiline: ViewStyle = { minHeight: 100 }
const $dialogButtons: ViewStyle = { gap: 8 }
