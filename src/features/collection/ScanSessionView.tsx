import { useMemo, useState } from "react"
import { FlatList, Linking, Modal, View } from "react-native"
import type { ViewStyle } from "react-native"

import { Button } from "@/components/Button"
import { DialogCard } from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { formatCurrency, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { lookupPrintingPrice } from "./catalogSync"
import { CollectionEntryRow } from "./CollectionEntryRow"
import {
  listBinders,
  listCollectionEntries,
  moveBinderEntries,
  updateCollectionEntry,
  useCollectionRevision,
  type StoredBinder,
  type StoredCollectionEntry,
} from "./collectionStore"
import { PrintingPickerSheet } from "./PrintingPickerSheet"
import { tcgplayerMassEntryUrl } from "./storeLinks"
import type { CardCondition, CardFinish } from "../../../convex/lib/cardPricing"

type SortMode = "recent" | "value" | "name"

export function ScanSessionView({
  visible,
  session,
  onScanMore,
  onClose,
}: {
  visible: boolean
  session: StoredBinder
  onScanMore: () => void
  onClose: () => void
}) {
  const { themed, theme } = useAppTheme()
  const revision = useCollectionRevision()
  const [sort, setSort] = useState<SortMode>("recent")
  const [editingPrinting, setEditingPrinting] = useState<StoredCollectionEntry>()
  const [moving, setMoving] = useState(false)
  const [movedMessage, setMovedMessage] = useState<string>()

  const entries = useMemo(() => {
    void revision
    return listCollectionEntries({ binderId: session.id })
  }, [revision, session.id])

  const pricedEntries = useMemo(() => {
    const items = entries.map((entry) => {
      const price = lookupPrintingPrice(entry.game, entry.printingId, entry.finish, entry.condition)
      return {
        entry,
        retailCents: price.retailCents ?? 0,
        buylistCents: price.buylistCents ?? 0,
      }
    })
    if (sort === "value") {
      return items.sort(
        (a, b) => b.retailCents - a.retailCents || a.entry.name.localeCompare(b.entry.name),
      )
    }
    if (sort === "name") {
      return items.sort((a, b) => a.entry.name.localeCompare(b.entry.name))
    }
    return items.sort((a, b) => b.entry.updatedAt - a.entry.updatedAt)
  }, [entries, sort])

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

  const binders = useMemo(() => {
    void revision
    return listBinders("binder").filter(
      (binder) => !binder.game || !session.game || binder.game === session.game,
    )
  }, [revision, session.game])

  function handleMove(targetBinderId: string | undefined) {
    const moved = moveBinderEntries(session.id, targetBinderId)
    setMoving(false)
    setMovedMessage(translate("decks:collection.movedToBinder", { count: moved }))
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen
        preset="fixed"
        safeAreaEdges={["bottom"]}
        backgroundColor={theme.colors.background}
        contentContainerStyle={$screen}
      >
        <Header
          titleTx="decks:collection.scanSession"
          leftTx="common:back"
          onLeftPress={onClose}
          rightTx="decks:collection.scanMore"
          onRightPress={onScanMore}
          backgroundColor={theme.colors.background}
        />
        <View style={themed($summaryBar)}>
          <View>
            <Text weight="bold" numberOfLines={1} text={session.name} />
            <Text
              size="meta"
              tone="dim"
              text={joinParts([
                translate("decks:cardCount", { count: totals.cards }),
                translate("decks:collection.retailTotal", {
                  total: formatCurrency(totals.retailCents, "USD"),
                }),
                totals.buylistCents > 0
                  ? translate("decks:collection.buylistTotal", {
                      total: formatCurrency(totals.buylistCents, "USD"),
                    })
                  : "",
              ])}
            />
          </View>
          <SegmentedControl
            segments={[
              { id: "recent", label: translate("decks:collection.sortRecent") },
              { id: "value", label: translate("decks:collection.sortValue") },
              { id: "name", label: translate("decks:collection.sortName") },
            ]}
            selectedId={sort}
            onSelect={(id) => setSort(id as SortMode)}
          />
          {movedMessage ? (
            <Text size="xs" style={{ color: theme.colors.tint }} text={movedMessage} />
          ) : null}
        </View>

        <FlatList
          testID="scan-session-list"
          data={pricedEntries}
          keyExtractor={(item) => item.entry.id}
          contentContainerStyle={themed($listContent)}
          ListEmptyComponent={<Text size="sm" tone="dim" tx="decks:collection.emptySession" />}
          renderItem={({ item: { entry, retailCents, buylistCents } }) => (
            <CollectionEntryRow
              entry={entry}
              retailCents={retailCents}
              buylistCents={buylistCents}
              onEdit={() => setEditingPrinting(entry)}
            />
          )}
        />

        {pricedEntries.length > 0 ? (
          <View style={themed($footer)}>
            <Button
              testID="scan-session-move"
              style={$footerButton}
              tx="decks:collection.moveToBinder"
              onPress={() => setMoving(true)}
            />
            <Button
              testID="scan-session-buy"
              style={$footerButton}
              preset="primary"
              tx="decks:collection.buyOnTcgplayer"
              onPress={() =>
                void Linking.openURL(
                  tcgplayerMassEntryUrl(
                    pricedEntries.map(({ entry }) => ({
                      name: entry.name,
                      setCode: entry.setCode,
                      quantity: entry.quantity,
                    })),
                  ),
                )
              }
            />
          </View>
        ) : null}
      </Screen>

      {editingPrinting ? (
        <PrintingPickerSheet
          visible
          game={editingPrinting.game}
          cardName={editingPrinting.name}
          cardId={editingPrinting.cardId}
          selectedPrintingId={editingPrinting.printingId}
          initialFinish={
            (editingPrinting.finish === "foil" || editingPrinting.finish === "etched"
              ? editingPrinting.finish
              : "nonfoil") as CardFinish
          }
          initialCondition={editingPrinting.condition as CardCondition}
          onPick={({ printing, finish, condition }) => {
            updateCollectionEntry(editingPrinting.id, {
              cardId: printing.cardId,
              printingId: printing.printingId,
              setCode: printing.setCode,
              collectorNumber: printing.collectorNumber,
              finish,
              condition,
              imageUrl: printing.imageUrl,
              smallImageUrl: printing.smallImageUrl,
            })
            setEditingPrinting(undefined)
          }}
          onClose={() => setEditingPrinting(undefined)}
        />
      ) : null}

      {moving ? (
        <DialogCard
          visible
          onClose={() => setMoving(false)}
          backdropAccessibilityLabel={translate("common:close")}
        >
          <Text preset="subheading" tx="decks:collection.moveToBinder" />
          <View style={$dialogList}>
            <Button tx="decks:collection.mainLibrary" onPress={() => handleMove(undefined)} />
            {binders.map((binder) => (
              <Button key={binder.id} text={binder.name} onPress={() => handleMove(binder.id)} />
            ))}
          </View>
        </DialogCard>
      ) : null}
    </Modal>
  )
}

const $screen: ViewStyle = { flex: 1 }
const $footerButton: ViewStyle = { flex: 1 }
const $summaryBar: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  gap: spacing.xs,
})
const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.lg,
})
const $footer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  padding: spacing.md,
})
const $dialogList: ViewStyle = { gap: 8 }
