import { useCallback, useEffect, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { router } from "expo-router"

import { Button } from "@/components/Button"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { DeckSettingsDialog } from "@/components/DeckSettingsDialog"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { loadCardDetails } from "@/features/decks/cardDetailsCache"
import { CardSearchScreen } from "@/features/decks/CardSearchScreen"
import { getCommanderWarnings, selectCommander } from "@/features/decks/commanderSelection"
import { cardDetailsKey, cardSection, printingKey } from "@/features/decks/deckCards"
import { addCommanderCard, canChooseCommander, isCommanderPick } from "@/features/decks/deckDraft"
import { DeckStats } from "@/features/decks/DeckStats"
import { DeckView, type DeckTab } from "@/features/decks/DeckView"
import {
  deleteGuestDeck,
  loadGuestDeck,
  saveGuestDeck,
  useGuestDeck,
  type GuestDeckPayload,
} from "@/features/decks/guestDeck"
import { useLocalDeckSyncing } from "@/features/decks/localDeckSync"
import { LocalDeckSyncAction } from "@/features/decks/LocalDeckSyncAction"
import { forgetLocalDraft, keepLocalDraft, loadLocalDraft } from "@/features/decks/savedDeckDrafts"
import { useCardDetails } from "@/features/decks/useCardDetails"
import { useDeckKeyStats } from "@/features/decks/useDeckKeyStats"
import { localizedDeckSections } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { Id } from "../../convex/_generated/dataModel"
import { DEFAULT_DECK_GAME } from "../../convex/lib/deckGames"
import { MAX_DECK_CARDS } from "../../convex/lib/policy"
import { picksCommander } from "../../convex/lib/systems"

type GuestDeckDetailScreenProps = {
  localId: string
  access?: CloudAccess
  onBack: () => void
  onSynced?: (deckId: Id<"decks">) => void
  onAddMatch?: (deckName: string) => void
}
type GuestCard = GuestDeckPayload["cards"][number]

function sameDraft(a: GuestDeckPayload | undefined, b: GuestDeckPayload | undefined) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function GuestDeckDetailScreen({
  localId,
  access,
  onBack,
  onSynced,
  onAddMatch,
}: GuestDeckDetailScreenProps) {
  const { themed, theme } = useAppTheme()
  const stored = useGuestDeck(localId)
  const [restored] = useState(() => (stored ? loadLocalDraft(localId) : undefined))
  const [draft, setDraftState] = useState<GuestDeckPayload | undefined>(
    () => restored?.deck ?? stored?.deck,
  )
  const draftRef = useRef(draft)
  const setDraft = useCallback((next: GuestDeckPayload | undefined) => {
    draftRef.current = next
    setDraftState(next)
  }, [])
  const revisionRef = useRef(
    restored?.revision ??
      (stored ? { localId: stored.localId, updatedAt: stored.updatedAt } : undefined),
  )
  const baseRef = useRef(restored?.base ?? stored?.deck)
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState(false)
  const [tab, setTab] = useState<DeckTab>("cards")
  const [editing, setEditing] = useState(restored !== undefined)
  const [settings, setSettings] = useState(false)
  const [undo, setUndo] = useState<{ name: string; cards: GuestCard[] }>()
  const [adding, setAdding] = useState(false)
  const [choosingCommander, setChoosingCommander] = useState(false)
  const [commanderSelected, setCommanderSelected] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const syncingElsewhere = useLocalDeckSyncing(localId)
  const [discarding, setDiscarding] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState<number>()
  const focusedCard =
    focusedIndex === undefined ? undefined : (draft ?? stored?.deck)?.cards[focusedIndex]
  const focusedGame = (draft ?? stored?.deck)?.game ?? DEFAULT_DECK_GAME
  const { details, detailsError, detailsRetryAfterMs, retryDetails } = useCardDetails(
    focusedCard
      ? {
          ...focusedCard,
          detailKey: cardDetailsKey(focusedCard, focusedGame),
          legacyDetailKey: `${focusedGame}:${printingKey(focusedCard)}`,
          game: focusedGame,
          catalogCardId: focusedCard.cardId ?? focusedCard.printingId ?? focusedCard.providerCardId,
        }
      : undefined,
    picksCommander(focusedGame, (draft ?? stored?.deck)?.format),
  )
  const currentCommander = editing
    ? (draft ?? stored?.deck)?.cards.find((card) => cardSection(card) === "commander")
    : undefined
  useCardDetails(
    currentCommander
      ? {
          ...currentCommander,
          detailKey: cardDetailsKey(currentCommander, focusedGame),
          game: focusedGame,
          catalogCardId:
            currentCommander.cardId ??
            currentCommander.printingId ??
            currentCommander.providerCardId,
        }
      : undefined,
    true,
  )
  const [deleteRevision, setDeleteRevision] = useState<typeof revisionRef.current>()
  useEffect(() => {
    if (stored && sameDraft(draftRef.current, baseRef.current)) {
      setDraft(stored.deck)
      baseRef.current = stored.deck
      revisionRef.current = { localId: stored.localId, updatedAt: stored.updatedAt }
    } else if (!stored && sameDraft(draftRef.current, baseRef.current)) {
      setDraft(undefined)
      baseRef.current = undefined
      revisionRef.current = undefined
    }
  }, [setDraft, stored])

  useEffect(() => {
    const base = baseRef.current
    const revision = revisionRef.current
    if (draft && base && revision && !sameDraft(draft, base))
      keepLocalDraft(localId, { deck: draft, base, revision })
    else forgetLocalDraft(localId)
  }, [draft, localId])

  useEffect(() => {
    if (leaving) onBack()
  }, [leaving, onBack])

  if (!stored && !draft) {
    return (
      <Screen
        preset="fixed"
        backgroundColor={theme.colors.surface}
        contentContainerStyle={themed($screen)}
      >
        <Header titleTx="decks:deckView.guestTitle" leftTx="common:back" onLeftPress={onBack} />
        <View style={themed($empty)}>
          <Text preset="subheading" tx="decks:guestDetail.unavailable" />
          <Text tx="decks:guestDetail.unavailableDetail" />
          <Button tx="common:back" onPress={onBack} />
        </View>
      </Screen>
    )
  }

  const current = draft ?? stored?.deck
  if (!current) return null
  const game = current.game ?? DEFAULT_DECK_GAME
  const rules = { game, format: current.format }
  const singleCommander = canChooseCommander(rules, current.cards)
  const cachedRules = commanderSelected ? loadCardDetails() : {}
  const commanderWarnings = commanderSelected
    ? getCommanderWarnings(current.cards, (card) => cachedRules[cardDetailsKey(card, game)])
    : []
  const sections = localizedDeckSections(game, current.format)
  const sectionLabel = (card: GuestCard) => {
    const id = card.section ?? card.board ?? "main"
    return sections.find((section) => section.id === id)?.label ?? id
  }

  const latest = () => draftRef.current ?? current
  const updateCard = (index: number, card: GuestCard | undefined) =>
    setDraft({
      ...latest(),
      cards: latest().cards.flatMap((entry, cardIndex) =>
        cardIndex === index && card ? [card] : cardIndex === index ? [] : [entry],
      ),
    })
  const update = (changes: Partial<GuestDeckPayload>) => setDraft({ ...latest(), ...changes })
  const chooseCommander = (color?: GuestCard["commanderColor"]) => {
    if (!focusedCard) return
    const cached = loadCardDetails()
    const result = selectCommander(
      current.cards,
      printingKey(focusedCard),
      (card) => (card === focusedCard ? details : cached[cardDetailsKey(card, game)]),
      color,
    )
    setFocusedIndex(undefined)
    if ("error" in result) {
      setError(result.error)
      return
    }
    setError(undefined)
    setUndo(undefined)
    update({ cards: result.cards })
    setCommanderSelected(true)
  }
  const save = () => {
    setError(undefined)
    setConflict(false)
    if (!current.name.trim()) {
      setError(translate("decks:guestDetail.nameRequired"))
      return
    }
    const latest = loadGuestDeck(localId)
    const revision = revisionRef.current
    if (
      !latest ||
      !revision ||
      latest.localId !== revision.localId ||
      latest.updatedAt !== revision.updatedAt
    ) {
      setError(translate("decks:guestDetail.changedBeforeSave"))
      setConflict(true)
      return
    }
    try {
      const saved = saveGuestDeck(
        { ...current, name: current.name.trim() },
        { localId: revision.localId },
      )
      setEditing(false)
      setUndo(undefined)
      setDraft(saved.deck)
      baseRef.current = saved.deck
      revisionRef.current = { localId: saved.localId, updatedAt: saved.updatedAt }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("decks:guestStorage.saveFailed"))
    }
  }

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
        guest
        name={current.name}
        game={game}
        format={current.format}
        cards={current.cards}
        note={current.note ?? ""}
        editing={editing}
        editingDisabled={syncing || syncingElsewhere}
        onStats={
          stored
            ? () =>
                router.push({
                  pathname: "/connected/decks/stats",
                  params: {
                    deckKey: stored.deckKey ?? stored.localId,
                    deckName: current.name,
                    game,
                    format: current.format,
                  },
                })
            : undefined
        }
        statsContent={
          access?.ready && stored ? (
            <ConvexQueryBoundary key={access.ownerId} fallback={() => null}>
              <LocalDeckStats deckKey={stored.deckKey ?? stored.localId} />
            </ConvexQueryBoundary>
          ) : undefined
        }
        onAddMatch={
          onAddMatch && access?.ready && stored && !editing
            ? () => onAddMatch(current.name)
            : undefined
        }
        dirty={!sameDraft(current, baseRef.current)}
        onBack={onBack}
        onEdit={() => setEditing(true)}
        onSave={save}
        onCancel={() => {
          if (!sameDraft(current, baseRef.current)) setDiscarding(true)
          else setEditing(false)
        }}
        onDetails={() => setSettings(true)}
        onAdd={() => {
          setEditing(true)
          setChoosingCommander(false)
          setAdding(true)
        }}
        onChooseCommander={
          singleCommander
            ? () => {
                setEditing(true)
                setChoosingCommander(true)
                setAdding(true)
              }
            : undefined
        }
        commanderWarnings={commanderWarnings}
        onNoteChange={(note) => update({ note })}
        onFocus={(card) => setFocusedIndex(current.cards.indexOf(card))}
        onIncrement={(card) => {
          setUndo(undefined)
          updateCard(current.cards.indexOf(card), {
            ...card,
            quantity: Math.min(999, card.quantity + 1),
          })
        }}
        onDecrement={(card) => {
          if (card.quantity === 1) setUndo({ name: card.name, cards: current.cards })
          else setUndo(undefined)
          updateCard(
            current.cards.indexOf(card),
            card.quantity > 1 ? { ...card, quantity: card.quantity - 1 } : undefined,
          )
        }}
        undo={
          undo
            ? {
                name: undo.name,
                restore: () => {
                  update({ cards: undo.cards })
                  setUndo(undefined)
                },
              }
            : undefined
        }
        error={
          <>
            {(access?.signedIn ?? Boolean(access?.ownerId)) && onSynced ? (
              <LocalDeckSyncAction
                access={access}
                localId={localId}
                disabled={editing || !sameDraft(current, baseRef.current)}
                onSynced={onSynced}
                onSyncingChange={setSyncing}
              />
            ) : null}
            {error ? <Text testID="guest-deck-error" style={themed($error)} text={error} /> : null}
            {conflict ? (
              <Button
                testID="guest-deck-reload"
                tx="decks:guestDetail.reload"
                onPress={() => {
                  const latest = loadGuestDeck(localId)
                  if (!latest) return
                  setDraft(latest.deck)
                  setCommanderSelected(false)
                  baseRef.current = latest.deck
                  revisionRef.current = { localId: latest.localId, updatedAt: latest.updatedAt }
                  setError(undefined)
                  setConflict(false)
                  setUndo(undefined)
                  setEditing(false)
                }}
              />
            ) : null}
          </>
        }
      />
      {settings ? (
        <DeckSettingsDialog
          game={game}
          initial={{ name: current.name, format: current.format }}
          onClose={() => setSettings(false)}
          onSubmit={(changes) => {
            update(changes)
            setSettings(false)
            setEditing(true)
          }}
          onDelete={() => {
            setSettings(false)
            setDeleteRevision(revisionRef.current)
            setDeleting(true)
          }}
        />
      ) : null}
      {adding ? (
        <CardSearchScreen
          game={game}
          format={current.format}
          initialSection={choosingCommander ? "commander" : undefined}
          commanderCards={current.cards}
          onClose={() => setAdding(false)}
          onRemove={(card) => {
            const { cards } = latest()
            const index = cards.findIndex((entry) => printingKey(entry) === printingKey(card))
            const entry = cards[index]
            if (!entry) return
            updateCard(
              index,
              entry.quantity > 1 ? { ...entry, quantity: entry.quantity - 1 } : undefined,
            )
          }}
          onAdd={(card) => {
            setUndo(undefined)
            const { cards } = latest()
            if (isCommanderPick(rules, card)) {
              const cached = loadCardDetails()
              const result = addCommanderCard(
                cards,
                card,
                (entry) => cached[cardDetailsKey(entry, game)],
              )
              if ("error" in result) return result.error
              update({ cards: result.cards })
              setCommanderSelected(true)
              if (choosingCommander) setAdding(false)
              return undefined
            }
            const index = cards.findIndex((entry) => printingKey(entry) === printingKey(card))
            if (index >= 0) {
              const entry = cards[index]
              if (entry.quantity >= 999) return translate("decks:draft.copyLimit", { limit: 999 })
              updateCard(index, { ...entry, quantity: entry.quantity + 1 })
            } else {
              if (cards.length >= MAX_DECK_CARDS)
                return translate("decks:draft.entryLimit", { limit: MAX_DECK_CARDS })
              update({ cards: [...cards, card] })
            }
            return undefined
          }}
        />
      ) : null}
      {focusedCard && focusedIndex !== undefined ? (
        <CardFocusDialog
          key={printingKey(focusedCard)}
          card={{
            game,
            cardId:
              focusedCard.scryfallId ??
              focusedCard.cardId ??
              focusedCard.printingId ??
              focusedCard.providerCardId,
            name: focusedCard.name,
            imageUrl: focusedCard.imageUrl,
            smallImageUrl: focusedCard.smallImageUrl,
            quantity: focusedCard.quantity,
            boardLabel: sectionLabel(focusedCard),
            commanderColor: focusedCard.commanderColor,
          }}
          details={details}
          detailsError={detailsError}
          detailsRetryAfterMs={detailsRetryAfterMs}
          onRetryDetails={retryDetails}
          onClose={() => setFocusedIndex(undefined)}
          onSetCommander={editing && singleCommander ? chooseCommander : undefined}
          {...(editing
            ? {
                onIncrement: isCommanderPick(rules, focusedCard)
                  ? undefined
                  : () =>
                      updateCard(focusedIndex, {
                        ...focusedCard,
                        quantity: Math.min(999, focusedCard.quantity + 1),
                      }),
                onDecrement: () => {
                  if (focusedCard.quantity <= 1) setFocusedIndex(undefined)
                  updateCard(
                    focusedIndex,
                    focusedCard.quantity > 1
                      ? { ...focusedCard, quantity: focusedCard.quantity - 1 }
                      : undefined,
                  )
                },
              }
            : {})}
        />
      ) : null}
      <ConfirmDialog
        visible={discarding}
        title={translate("decks:detail.discardTitle")}
        backdropAccessibilityLabel={translate("decks:detail.cancelDiscard")}
        message={translate("decks:detail.discardBody")}
        confirmText={translate("decks:detail.discard")}
        cancelText={translate("decks:detail.keepEditing")}
        destructive
        confirmTestID="guest-deck-discard-confirm"
        onClose={() => setDiscarding(false)}
        onConfirm={() => {
          baseRef.current = stored?.deck
          revisionRef.current = stored
            ? { localId: stored.localId, updatedAt: stored.updatedAt }
            : undefined
          setDraft(stored?.deck)
          setCommanderSelected(false)
          setEditing(false)
          setUndo(undefined)
          setDiscarding(false)
        }}
      />
      <ConfirmDialog
        visible={deleting}
        title={translate("decks:guestDetail.deleteTitle")}
        backdropAccessibilityLabel={translate("decks:guestDetail.cancelDelete")}
        message={translate("decks:guestDetail.deleteBody")}
        confirmText={translate("common:delete")}
        destructive
        cancelTestID="confirm-dialog-cancel"
        confirmTestID="guest-deck-confirm-delete"
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          try {
            const latest = loadGuestDeck(localId)
            if (
              !latest ||
              !deleteRevision ||
              latest.localId !== deleteRevision.localId ||
              latest.updatedAt !== deleteRevision.updatedAt
            ) {
              setError(translate("decks:guestDetail.changedBeforeDelete"))
              setConflict(true)
              setDeleting(false)
              return
            }
            deleteGuestDeck(localId)
            forgetLocalDraft(localId)
            setLeaving(true)
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : translate("decks:guestStorage.deleteFailed"),
            )
            setDeleting(false)
          }
        }}
      />
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.surface,
})
const $empty: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.sm,
  padding: spacing.lg,
})
const $error: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })

function LocalDeckStats({ deckKey }: { deckKey: string }) {
  const record = useDeckKeyStats(deckKey, true)
  return record ? <DeckStats record={record} /> : null
}
