import { useCallback, useEffect, useMemo, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"
import { useFocusEffect, useNavigation } from "expo-router"
import { useAction, useMutation, useQuery } from "convex/react"
import { usePreventRemove } from "expo-router/react-navigation"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { DeckListSkeleton } from "@/components/DeckLoadingState"
import { DeckSettingsDialog } from "@/components/DeckSettingsDialog"
import type { DeckVersionDraft } from "@/components/DeckVersionDialog"
import { DeckVersionDialog } from "@/components/DeckVersionDialog"
import { $dialogActions, $dialogButton, $dialogText, DialogCard } from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { LoadingProgress } from "@/components/LoadingProgress"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { catalogCardDetails } from "@/features/decks/cardFocus"
import { CardSearchScreen } from "@/features/decks/CardSearchScreen"
import { cardSection, printingKey, type DeckCard } from "@/features/decks/deckCards"
import { cardCountLabel } from "@/features/decks/deckCopy"
import { DeckView } from "@/features/decks/DeckView"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { captureAnalytics } from "@/utils/analytics"
import { convexErrorCode, convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { deckFormatLabel, deckGame, deckSections } from "../../convex/lib/deckGames"
import { versionLabel } from "../../convex/lib/deckVersions"

type DeckDialog =
  "none" | "newVersion" | "renameVersion" | "deleteVersion" | "settings" | "deleteDeck" | "discard"

export function cardDetailsKey(card: DeckCard, game: string) {
  if (card.scryfallId) return card.scryfallId
  const identity = [
    card.cardId,
    card.printingId,
    card.providerCardId,
    card.originalReference,
    card.name,
  ].find(Boolean)
  return `${game}:${identity ?? "unknown"}:${card.originalReference ?? ""}`
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

function cardsChanged(draft: DeckCard[], stored: DeckCard[]) {
  return (
    draft.length !== stored.length ||
    draft.some(
      (card, index) =>
        printingKey(card) !== printingKey(stored[index]) ||
        card.quantity !== stored[index].quantity,
    )
  )
}

export type DeckDetailSummary = {
  name: string
  game: string
  format: string
  cardQuantity?: number
}

type DeckDetailScreenProps = {
  access?: CloudAccess
  deckId: string
  summary?: DeckDetailSummary
  onBack: () => void
}

function DeckDetailPlaceholder({
  summary,
  onBack,
  failure,
  access,
}: {
  summary?: DeckDetailSummary
  onBack: () => void
  access?: CloudAccess
  failure?: { kind: "missing" | "unavailable"; retry: () => void }
}) {
  const { themed, theme } = useAppTheme()
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
  const statusText = failure?.kind === "missing" ? "Deck not found" : "Deck unavailable"

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={themed($screen)}
    >
      <Header
        title=""
        backgroundColor={theme.colors.surface}
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
              state={failure || access?.message ? "unavailable" : "loading"}
              accessibilityText={failure ? statusText : "Loading deck"}
            />
          </View>
          <View style={themed($tabs)} accessibilityRole="tablist">
            {(["cards", "notes"] as const).map((tab) => (
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
            <Text size="xs" style={themed($dimmedText)} text="Current version" />
            <Text weight="medium" text="Current ›" />
          </TouchableOpacity>
          {access?.message ? (
            <Button text={access.actionLabel ?? access.message} onPress={access.request} />
          ) : null}
          {failure ? (
            <View style={themed($queryFailure)}>
              <Text preset="subheading" text={statusText} />
              <Text
                size="sm"
                style={themed($dimmedText)}
                text={
                  failure.kind === "missing"
                    ? "This deck may have been deleted."
                    : "Could not load this deck."
                }
              />
              {failure.kind === "unavailable" ? (
                <Button testID="retry-deck-detail" text="Retry" onPress={failure.retry} />
              ) : null}
            </View>
          ) : null}
        </View>
        <DeckListSkeleton sections={loadingSections} density="comfortable" />
      </ScrollView>
      <BottomActionBar style={themed($actionBar)}>
        <View style={themed($actionRow)}>
          <Button
            testID="edit-deck-button"
            text="Edit list"
            style={themed($primaryActionButton)}
            textStyle={themed($primaryActionText)}
            disabled
          />
        </View>
      </BottomActionBar>
    </Screen>
  )
}

export function DeckDetailScreen(props: DeckDetailScreenProps) {
  return (
    <ConvexQueryBoundary
      resetKey={props.deckId}
      fallback={({ error, retry }) => (
        <DeckDetailPlaceholder
          summary={props.summary}
          onBack={props.onBack}
          failure={{
            kind:
              convexErrorCode(error) === "deck_not_found" || /deck not found/i.test(error.message)
                ? "missing"
                : "unavailable",
            retry,
          }}
        />
      )}
    >
      <DeckDetailContent key={props.access?.ownerId} {...props} />
    </ConvexQueryBoundary>
  )
}

function DeckDetailContent({ deckId, summary, onBack, access }: DeckDetailScreenProps) {
  const { themed, theme } = useAppTheme()
  const navigation = useNavigation()
  const [selectedVersionId, setSelectedVersionId] = useState<Id<"deckVersions">>()
  const detail = useQuery(
    api.decks.detail,
    (access?.ready ?? true)
      ? {
          deckId: deckId as Id<"decks">,
          ...(selectedVersionId ? { versionId: selectedVersionId } : {}),
        }
      : "skip",
  )
  const statsAvailable = Boolean(detail)
  useFocusEffect(
    useCallback(() => {
      if (statsAvailable) captureAnalytics("stats_viewed", { surface: "deck" })
    }, [statsAvailable]),
  )
  const fetchCardById = useAction(api.cards.byId)
  const fetchCatalogCardById = useAction(api.cards.byCatalogId)
  const fetchPokemonCardByReference = useAction(api.cards.byPokemonReference)
  const saveVersion = useMutation(api.decks.saveVersion)
  const createVersion = useMutation(api.decks.createVersion)
  const updateVersion = useMutation(api.decks.updateVersion)
  const deleteVersion = useMutation(api.decks.deleteVersion)
  const updateDeck = useMutation(api.decks.update)
  const archiveDeck = useMutation(api.decks.archive)
  const [tab, setTab] = useState<"cards" | "notes">("cards")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DeckCard[]>([])
  const [dialog, setDialog] = useState<DeckDialog>("none")
  const [pendingNavigation, setPendingNavigation] =
    useState<Parameters<typeof navigation.dispatch>[0]>()
  const [adding, setAdding] = useState(false)
  const [draftNote, setDraftNote] = useState("")
  const [undo, setUndo] = useState<{ name: string; cards: DeckCard[] }>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [focusedKey, setFocusedKey] = useState<string>()
  const [detailsByCardKey, setDetailsByCardKey] = useState<Record<string, FocusedCardDetails>>({})
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
  const draftChanged =
    editing && (cardsChanged(draft, storedCards) || draftNote !== (detail?.deck.note ?? ""))
  const focusedCard = cards.find((card) => printingKey(card) === focusedKey)
  const version = detail?.version
  const versionSummary = detail?.versions.find((candidate) => candidate._id === version?._id)
  const canAddVersion = detail?.capacity.canCreate === true
  const canDeleteVersion = (detail?.versions.length ?? 0) > 1
  const premium = detail?.capacity.premium === true

  usePreventRemove(draftChanged, ({ data }) => {
    setPendingNavigation(data.action)
    setDialog("discard")
  })

  useEffect(() => {
    if (editing || !pendingNavigation) return
    const action = pendingNavigation
    setPendingNavigation(undefined)
    navigation.dispatch(action)
  }, [editing, navigation, pendingNavigation])

  function fail(cause: unknown, fallback: string) {
    setError(convexErrorMessage(cause, fallback))
  }

  async function run(work: () => Promise<void>, fallback: string) {
    if (access && !access.ready) {
      access.request()
      return
    }
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
    setDraftNote(detail?.deck.note ?? "")
    setUndo(undefined)
    setError(undefined)
    setEditing(true)
  }

  function discardEdits() {
    setDraft([])
    setUndo(undefined)
    setError(undefined)
    setEditing(false)
  }

  function requestDiscard() {
    if (draftChanged) {
      setDialog("discard")
      return
    }
    discardEdits()
  }

  function addCard(card: DeckCard) {
    setUndo(undefined)
    setDraft((current) => {
      const existing = current.find((candidate) => printingKey(candidate) === printingKey(card))
      return existing
        ? current.map((candidate) =>
            candidate === existing
              ? { ...candidate, quantity: Math.min(999, candidate.quantity + 1) }
              : candidate,
          )
        : [...current, card]
    })
  }

  function removeCard(card: DeckCard) {
    setUndo(card.quantity === 1 ? { name: card.name, cards: draft } : undefined)
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

  async function loadCardDetails(card: DeckCard) {
    const game = detail?.deck.game ?? card.game ?? "mtg"
    const detailsKey = cardDetailsKey(card, game)
    if (detailsByCardKey[detailsKey]) return
    try {
      const catalogCardId = card.cardId ?? card.printingId ?? card.providerCardId
      const details = card.scryfallId
        ? await fetchCardById({ scryfallId: card.scryfallId })
        : catalogCardId
          ? catalogCardDetails(await fetchCatalogCardById({ game, cardId: catalogCardId }))
          : game === "pokemon" && card.originalReference
            ? catalogCardDetails(
                await fetchPokemonCardByReference({
                  name: card.name,
                  originalReference: card.originalReference,
                }),
              )
            : undefined
      if (!details) {
        setDetailsError("No additional card details are available.")
        return
      }
      setDetailsByCardKey((current) => ({ ...current, [detailsKey]: details }))
    } catch (cause) {
      setDetailsError(convexErrorMessage(cause, "Could not load card details"))
    }
  }

  function focusCard(card: DeckCard) {
    setFocusedKey(printingKey(card))
    setDetailsError(undefined)
    void loadCardDetails(card)
  }

  function decrementFocusedCard(card: DeckCard) {
    if (card.quantity <= 1) setFocusedKey(undefined)
    removeCard(card)
  }

  async function save() {
    await run(async () => {
      if (draftNote !== (detail?.deck.note ?? ""))
        await updateDeck({ deckId: deckId as Id<"decks">, note: draftNote })
      await saveVersion({
        deckId: deckId as Id<"decks">,
        ...(version ? { versionId: version._id } : {}),
        cards: draft,
      })
      captureAnalytics("deck_used", { feature: "saved" })
      setEditing(false)
      setUndo(undefined)
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

  async function submitSettings({ name, format }: { name: string; format: string }) {
    await run(async () => {
      await updateDeck({ deckId: deckId as Id<"decks">, name, format })
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

  if (!detail) return <DeckDetailPlaceholder summary={summary} onBack={onBack} access={access} />

  const configuredSections = deckSections(detail.deck.game, detail.deck.format)

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={themed($screen)}
    >
      <DeckView
        tab={tab}
        onTabChange={setTab}
        name={detail.deck.name}
        game={detail.deck.game}
        format={detail.deck.format}
        cards={cards}
        note={editing ? draftNote : (detail.deck.note ?? "")}
        editing={editing}
        dirty={draftChanged}
        busy={busy}
        onBack={onBack}
        onEdit={startEditing}
        onSave={save}
        onCancel={requestDiscard}
        onDetails={() => setDialog("settings")}
        onAdd={() => {
          if (!editing) startEditing()
          setAdding(true)
        }}
        onNoteChange={setDraftNote}
        onFocus={focusCard}
        onIncrement={addCard}
        onDecrement={removeCard}
        undo={
          undo
            ? {
                name: undo.name,
                restore: () => {
                  setDraft(undo.cards)
                  setUndo(undefined)
                },
              }
            : undefined
        }
        error={error && dialog === "none" ? <AlertNote text={error} /> : undefined}
      />
      {adding ? (
        <CardSearchScreen
          game={detail.deck.game}
          format={detail.deck.format}
          onClose={() => setAdding(false)}
          onAdd={(card) => {
            const existing = draft.find((entry) => printingKey(entry) === printingKey(card))
            if (existing && existing.quantity >= 999) return "A card can have at most 999 copies."
            if (!existing && draft.length >= 300) return "A deck can have at most 300 entries."
            addCard(card)
            return undefined
          }}
        />
      ) : null}

      {focusedCard ? (
        <CardFocusDialog
          card={{
            game: detail.deck.game,
            cardId:
              focusedCard.scryfallId ??
              focusedCard.cardId ??
              focusedCard.printingId ??
              focusedCard.providerCardId,
            name: focusedCard.name,
            imageUrl: focusedCard.imageUrl,
            smallImageUrl: focusedCard.smallImageUrl,
            quantity: focusedCard.quantity,
            boardLabel: boardLabel(configuredSections, cardSection(focusedCard)),
          }}
          details={detailsByCardKey[cardDetailsKey(focusedCard, detail.deck.game)]}
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
          }}
          busy={busy}
          error={error}
          onSubmit={submitSettings}
          onDelete={() => setDialog("deleteDeck")}
          onClose={() => setDialog("none")}
        >
          <View style={themed($versions)}>
            <View style={themed($versionHeading)}>
              <Text weight="bold" size="sm" text="Versions" />
              <TouchableOpacity
                testID="version-picker-__new__"
                accessibilityRole="button"
                accessibilityLabel="New version"
                disabled={editing}
                onPress={startNewVersion}
              >
                <Text weight="bold" size="sm" style={themed($textAction)} text="New version" />
              </TouchableOpacity>
            </View>
            {detail.versions.map((candidate) => {
              const selected = candidate._id === version?._id
              const record = candidate.record
              const candidateRecord = record?.games
                ? `${record.wins}–${record.losses}${record.draws ? `–${record.draws}` : ""}`
                : "Unplayed"
              return (
                <TouchableOpacity
                  key={candidate._id}
                  testID={`version-picker-${candidate._id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={themed($versionRow)}
                  disabled={editing}
                  onPress={() => {
                    chooseVersion(candidate._id)
                    setDialog("none")
                  }}
                >
                  <View
                    testID={`version-marker-${candidate._id}`}
                    style={[themed($versionMark), selected && themed($versionMarkSelected)]}
                  />
                  <View style={themed($versionCopy)}>
                    <Text weight="medium" text={versionLabel(candidate)} />
                    {candidate.note ? (
                      <Text
                        size="xxs"
                        style={themed($dimmedText)}
                        text={candidate.note}
                        numberOfLines={2}
                      />
                    ) : null}
                  </View>
                  <View style={themed($versionContext)}>
                    <Text weight="medium" style={$tabularNumbers} text={candidateRecord} />
                    <Text
                      size="xxs"
                      style={themed($dimmedText)}
                      text={cardCountLabel(candidate.cardQuantity)}
                    />
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
          </View>
        </DeckSettingsDialog>
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

      {dialog === "discard" ? (
        <DialogCard
          visible
          onClose={() => {
            setPendingNavigation(undefined)
            setDialog("none")
          }}
          closeDisabled={busy}
          backdropTestID="discard-edits-backdrop"
          backdropAccessibilityLabel="Keep editing"
          dialogTestID="discard-edits-dialog"
          dialogAccessibilityRole="alert"
          accessibilityViewIsModal
        >
          <Text preset="subheading" text="Discard changes?" style={themed($dialogText)} />
          <Text size="sm" text="Your edits will be lost." style={themed($dialogText)} />
          <View style={themed($dialogActions)}>
            <Button
              text="Keep editing"
              style={themed($dialogButton)}
              disabled={busy}
              onPress={() => {
                setPendingNavigation(undefined)
                setDialog("none")
              }}
            />
            <Button
              text="Discard"
              testID="discard-edits-confirm"
              style={[themed($dialogButton), themed($destructiveButton)]}
              textStyle={themed($destructiveText)}
              disabled={busy}
              onPress={() => {
                setDialog("none")
                discardEdits()
              }}
            />
          </View>
        </DialogCard>
      ) : null}
    </Screen>
  )
}

const $tabularNumbers: TextStyle = { fontVariant: ["tabular-nums"] }

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $actionBar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.surface,
})

const $loadingContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  gap: spacing.sm,
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.lg,
})

const $queryFailure: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  alignItems: "flex-start",
})
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
const $versionHeading: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 36,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: spacing.sm,
})
const $textAction: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $versionRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 72,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xxs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $versionMark: ThemedStyle<ViewStyle> = () => ({
  width: 5,
  height: 34,
  borderRadius: 3,
})
const $versionMarkSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.gameMenu.actions.history,
})
const $versionCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, gap: spacing.xxxs })
const $versionContext: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 64,
  alignItems: "flex-end",
  gap: spacing.xxxs,
})
const $headerAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  height: 56,
  minWidth: 56,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.md,
})

const $actionRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.xs,
})
const $primaryActionButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minWidth: 160,
  minHeight: 44,
  paddingVertical: spacing.xs,
  borderRadius: 22,
  borderColor: colors.tint,
  backgroundColor: colors.tint,
})
const $primaryActionText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textInverse,
})

const $dimmedText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $destructiveButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.errorBackground,
  borderColor: colors.error,
  borderWidth: 1,
})
const $destructiveText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
