import { useEffect, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { SectionList, View } from "react-native"
import { Image, type ImageStyle } from "expo-image"
import { useAction, useMutation, useQuery } from "convex/react"

import { $alert, $alertText, BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { $dialogActions, $dialogButton, $dialogText, DialogCard } from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { ListItem } from "@/components/ListItem"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

type DeckCard = {
  oracleId: string
  scryfallId: string
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
  board: "main" | "sideboard" | "commander"
}

const BOARD_SECTIONS = [
  { board: "commander", label: "Commander" },
  { board: "main", label: "Main" },
  { board: "sideboard", label: "Sideboard" },
] as const

function printingKey(card: Pick<DeckCard, "board" | "scryfallId">) {
  return `${card.board}:${card.scryfallId}`
}

function boardLabel(board: DeckCard["board"]) {
  return BOARD_SECTIONS.find((section) => section.board === board)?.label ?? board
}

function mergedPrintings(cards: DeckCard[]) {
  const merged = new Map<string, DeckCard>()
  for (const card of cards) {
    const current = merged.get(printingKey(card))
    merged.set(
      printingKey(card),
      current ? { ...current, quantity: current.quantity + card.quantity } : card,
    )
  }
  return [...merged.values()]
}

function boardSections(cards: DeckCard[]) {
  return BOARD_SECTIONS.map((section) => {
    const boardCards = cards.filter((card) => card.board === section.board)
    return {
      ...section,
      data: boardCards,
      quantity: boardCards.reduce((total, card) => total + card.quantity, 0),
    }
  }).filter((section) => section.data.length > 0)
}

export function DeckDetailScreen({ deckId, onBack }: { deckId: string; onBack: () => void }) {
  const { themed } = useAppTheme()
  const detail = useQuery(api.decks.detail, { deckId: deckId as Id<"decks"> })
  const stats = useQuery(api.decks.stats, { deckId: deckId as Id<"decks"> })
  const searchCards = useAction(api.cards.search)
  const fetchCardById = useAction(api.cards.byId)
  const saveVersion = useMutation(api.decks.saveVersion)
  const archiveDeck = useMutation(api.decks.archive)
  const { titleVisible, onScroll } = useCollapsingTitle()
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)
  const [cards, setCards] = useState<DeckCard[]>([])
  const [loadedVersionId, setLoadedVersionId] = useState<string>()
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<DeckCard[]>([])
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [focusedKey, setFocusedKey] = useState<string>()
  const [detailsByScryfallId, setDetailsByScryfallId] = useState<
    Record<string, FocusedCardDetails>
  >({})
  const [detailsError, setDetailsError] = useState<string>()
  const focusedCard = cards.find((card) => printingKey(card) === focusedKey)

  useEffect(() => {
    const versionId = detail?.version?._id
    if (!detail || versionId === loadedVersionId) return
    setCards(
      mergedPrintings(
        detail.cards.map(({ _id: _, _creationTime: __, deckVersionId: ___, ...card }) => card),
      ),
    )
    setLoadedVersionId(versionId)
  }, [detail, loadedVersionId])

  async function runSearch() {
    try {
      setBusy(true)
      setError(undefined)
      const found = await searchCards({ query: search })
      setResults(found.map((card) => ({ ...card, quantity: 1, board: "main" as const })))
    } catch (cause) {
      setError(convexErrorMessage(cause, "Could not search cards"))
    } finally {
      setBusy(false)
    }
  }

  function addCard(card: DeckCard) {
    setCards((current) => {
      const existing = current.find((candidate) => printingKey(candidate) === printingKey(card))
      return existing
        ? current.map((candidate) =>
            candidate === existing ? { ...candidate, quantity: candidate.quantity + 1 } : candidate,
          )
        : [...current, card]
    })
  }

  function removeCard(card: DeckCard) {
    setCards((current) =>
      current.flatMap((candidate) =>
        candidate === card
          ? candidate.quantity > 1
            ? [{ ...candidate, quantity: candidate.quantity - 1 }]
            : []
          : [candidate],
      ),
    )
  }

  async function loadCardDetails(scryfallId: string) {
    if (detailsByScryfallId[scryfallId]) return
    try {
      const { manaCost, typeLine, oracleText, setName, collectorNumber, rarity } =
        await fetchCardById({ scryfallId })
      setDetailsByScryfallId((current) => ({
        ...current,
        [scryfallId]: { manaCost, typeLine, oracleText, setName, collectorNumber, rarity },
      }))
    } catch (cause) {
      setDetailsError(convexErrorMessage(cause, "Could not load card details"))
    }
  }

  function focusCard(card: DeckCard) {
    setFocusedKey(printingKey(card))
    setDetailsError(undefined)
    void loadCardDetails(card.scryfallId)
  }

  function decrementFocusedCard(card: DeckCard) {
    if (card.quantity <= 1) setFocusedKey(undefined)
    removeCard(card)
  }

  async function save() {
    try {
      setBusy(true)
      setError(undefined)
      await saveVersion({ deckId: deckId as Id<"decks">, cards })
    } catch (cause) {
      setError(convexErrorMessage(cause, "Could not save deck"))
    } finally {
      setBusy(false)
    }
  }

  async function deleteDeck() {
    try {
      setBusy(true)
      setError(undefined)
      await archiveDeck({ deckId: deckId as Id<"decks"> })
      setDeleteConfirmationOpen(false)
      onBack()
    } catch (cause) {
      setError(convexErrorMessage(cause, "Could not delete deck"))
    } finally {
      setBusy(false)
    }
  }

  function cardThumbnail(card: DeckCard) {
    const thumbnailUrl = card.smallImageUrl ?? card.imageUrl
    return (
      <View style={themed($thumbnailSlot)}>
        {thumbnailUrl ? (
          <Image source={thumbnailUrl} style={themed($thumbnail)} cachePolicy="memory-disk" />
        ) : null}
      </View>
    )
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header
        title={titleVisible ? (detail?.deck.name ?? "Deck") : ""}
        leftTx="common:back"
        onLeftPress={onBack}
      />
      {detail ? (
        <>
          <SectionList
            testID="deck-cards-list"
            style={$styles.flex1}
            contentContainerStyle={themed($listContent)}
            sections={boardSections(cards)}
            keyExtractor={(card) => printingKey(card)}
            stickySectionHeadersEnabled={false}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={16}
            ListHeaderComponent={
              <View style={themed($block)}>
                <Text preset="heading" text={detail.deck.name} />
                <Text
                  text={`${detail.deck.format} · ${cards.reduce((total, card) => total + card.quantity, 0)} cards`}
                />
                {stats && !stats.locked ? (
                  <Text
                    text={`${stats.games} games · ${stats.wins} wins · ${stats.losses} losses · ${stats.draws} draws`}
                  />
                ) : stats?.locked ? (
                  <Text size="xs" text="Premium unlocks deck win-rate analytics." />
                ) : null}
              </View>
            }
            renderSectionHeader={({ section }) => (
              <Text
                weight="bold"
                size="sm"
                style={themed($boardHeading)}
                text={`${section.label} · ${section.quantity}`}
              />
            )}
            renderItem={({ item }) => (
              <ListItem
                bottomSeparator
                height={84}
                style={$centeredRow}
                text={`${item.quantity}× ${item.name}`}
                onPress={() => focusCard(item)}
                LeftComponent={cardThumbnail(item)}
                RightComponent={<Button text="Remove" onPress={() => removeCard(item)} />}
              />
            )}
            ListFooterComponent={
              <View style={themed($block)}>
                <Text preset="subheading" text="Add cards" />
                <TextField label="Scryfall search" value={search} onChangeText={setSearch} />
                <Button
                  text={busy ? "Searching…" : "Search"}
                  disabled={busy || search.trim().length < 2}
                  onPress={runSearch}
                />
                {results.map((card) => (
                  <ListItem
                    key={card.scryfallId}
                    bottomSeparator
                    height={84}
                    style={$centeredRow}
                    text={card.name}
                    LeftComponent={cardThumbnail(card)}
                    onPress={() => addCard(card)}
                  />
                ))}
              </View>
            }
          />
          <BottomActionBar>
            {error ? (
              <View style={themed($alert)}>
                <Text accessibilityRole="alert" style={themed($alertText)} text={error} />
              </View>
            ) : null}
            <View style={themed($actionRow)}>
              <Button
                text={busy ? "Saving…" : "Save new version"}
                preset="reversed"
                style={$actionButton}
                disabled={busy}
                onPress={save}
              />
              <Button
                text="Delete deck"
                testID="delete-deck-button"
                style={[$actionButton, themed($destructiveButton)]}
                textStyle={themed($destructiveText)}
                disabled={busy}
                onPress={() => setDeleteConfirmationOpen(true)}
              />
            </View>
          </BottomActionBar>
          {focusedCard ? (
            <CardFocusDialog
              card={{
                name: focusedCard.name,
                imageUrl: focusedCard.imageUrl,
                smallImageUrl: focusedCard.smallImageUrl,
                quantity: focusedCard.quantity,
                boardLabel: boardLabel(focusedCard.board),
              }}
              details={detailsByScryfallId[focusedCard.scryfallId]}
              detailsError={detailsError}
              onIncrement={() => addCard(focusedCard)}
              onDecrement={() => decrementFocusedCard(focusedCard)}
              onClose={() => setFocusedKey(undefined)}
            />
          ) : null}
          {deleteConfirmationOpen ? (
            <DialogCard
              visible
              onClose={() => setDeleteConfirmationOpen(false)}
              closeDisabled={busy}
              backdropTestID="delete-deck-backdrop"
              backdropAccessibilityLabel="Keep this deck"
              dialogTestID="delete-deck-dialog"
              dialogAccessibilityRole="alert"
              accessibilityViewIsModal
            >
              <Text preset="subheading" text="Delete this deck?" style={themed($dialogText)} />
              <Text
                size="sm"
                text="Past games keep their record of this deck, but it will no longer be available to pick or edit."
                style={themed($dialogText)}
              />
              <View style={themed($dialogActions)}>
                <Button
                  text="Cancel"
                  style={themed($dialogButton)}
                  disabled={busy}
                  onPress={() => setDeleteConfirmationOpen(false)}
                />
                <Button
                  text="Delete"
                  testID="delete-deck-confirm"
                  style={[themed($dialogButton), themed($destructiveButton)]}
                  textStyle={themed($destructiveText)}
                  disabled={busy}
                  onPress={deleteDeck}
                />
              </View>
            </DialogCard>
          ) : null}
        </>
      ) : (
        <Text text="Loading deck…" />
      )}
    </Screen>
  )
}

const $actionButton = { flex: 1, minHeight: 48 } as const

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  gap: spacing.sm,
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.lg,
})
const $block: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $actionRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
const $centeredRow = { alignItems: "center" } as const
const $thumbnailSlot: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 48,
  height: 68,
  borderRadius: spacing.xxs,
  marginEnd: spacing.sm,
  overflow: "hidden",
  backgroundColor: colors.separator,
})
const $thumbnail: ThemedStyle<ImageStyle> = () => ({ width: 48, height: 68 })
const $boardHeading: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $destructiveButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.errorBackground,
  borderColor: colors.error,
  borderWidth: 1,
})
const $destructiveText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
