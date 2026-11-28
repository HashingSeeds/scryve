import { useMemo, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"
import * as Clipboard from "expo-clipboard"

import { Button } from "@/components/Button"
import { DeckActionsSheet, type DeckAction } from "@/components/DeckActionsSheet"
import { DialogCard } from "@/components/DialogCard"
import { HeaderIcon } from "@/components/Header"
import { Icon } from "@/components/Icon"
import { Tabs } from "@/components/Tabs"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { CardScanner, type ScannedPrintingPayload } from "@/features/decks/CardScanner"
import {
  CardSearch,
  type CardSearchCollection,
  type SearchCard,
} from "@/features/decks/CardSearchScreen"
import { useCardNameIndex } from "@/features/decks/useCardNameIndex"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { playSystemShortLabel, type PlaySystemId } from "@/features/game/playSystems"
import { VISIBLE_SYSTEM_IDS } from "@/features/game/systemVisibility"
import type { BackAction } from "@/features/game/useBackToBoard"
import { formatCurrency, joinParts } from "@/i18n/format"
import { translate, translateForStorage } from "@/i18n/translate"
import { catalogDb } from "@/storage/catalogDb"
import { localCardDb } from "@/storage/localDb"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import {
  lookupPrintingPrice,
  normalizePrintingName,
  useCatalogSync,
  valueCollectionEntries,
} from "./catalogSync"
import { CollectionEntryRow } from "./CollectionEntryRow"
import { exportCollectionCsv, importCollectionText } from "./collectionImportExport"
import {
  addCollectionCard,
  createBinder,
  deleteBinderKeepingCards,
  getCollectionEntry,
  listBinders,
  listCollectionEntries,
  moveBinderEntries,
  updateCollectionEntry,
  useCollectionRevision,
  valuedCollection,
  type StoredBinder,
  type StoredCollectionEntry,
} from "./collectionStore"
import { PrintingPickerSheet } from "./PrintingPickerSheet"
import { TradeCalculatorModal } from "./TradeCalculatorModal"
import type { CardCondition, CardFinish } from "../../../convex/lib/cardPricing"

type SortMode = "value" | "name" | "recent"
const SORTS = [
  { id: "value", tx: "decks:collection.sortValue" },
  { id: "name", tx: "decks:collection.sortName" },
  { id: "recent", tx: "decks:collection.sortRecent" },
] as const satisfies readonly { id: SortMode; tx: string }[]

const ALL = "all"

type Menu = { kind: "sort" } | { kind: "game" } | { kind: "actions"; openFilters?: () => void }
type Dialog = "newBinder" | "importExport" | "move"

export function CardsCollection({
  game,
  format,
  back,
  onGameChange,
  onOpenRules,
}: {
  game: PlaySystemId
  format: string
  back: BackAction
  onGameChange: (game: PlaySystemId) => void
  onOpenRules?: (options?: { query?: string; rule?: string }) => void
}) {
  const { themed, theme } = useAppTheme()
  const [deviceId] = useState(() => new LocalGameRepository().getDeviceId())
  const liveRevision = useCollectionRevision()
  const sync = useCatalogSync(game, true)

  const [selectedScope, setSelectedScope] = useState<string>(ALL)
  const [sort, setSort] = useState<SortMode>("value")
  const [menu, setMenu] = useState<Menu>()
  const afterMenu = useRef<() => void>(undefined)
  const [dialog, setDialog] = useState<Dialog>()
  const [newBinderName, setNewBinderName] = useState("")
  const [importText, setImportText] = useState("")
  const [importMessage, setImportMessage] = useState<string>()
  const [tradeOpen, setTradeOpen] = useState(false)
  const [scanningSession, setScanningSession] = useState<StoredBinder>()
  const scanEntryIdByScanId = useRef(new Map<number, string>())
  const [editingEntry, setEditingEntry] = useState<StoredCollectionEntry>()

  // why: the list stays mounted under the scanner; following each scan's revision re-listed and re-valued the whole collection behind it.
  const [listRevision, setListRevision] = useState(liveRevision)
  if (!scanningSession && listRevision !== liveRevision) setListRevision(liveRevision)
  const revision = scanningSession ? listRevision : liveRevision

  const scanGame = scanningSession?.game ?? game
  const nameIndex = useCardNameIndex(scanGame, deviceId, Boolean(scanningSession))

  const scopes = useMemo(() => {
    void revision
    const inGame = (binder: StoredBinder) => !binder.game || binder.game === game
    return [...listBinders("binder").filter(inGame), ...listBinders("scan_session").filter(inGame)]
  }, [revision, game])
  const scope = scopes.find((binder) => binder.id === selectedScope)
  const scopeId = scope?.id ?? ALL

  const allValued = useMemo(() => {
    void revision
    void sync.version
    return valuedCollection(game)
  }, [revision, sync.version, game])

  const entries = useMemo(() => {
    const items = scope
      ? allValued.filter(({ entry }) => entry.binderId === scope.id)
      : [...allValued]
    if (sort === "name") return items.sort((a, b) => a.entry.name.localeCompare(b.entry.name))
    if (sort === "recent") return items.sort((a, b) => b.entry.updatedAt - a.entry.updatedAt)
    return items.sort(
      (a, b) =>
        b.retailCents * b.entry.quantity - a.retailCents * a.entry.quantity ||
        a.entry.name.localeCompare(b.entry.name),
    )
  }, [allValued, scope, sort])

  const totals = useMemo(() => {
    let cards = 0
    let retailCents = 0
    let buylistCents = 0
    for (const item of entries) {
      cards += item.entry.quantity
      retailCents += item.retailCents * item.entry.quantity
      buylistCents += item.buylistCents * item.entry.quantity
    }
    return { cards, retailCents, buylistCents }
  }, [entries])

  const scanningTotalCents = useMemo(() => {
    if (!scanningSession) return undefined
    void liveRevision
    void sync.version
    const sessionEntries = listCollectionEntries({ binderId: scanningSession.id })
    return valueCollectionEntries(scanGame, sessionEntries).totals.retailCents
  }, [scanningSession, liveRevision, sync.version, scanGame])

  function closeMenu(then?: () => void) {
    afterMenu.current = then
    setMenu(undefined)
  }

  function openDialog(next: Dialog) {
    setImportMessage(undefined)
    setDialog(next)
  }

  function startNewScanSession() {
    setScanningSession(
      createBinder({
        kind: "scan_session",
        name: translateForStorage("decks:collection.scanSessionName", { date: new Date() }),
        game,
      }),
    )
  }

  function finishScanning(session: StoredBinder) {
    scanEntryIdByScanId.current.clear()
    setScanningSession(undefined)
    if (listCollectionEntries({ binderId: session.id }).length === 0) {
      deleteBinderKeepingCards(session.id)
    } else {
      setSelectedScope(session.id)
    }
  }

  function scanIntoSession(session: StoredBinder, scan: ScannedPrintingPayload) {
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

  function updateScannedPrinting(
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

  function catalogPrinting(card: SearchCard) {
    const printingId = "scryfallId" in card ? card.scryfallId : card.printingId
    return (
      (printingId ? catalogDb.getPrinting(game, printingId) : undefined) ??
      catalogDb.findPrintingsByName(game, normalizePrintingName(card.name))[0]
    )
  }

  function addFromCatalog(card: SearchCard) {
    const printing = catalogPrinting(card)
    const key = normalizePrintingName(card.name)
    addCollectionCard({
      game,
      cardId: printing?.cardId ?? ("oracleId" in card ? card.oracleId : card.cardId),
      printingId:
        printing?.printingId ??
        ("scryfallId" in card ? card.scryfallId : card.printingId) ??
        `name:${key}`,
      name: printing?.name ?? card.name,
      setCode: printing?.setCode ?? card.setCode ?? "",
      collectorNumber: printing?.collectorNumber ?? card.collectorNumber ?? "",
      binderId: scope?.id,
      imageUrl: printing?.imageUrl ?? card.imageUrl,
      smallImageUrl: printing?.smallImageUrl ?? card.smallImageUrl,
    })
  }

  function moveSession(session: StoredBinder, target: StoredBinder | undefined) {
    moveBinderEntries(session.id, target?.id)
    deleteBinderKeepingCards(session.id)
    setSelectedScope(target?.id ?? ALL)
    setDialog(undefined)
  }

  const sortLabel = translate(SORTS.find((option) => option.id === sort)?.tx ?? SORTS[0].tx)
  const sortActions: DeckAction[] = SORTS.map((option) => ({
    id: `sort-${option.id}`,
    label: translate(option.tx),
    selected: option.id === sort,
    onPress: () => {
      setSort(option.id)
      closeMenu()
    },
  }))
  const gameActions: DeckAction[] = VISIBLE_SYSTEM_IDS.map((id) => ({
    id: `game-${id}`,
    label: playSystemShortLabel(id),
    selected: id === game,
    onPress: () => closeMenu(() => onGameChange(id)),
  }))
  const scopeActions = (openFilters?: () => void): DeckAction[] => [
    {
      id: "game",
      label: translate("decks:shelf.system"),
      detail: playSystemShortLabel(game),
      onPress: () => closeMenu(() => setMenu({ kind: "game" })),
    },
    ...(openFilters
      ? [
          {
            id: "filters",
            label: translate("decks:filters.label"),
            onPress: () => closeMenu(openFilters),
          },
        ]
      : []),
    {
      id: "import-export",
      label: translate("decks:collection.importExport"),
      onPress: () => closeMenu(() => openDialog("importExport")),
    },
    {
      id: "new-binder",
      label: translate("decks:collection.newBinder"),
      onPress: () => closeMenu(() => openDialog("newBinder")),
    },
    {
      id: "trade",
      label: translate("decks:collection.trade"),
      onPress: () => closeMenu(() => setTradeOpen(true)),
    },
    ...(scope?.kind === "scan_session" && entries.length > 0
      ? [
          {
            id: "move",
            label: translate("decks:collection.moveToBinder"),
            onPress: () => closeMenu(() => openDialog("move")),
          },
        ]
      : []),
    ...(scope
      ? [
          {
            id: "delete-binder",
            label: translate("decks:collection.deleteBinder"),
            destructive: true,
            onPress: () =>
              closeMenu(() => {
                deleteBinderKeepingCards(scope.id)
                setSelectedScope(ALL)
              }),
          },
        ]
      : []),
  ]

  const layer: CardSearchCollection = {
    actions: (openFilters) => (
      <>
        <HeaderIcon
          testID="collection-scan-button"
          icon="camera"
          label={translate("decks:collection.newScanSession")}
          onPress={startNewScanSession}
        />
        <HeaderIcon
          testID="collection-actions-button"
          icon="more"
          label={translate("decks:collection.actions")}
          onPress={() => setMenu({ kind: "actions", openFilters })}
        />
      </>
    ),
    sort: (
      <TouchableOpacity
        testID="collection-sort-button"
        accessibilityRole="button"
        accessibilityLabel={translate("decks:collection.sortBy", { sort: sortLabel })}
        style={themed($sortButton)}
        onPress={() => setMenu({ kind: "sort" })}
      >
        <Text size="sm" weight="medium" numberOfLines={1} text={sortLabel} />
        <Icon icon="chevronDown" size={14} color={theme.colors.textDim} />
      </TouchableOpacity>
    ),
    scopes: (
      <Tabs
        testID="collection-scopes"
        accessibilityLabel={translate("decks:collection.binders")}
        tabs={[
          { id: ALL, label: translate("decks:collection.allCards") },
          ...scopes.map((binder) => ({ id: binder.id, label: binder.name })),
        ]}
        selectedId={scopeId}
        onSelect={setSelectedScope}
        scrolls
      />
    ),
    summary: (
      <>
        <View style={themed($summary)}>
          <View style={$summaryCopy}>
            <Text
              testID="collection-summary"
              weight="bold"
              numberOfLines={1}
              text={joinParts([
                translate("decks:cardCount", { count: totals.cards }),
                formatCurrency(totals.retailCents, "USD"),
              ])}
            />
            {totals.buylistCents > 0 || sync.syncing ? (
              <Text
                size="meta"
                tone="dim"
                numberOfLines={1}
                text={joinParts([
                  totals.buylistCents > 0
                    ? translate("decks:collection.buylistTotal", {
                        total: formatCurrency(totals.buylistCents, "USD"),
                      })
                    : "",
                  sync.syncing ? translate("decks:collection.syncingPrices") : "",
                ])}
              />
            ) : null}
          </View>
          {scope?.kind === "scan_session" ? (
            <Button
              testID="collection-scan-more"
              preset="primary"
              tx="decks:collection.scanMore"
              style={$scanMore}
              onPress={() => setScanningSession(scope)}
            />
          ) : null}
        </View>
        {entries.length === 0 ? (
          <Text size="sm" tone="dim" tx="decks:collection.emptyCollection" />
        ) : null}
      </>
    ),
    entries,
    renderEntry: ({ entry, retailCents }) => (
      <CollectionEntryRow
        entry={entry}
        retailCents={retailCents * entry.quantity}
        onEdit={() => setEditingEntry(entry)}
      />
    ),
    catalogDetail: (card) => {
      const printing = catalogPrinting(card)
      if (!printing) return undefined
      const retailCents = lookupPrintingPrice(
        game,
        printing.printingId,
        "nonfoil",
        "NM",
      ).retailCents
      return joinParts([
        printing.setCode.toUpperCase(),
        printing.collectorNumber ? `#${printing.collectorNumber}` : "",
        retailCents ? formatCurrency(retailCents, "USD") : "",
      ])
    },
    catalogAction: (card) => (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={translate("decks:collection.addCard", { card: card.name })}
        style={themed($addButton)}
        onPress={() => addFromCatalog(card)}
      >
        <Icon icon="plus" size={20} color={theme.colors.tint} />
      </TouchableOpacity>
    ),
  }

  return (
    <>
      <CardSearch
        game={game}
        format={format}
        presentation="screen"
        back={back}
        collection={layer}
        onGameChange={onGameChange}
        onOpenRules={onOpenRules}
        onClose={back.onPress}
      />

      <DeckActionsSheet
        testID="collection-menu"
        visible={menu !== undefined}
        actions={
          menu?.kind === "sort"
            ? sortActions
            : menu?.kind === "game"
              ? gameActions
              : scopeActions(menu?.openFilters)
        }
        onClose={() => closeMenu()}
        onDismissed={() => {
          const then = afterMenu.current
          afterMenu.current = undefined
          then?.()
        }}
      />

      {dialog === "newBinder" ? (
        <DialogCard
          visible
          onClose={() => setDialog(undefined)}
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
              setDialog(undefined)
              setSelectedScope(created.id)
            }}
          />
        </DialogCard>
      ) : null}

      {dialog === "importExport" ? (
        <DialogCard
          visible
          onClose={() => setDialog(undefined)}
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
          {importMessage ? <Text size="xs" style={themed($tint)} text={importMessage} /> : null}
          <View style={themed($dialogButtons)}>
            <Button
              testID="collection-import-submit"
              preset="primary"
              tx="decks:collection.importAction"
              disabled={!importText.trim()}
              onPress={() => {
                const { imported, skipped } = importCollectionText(importText, game, scope?.id)
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
                  exportCollectionCsv(entries.map(({ entry }) => entry)),
                ).then(() => setImportMessage(translate("decks:collection.exportCopied")))
              }}
            />
          </View>
        </DialogCard>
      ) : null}

      {dialog === "move" && scope ? (
        <DialogCard
          visible
          onClose={() => setDialog(undefined)}
          backdropAccessibilityLabel={translate("common:close")}
        >
          <Text preset="subheading" tx="decks:collection.moveToBinder" />
          <View style={themed($dialogButtons)}>
            <Button
              tx="decks:collection.mainLibrary"
              onPress={() => moveSession(scope, undefined)}
            />
            {scopes
              .filter((binder) => binder.kind === "binder")
              .map((binder) => (
                <Button
                  key={binder.id}
                  text={binder.name}
                  onPress={() => moveSession(scope, binder)}
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
            editingEntry.finish === "foil" || editingEntry.finish === "etched"
              ? editingEntry.finish
              : "nonfoil"
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
          game={scanGame}
          nameIndex={nameIndex}
          singleton={false}
          copiesInDeck={() => 0}
          addCards={async (names) => names.map(() => ({}))}
          onScanPrinting={(scan) => scanIntoSession(scanningSession, scan)}
          onUpdatePrinting={(scanId, update) =>
            updateScannedPrinting(scanningSession, scanId, update)
          }
          sessionTotalCents={scanningTotalCents}
          initialSetLock={scanningSession.defaultSetCode}
          onClose={() => finishScanning(scanningSession)}
        />
      ) : null}

      <TradeCalculatorModal visible={tradeOpen} game={game} onClose={() => setTradeOpen(false)} />
    </>
  )
}

const $sortButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
  paddingStart: spacing.xs,
})
const $summary: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  minHeight: 44,
})
const $summaryCopy: ViewStyle = { flex: 1 }
const $scanMore: ViewStyle = { minHeight: 40 }
const $addButton: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 40,
  height: 40,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderColor: colors.separator,
  borderRadius: radius.sm,
})
const $tint: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $multiline: ViewStyle = { minHeight: 100 }
const $dialogButtons: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
