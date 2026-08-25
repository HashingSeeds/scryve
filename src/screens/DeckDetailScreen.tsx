import { useMemo, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, SectionList, TouchableOpacity, View } from "react-native"
import { Image, type ImageStyle } from "expo-image"
import { useAction, useMutation, useQuery } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { DeckListSkeleton } from "@/components/DeckLoadingState"
import { DeckSettingsDialog } from "@/components/DeckSettingsDialog"
import type { DeckVersionDraft } from "@/components/DeckVersionDialog"
import { DeckVersionDialog } from "@/components/DeckVersionDialog"
import { $dialogActions, $dialogButton, $dialogText, DialogCard } from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { ListItem } from "@/components/ListItem"
import { LoadingProgress } from "@/components/LoadingProgress"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { cardCountLabel, recordLine } from "@/features/decks/deckCopy"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { deckFormatLabel, deckGame, deckSections } from "../../convex/lib/deckGames"
import { versionLabel } from "../../convex/lib/deckVersions"

type DeckCard = {
  oracleId: string
  scryfallId: string
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
  board: "main" | "sideboard" | "commander"
}

type DeckDetailTab = "cards" | "versions" | "notes"

function printingKey(card: Pick<DeckCard, "board" | "scryfallId">) {
  return `${card.board}:${card.scryfallId}`
}

function boardLabel(sections: readonly { id: string; label: string }[], board: string) {
  return sections.find((section) => section.id === board)?.label ?? board
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

function groupedCards(cards: DeckCard[], sections: readonly { id: string; label: string }[]) {
  const known = sections.map((section) => {
    const boardCards = cards.filter((card) => card.board === section.id)
    return {
      board: section.id,
      label: section.label,
      data: boardCards,
      quantity: boardCards.reduce((total, card) => total + card.quantity, 0),
    }
  })
  const knownIds = new Set(sections.map((section) => section.id))
  const extraIds = [...new Set(cards.map((card) => card.board).filter((id) => !knownIds.has(id)))]
  const extra = extraIds.map((board) => {
    const boardCards = cards.filter((card) => card.board === board)
    return {
      board,
      label: board.charAt(0).toUpperCase() + board.slice(1),
      data: boardCards,
      quantity: boardCards.reduce((total, card) => total + card.quantity, 0),
    }
  })
  return [...known, ...extra].filter((section) => section.data.length > 0)
}

function totalQuantity(cards: DeckCard[]) {
  return cards.reduce((total, card) => total + card.quantity, 0)
}

export type DeckDetailSummary = {
  name: string
  game: string
  format: string
  cardQuantity?: number
}

export function DeckDetailScreen({
  deckId,
  summary,
  onBack,
}: {
  deckId: string
  summary?: DeckDetailSummary
  onBack: () => void
}) {
  const { themed } = useAppTheme()
  const [selectedVersionId, setSelectedVersionId] = useState<Id<"deckVersions">>()
  const detail = useQuery(api.decks.detail, {
    deckId: deckId as Id<"decks">,
    ...(selectedVersionId ? { versionId: selectedVersionId } : {}),
  })
  const searchCards = useAction(api.cards.search)
  const fetchCardById = useAction(api.cards.byId)
  const saveVersion = useMutation(api.decks.saveVersion)
  const createVersion = useMutation(api.decks.createVersion)
  const updateVersion = useMutation(api.decks.updateVersion)
  const deleteVersion = useMutation(api.decks.deleteVersion)
  const updateDeck = useMutation(api.decks.update)
  const archiveDeck = useMutation(api.decks.archive)
  const { titleVisible, onScroll } = useCollapsingTitle()
  const [editing, setEditing] = useState(false)
  const [activeTab, setActiveTab] = useState<DeckDetailTab>("cards")
  const [draft, setDraft] = useState<DeckCard[]>([])
  const [dialog, setDialog] = useState<
    "none" | "newVersion" | "renameVersion" | "deleteVersion" | "settings" | "deleteDeck"
  >("none")
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<DeckCard[]>([])
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [focusedKey, setFocusedKey] = useState<string>()
  const [detailsByScryfallId, setDetailsByScryfallId] = useState<
    Record<string, FocusedCardDetails>
  >({})
  const [detailsError, setDetailsError] = useState<string>()

  const storedCards = useMemo(
    () =>
      mergedPrintings(
        (detail?.cards ?? []).map(
          ({ _id: _, _creationTime: __, deckVersionId: ___, ...card }) => card,
        ),
      ),
    [detail?.cards],
  )
  const cards = editing ? draft : storedCards
  const focusedCard = cards.find((card) => printingKey(card) === focusedKey)
  const version = detail?.version
  const versionSummary = detail?.versions.find((candidate) => candidate._id === version?._id)
  const canAddVersion = detail?.capacity.canCreate === true
  const canDeleteVersion = (detail?.versions.length ?? 0) > 1
  const premium = detail?.capacity.premium === true

  function fail(cause: unknown, fallback: string) {
    setError(convexErrorMessage(cause, fallback))
  }

  async function run(work: () => Promise<void>, fallback: string) {
    try {
      setBusy(true)
      setError(undefined)
      await work()
    } catch (cause) {
      fail(cause, fallback)
    } finally {
      setBusy(false)
    }
  }

  function startEditing() {
    setDraft(storedCards)
    setError(undefined)
    setEditing(true)
  }

  function discardEdits() {
    setDraft([])
    setResults([])
    setSearch("")
    setError(undefined)
    setEditing(false)
  }

  async function runSearch() {
    await run(async () => {
      const found = await searchCards({ query: search })
      setResults(found.map((card) => ({ ...card, quantity: 1, board: "main" as const })))
    }, "Could not search cards")
  }

  function addCard(card: DeckCard) {
    setDraft((current) => {
      const existing = current.find((candidate) => printingKey(candidate) === printingKey(card))
      return existing
        ? current.map((candidate) =>
            candidate === existing ? { ...candidate, quantity: candidate.quantity + 1 } : candidate,
          )
        : [...current, card]
    })
  }

  function removeCard(card: DeckCard) {
    setDraft((current) =>
      current.flatMap((candidate) =>
        printingKey(candidate) === printingKey(card)
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
    await run(async () => {
      await saveVersion({
        deckId: deckId as Id<"decks">,
        ...(version ? { versionId: version._id } : {}),
        cards: draft,
      })
      setEditing(false)
      setResults([])
      setSearch("")
    }, "Could not save deck")
  }

  function chooseVersion(versionId: string) {
    setSelectedVersionId(versionId as Id<"deckVersions">)
  }

  function startNewVersion() {
    setError(undefined)
    if (!canAddVersion) {
      const limit = detail?.capacity.limit ?? 0
      setError(
        `This deck holds up to ${limit} version${limit === 1 ? "" : "s"}. Delete one to add another.`,
      )
      return
    }
    setDialog("newVersion")
  }

  async function submitNewVersion({ name, note, copyCards }: DeckVersionDraft) {
    await run(async () => {
      const versionId = await createVersion({
        deckId: deckId as Id<"decks">,
        name,
        ...(note.trim() ? { note } : {}),
        ...(copyCards && version ? { fromVersionId: version._id } : {}),
      })
      setSelectedVersionId(versionId)
      setDialog("none")
    }, "Could not create version")
  }

  async function submitRenameVersion({ name, note }: DeckVersionDraft) {
    if (!version) return
    await run(async () => {
      await updateVersion({ versionId: version._id, name, note })
      setDialog("none")
    }, "Could not update version")
  }

  function startDeleteVersion() {
    setError(undefined)
    setDialog("deleteVersion")
  }

  async function confirmDeleteVersion() {
    if (!version) return
    await run(async () => {
      await deleteVersion({ versionId: version._id })
      setSelectedVersionId(undefined)
      setDialog("none")
    }, "Could not delete version")
  }

  async function submitSettings({
    name,
    format,
    note,
  }: {
    name: string
    format: string
    note: string
  }) {
    await run(async () => {
      await updateDeck({ deckId: deckId as Id<"decks">, name, format, note })
      setDialog("none")
    }, "Could not update deck")
  }

  async function deleteDeck() {
    await run(async () => {
      await archiveDeck({ deckId: deckId as Id<"decks"> })
      setDialog("none")
      onBack()
    }, "Could not delete deck")
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

  const loadingGameLabel = summary ? (deckGame(summary.game)?.shortLabel ?? summary.game) : null
  const loadingMetadata = summary
    ? [
        loadingGameLabel,
        deckFormatLabel(summary.game, summary.format),
        summary.cardQuantity !== undefined ? cardCountLabel(summary.cardQuantity) : undefined,
      ]
        .filter(Boolean)
        .join(" · ")
    : null
  const loadingSections = summary ? deckSections(summary.game, summary.format) : []

  if (!detail)
    return (
      <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
        <Header
          title=""
          leftTx="common:back"
          onLeftPress={onBack}
          RightActionComponent={
            <View style={themed($headerAction)}>
              <Text size="lg" text="•••" />
            </View>
          }
        />
        <ScrollView
          style={$styles.flex1}
          contentContainerStyle={themed($loadingContent)}
          scrollEnabled={false}
        >
          <View style={themed($headerBlock)}>
            <View style={themed($titleBlock)}>
              <Text preset="heading" text={summary?.name ?? "Deck"} />
              {loadingMetadata ? (
                <Text size="sm" style={themed($dimmedText)} text={loadingMetadata} />
              ) : null}
              <LoadingProgress
                testID="deck-loading-progress"
                state="loading"
                accessibilityText="Loading deck"
              />
            </View>
            <View style={themed($tabs)} accessibilityRole="tablist">
              {(["cards", "versions", "notes"] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  testID={`deck-tab-${tab}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === "cards", disabled: true }}
                  style={[themed($tab), tab === "cards" && themed($selectedTab)]}
                  disabled
                >
                  <Text
                    size="sm"
                    weight={tab === "cards" ? "bold" : "normal"}
                    text={tab.charAt(0).toUpperCase() + tab.slice(1)}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              testID="current-version-button"
              style={themed($currentVersion)}
              disabled
            >
              <Text size="xs" style={themed($dimmedText)} text="Version" />
              <Text weight="medium" text="Current  ›" />
            </TouchableOpacity>
          </View>
          <DeckListSkeleton sections={loadingSections} density="comfortable" />
        </ScrollView>
        <BottomActionBar>
          <View style={themed($actionRow)}>
            <Button
              testID="edit-deck-button"
              text="Edit list"
              preset="reversed"
              style={$actionButton}
              disabled
            />
          </View>
        </BottomActionBar>
      </Screen>
    )

  const deckRecord = recordLine(detail.record)
  const gameLabel = deckGame(detail.deck.game)?.shortLabel ?? detail.deck.game
  const configuredSections = deckSections(detail.deck.game, detail.deck.format)
  const cardSections = groupedCards(cards, configuredSections)

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header
        title={titleVisible ? detail.deck.name : ""}
        leftTx="common:back"
        onLeftPress={onBack}
        RightActionComponent={
          <TouchableOpacity
            testID="deck-settings-button"
            accessibilityRole="button"
            accessibilityLabel="Deck settings"
            style={themed($headerAction)}
            onPress={() => setDialog("settings")}
          >
            <Text size="lg" text="•••" />
          </TouchableOpacity>
        }
      />
      <SectionList
        testID="deck-cards-list"
        style={$styles.flex1}
        contentContainerStyle={themed($listContent)}
        sections={activeTab === "cards" ? cardSections : []}
        keyExtractor={(card) => printingKey(card)}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View style={themed($headerBlock)}>
            <View style={themed($titleBlock)}>
              <Text preset="heading" text={detail.deck.name} />
              <Text
                size="sm"
                style={themed($dimmedText)}
                text={`${gameLabel} · ${deckFormatLabel(detail.deck.game, detail.deck.format)} · ${cardCountLabel(totalQuantity(cards))}`}
              />
              {deckRecord ? <Text size="sm" text={deckRecord} /> : null}
              <LoadingProgress
                testID="deck-loading-progress"
                state="complete"
                accessibilityText="Deck loaded"
              />
            </View>

            <View style={themed($tabs)} accessibilityRole="tablist">
              {(["cards", "versions", "notes"] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  testID={`deck-tab-${tab}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activeTab === tab }}
                  style={[themed($tab), activeTab === tab && themed($selectedTab)]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text
                    size="sm"
                    weight={activeTab === tab ? "bold" : "normal"}
                    text={tab.charAt(0).toUpperCase() + tab.slice(1)}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {activeTab !== "cards" && error ? <AlertNote text={error} /> : null}

            {activeTab === "cards" ? (
              <TouchableOpacity
                testID="current-version-button"
                style={themed($currentVersion)}
                onPress={() => setActiveTab("versions")}
              >
                <Text size="xs" style={themed($dimmedText)} text="Version" />
                <Text weight="medium" text={`${version ? versionLabel(version) : "Current"}  ›`} />
              </TouchableOpacity>
            ) : null}

            {activeTab === "versions" ? (
              <View style={themed($versions)}>
                {detail.versions.map((candidate) => {
                  const selected = candidate._id === version?._id
                  const candidateRecord = recordLine(candidate.record)
                  return (
                    <TouchableOpacity
                      key={candidate._id}
                      testID={`version-picker-${candidate._id}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={themed($versionRow)}
                      disabled={editing}
                      onPress={() => chooseVersion(candidate._id)}
                    >
                      <View
                        style={[themed($versionDot), selected && themed($versionDotSelected)]}
                      />
                      <View style={themed($versionCopy)}>
                        <Text weight="medium" text={versionLabel(candidate)} />
                        <Text
                          size="xxs"
                          style={themed($dimmedText)}
                          text={[cardCountLabel(candidate.cardQuantity), candidateRecord]
                            .filter(Boolean)
                            .join(" · ")}
                        />
                        {candidate.note ? (
                          <Text size="xs" numberOfLines={2} text={candidate.note} />
                        ) : null}
                      </View>
                      {selected ? (
                        <TouchableOpacity
                          testID="rename-version-button"
                          accessibilityRole="button"
                          onPress={() => setDialog("renameVersion")}
                        >
                          <Text size="lg" text="•••" />
                        </TouchableOpacity>
                      ) : null}
                    </TouchableOpacity>
                  )
                })}
                <Button
                  testID="version-picker-__new__"
                  text="New version"
                  preset="reversed"
                  disabled={editing}
                  onPress={startNewVersion}
                />
              </View>
            ) : null}

            {activeTab === "notes" ? (
              <View style={themed($block)}>
                <Text
                  size="sm"
                  style={detail.deck.note ? undefined : themed($dimmedText)}
                  text={detail.deck.note || "No deck notes yet."}
                />
                <Button text="Edit deck details" onPress={() => setDialog("settings")} />
              </View>
            ) : null}

            {activeTab === "cards" && cards.length === 0 ? (
              <Text
                size="sm"
                style={themed($dimmedText)}
                text={
                  editing
                    ? "Search below to add your first card."
                    : "This version has no cards yet. Tap Edit list to build it."
                }
              />
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
            RightComponent={
              editing ? (
                <View style={themed($quantityRow)}>
                  <Button text="−" style={$stepperButton} onPress={() => removeCard(item)} />
                  <Button text="+" style={$stepperButton} onPress={() => addCard(item)} />
                </View>
              ) : undefined
            }
          />
        )}
        ListFooterComponent={
          editing && activeTab === "cards" ? (
            <View style={themed($block)}>
              <Text preset="subheading" text="Add cards" />
              <TextField
                testID="card-search-input"
                label="Card search"
                placeholder="Name, type, or Scryfall query"
                value={search}
                autoCorrect={false}
                clearButtonMode="while-editing"
                onChangeText={setSearch}
                onSubmitEditing={runSearch}
              />
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
          ) : null
        }
      />
      {activeTab === "cards" ? (
        <BottomActionBar>
          {error ? <AlertNote text={error} /> : null}
          <View style={themed($actionRow)}>
            {editing ? (
              <>
                <Button
                  testID="save-version-button"
                  text={busy ? "Saving…" : "Save changes"}
                  preset="reversed"
                  style={$actionButton}
                  disabled={busy}
                  onPress={save}
                />
                <Button
                  testID="discard-edits-button"
                  text="Discard"
                  style={$actionButton}
                  disabled={busy}
                  onPress={discardEdits}
                />
              </>
            ) : (
              <>
                <Button
                  testID="edit-deck-button"
                  text="Edit list"
                  preset="reversed"
                  style={$actionButton}
                  disabled={busy}
                  onPress={startEditing}
                />
              </>
            )}
          </View>
        </BottomActionBar>
      ) : null}

      {focusedCard ? (
        <CardFocusDialog
          card={{
            name: focusedCard.name,
            imageUrl: focusedCard.imageUrl,
            smallImageUrl: focusedCard.smallImageUrl,
            quantity: focusedCard.quantity,
            boardLabel: boardLabel(configuredSections, focusedCard.board),
          }}
          details={detailsByScryfallId[focusedCard.scryfallId]}
          detailsError={detailsError}
          {...(editing
            ? {
                onIncrement: () => addCard(focusedCard),
                onDecrement: () => decrementFocusedCard(focusedCard),
              }
            : {})}
          onClose={() => setFocusedKey(undefined)}
        />
      ) : null}

      {dialog === "newVersion" ? (
        <DeckVersionDialog
          title="New version"
          submitLabel="Create version"
          copyFromLabel={version ? versionLabel(versionSummary ?? version) : undefined}
          busy={busy}
          error={error}
          onSubmit={submitNewVersion}
          onClose={() => setDialog("none")}
        />
      ) : null}

      {dialog === "renameVersion" && versionSummary ? (
        <DeckVersionDialog
          title="Version details"
          submitLabel="Save"
          initialName={versionLabel(versionSummary)}
          initialNote={versionSummary.note ?? ""}
          notesLocked={!premium}
          busy={busy}
          error={error}
          onSubmit={submitRenameVersion}
          {...(canDeleteVersion ? { onDelete: startDeleteVersion } : {})}
          onClose={() => setDialog("none")}
        />
      ) : null}

      {dialog === "settings" ? (
        <DeckSettingsDialog
          game={detail.deck.game}
          initial={{
            name: detail.deck.name,
            format: detail.deck.format,
            note: detail.deck.note ?? "",
          }}
          busy={busy}
          error={error}
          onSubmit={submitSettings}
          onDelete={() => setDialog("deleteDeck")}
          onClose={() => setDialog("none")}
        />
      ) : null}

      {dialog === "deleteVersion" ? (
        <DialogCard
          visible
          onClose={() => setDialog("none")}
          closeDisabled={busy}
          backdropTestID="delete-version-backdrop"
          backdropAccessibilityLabel="Keep this version"
          dialogTestID="delete-version-dialog"
          dialogAccessibilityRole="alert"
          accessibilityViewIsModal
        >
          <Text preset="subheading" text="Delete this version?" style={themed($dialogText)} />
          <Text
            size="sm"
            text="Games already played with it keep their record, but the list will no longer be editable or selectable."
            style={themed($dialogText)}
          />
          {error ? <AlertNote text={error} /> : null}
          <View style={themed($dialogActions)}>
            <Button
              text="Cancel"
              style={themed($dialogButton)}
              disabled={busy}
              onPress={() => setDialog("none")}
            />
            <Button
              text="Delete"
              testID="delete-version-confirm"
              style={[themed($dialogButton), themed($destructiveButton)]}
              textStyle={themed($destructiveText)}
              disabled={busy}
              onPress={confirmDeleteVersion}
            />
          </View>
        </DialogCard>
      ) : null}

      {dialog === "deleteDeck" ? (
        <DialogCard
          visible
          onClose={() => setDialog("none")}
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
              onPress={() => setDialog("none")}
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
    </Screen>
  )
}

const $actionButton = { flex: 1, minHeight: 48 } as const
const $stepperButton = { minWidth: 44, minHeight: 44 } as const

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  gap: spacing.sm,
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.lg,
})
const $loadingContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  gap: spacing.sm,
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.lg,
})
const $block: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $headerBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $titleBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $tabs: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flexDirection: "row",
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $tab: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  alignItems: "center",
  paddingVertical: spacing.xs,
  borderBottomWidth: 2,
  borderBottomColor: "transparent",
})
const $selectedTab: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderBottomColor: colors.tint })
const $currentVersion: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $versions: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $versionRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 64,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $versionDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 10,
  height: 10,
  borderRadius: 5,
  borderWidth: 1,
  borderColor: colors.textDim,
})
const $versionDotSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.tint,
  backgroundColor: colors.tint,
})
const $versionCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, gap: spacing.xxxs })
const $headerAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  height: 56,
  minWidth: 56,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.md,
})
const $quantityRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
})
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
const $dimmedText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $destructiveButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.errorBackground,
  borderColor: colors.error,
  borderWidth: 1,
})
const $destructiveText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
