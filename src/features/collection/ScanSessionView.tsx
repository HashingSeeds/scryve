import { useMemo, useState } from "react"
import { FlatList, Linking, Modal, TouchableOpacity, View } from "react-native"
import type { ImageStyle, ViewStyle } from "react-native"

import { Button } from "@/components/Button"
import { CardImage } from "@/components/CardImage"
import { DialogCard } from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { formatCurrency, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { catalogDb } from "@/storage/catalogDb"
import { useAppTheme } from "@/theme/context"
import { radius } from "@/theme/radius"
import type { ThemedStyle } from "@/theme/types"

import { lookupPrintingPrice } from "./catalogSync"
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
import { cardKingdomCardUrl, tcgplayerCardUrl, tcgplayerMassEntryUrl } from "./storeLinks"
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
      const printing = catalogDb.getPrinting(entry.game, entry.printingId)
      return {
        entry,
        printing,
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
    return listBinders("binder")
  }, [revision])

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
          title={session.name}
          leftTx="common:back"
          onLeftPress={onClose}
          rightTx="decks:collection.scanMore"
          onRightPress={onScanMore}
          backgroundColor={theme.colors.background}
        />
        <View style={themed($summaryBar)}>
          <Text weight="bold" text={translate("decks:cardCount", { count: totals.cards })} />
          <Text
            size="sm"
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
            ])}
          />
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
          ListEmptyComponent={
            <Text
              size="sm"
              style={{ color: theme.colors.textDim }}
              tx="decks:collection.emptySession"
            />
          }
          renderItem={({ item: { entry, printing, retailCents, buylistCents } }) => (
            <View style={themed($cardRow)}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setEditingPrinting(entry)}
                style={$cardLead}
              >
                <CardImage
                  game={entry.game}
                  source={entry.smallImageUrl ?? entry.imageUrl}
                  compact
                  style={$thumb}
                  accessibilityLabel={entry.name}
                />
                <View style={$meta}>
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
                      retailCents > 0 ? formatCurrency(retailCents, "USD") : "",
                      buylistCents > 0
                        ? translate("decks:cardScan.buylistShort", {
                            value: formatCurrency(buylistCents, "USD"),
                          })
                        : "",
                    ])}
                  />
                </View>
              </TouchableOpacity>
              <View style={$actions}>
                <View style={$qtyRow}>
                  <Button
                    text="−"
                    accessibilityLabel={translate("decks:cardRow.decrease", { card: entry.name })}
                    onPress={() =>
                      updateCollectionEntry(entry.id, { quantity: entry.quantity - 1 })
                    }
                  />
                  <Text weight="medium" text={entry.quantity} />
                  <Button
                    text="+"
                    accessibilityLabel={translate("decks:cardRow.increase", { card: entry.name })}
                    onPress={() =>
                      updateCollectionEntry(entry.id, { quantity: entry.quantity + 1 })
                    }
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
        />

        {pricedEntries.length > 0 ? (
          <View style={themed($footer)}>
            <Button
              testID="scan-session-move"
              tx="decks:collection.moveToBinder"
              onPress={() => setMoving(true)}
            />
            <Button
              testID="scan-session-buy"
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
const $summaryBar: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  gap: spacing.xs,
})
const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.lg,
  gap: spacing.xs,
})
const $cardRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  padding: spacing.sm,
  borderRadius: radius.md,
  backgroundColor: colors.surface,
})
const $cardLead: ViewStyle = { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }
const $thumb: ImageStyle = { width: 42, height: 58 }
const $meta: ViewStyle = { flex: 1 }
const $actions: ViewStyle = { alignItems: "flex-end", gap: 6 }
const $qtyRow: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 6 }
const $linkRow: ViewStyle = { flexDirection: "row", gap: 10 }
const $footer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  padding: spacing.md,
})
const $dialogList: ViewStyle = { gap: 8 }
