import { useEffect, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { useNavigation } from "expo-router"
import { usePreventRemove } from "expo-router/react-navigation"

import { Button } from "@/components/Button"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { DeckSettingsDialog } from "@/components/DeckSettingsDialog"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { CardSearchScreen } from "@/features/decks/CardSearchScreen"
import { printingKey } from "@/features/decks/deckCards"
import { DeckView } from "@/features/decks/DeckView"
import {
  deleteGuestDeck,
  loadGuestDeck,
  saveGuestDeck,
  useGuestDeck,
  type GuestDeckPayload,
} from "@/features/decks/guestDeck"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { DEFAULT_DECK_GAME, deckSections } from "../../convex/lib/deckGames"
import { MAX_DECK_CARDS } from "../../convex/lib/policy"

type GuestDeckDetailScreenProps = { onBack: () => void }
type GuestCard = GuestDeckPayload["cards"][number]

function sameDraft(a: GuestDeckPayload | undefined, b: GuestDeckPayload | undefined) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function GuestDeckDetailScreen({ onBack }: GuestDeckDetailScreenProps) {
  const { themed, theme } = useAppTheme()
  const navigation = useNavigation()
  const stored = useGuestDeck()
  const [draft, setDraft] = useState<GuestDeckPayload | undefined>(() => stored?.deck)
  const revisionRef = useRef(
    stored ? { localId: stored.localId, updatedAt: stored.updatedAt } : undefined,
  )
  const baseRef = useRef(stored?.deck)
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState(false)
  const [tab, setTab] = useState<"cards" | "notes">("cards")
  const [editing, setEditing] = useState(false)
  const [settings, setSettings] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [undo, setUndo] = useState<{ name: string; cards: GuestCard[] }>()
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [pendingNavigation, setPendingNavigation] =
    useState<Parameters<typeof navigation.dispatch>[0]>()
  const [focusedIndex, setFocusedIndex] = useState<number>()
  const [deleteRevision, setDeleteRevision] = useState<typeof revisionRef.current>()
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])

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
  }, [stored])

  usePreventRemove(!leaving && !sameDraft(draft, baseRef.current), ({ data }) => {
    setPendingNavigation(data.action)
    setDiscarding(true)
  })

  useEffect(() => {
    if (!leaving) return
    if (pendingNavigation) navigation.dispatch(pendingNavigation)
    else onBack()
  }, [leaving, navigation, onBack, pendingNavigation])

  if (!stored && !draft) {
    return (
      <Screen
        preset="fixed"
        backgroundColor={theme.colors.surface}
        contentContainerStyle={themed($screen)}
      >
        <Header
          title="Guest deck"
          leftTx="common:back"
          onLeftPress={() => (sameDraft(draft, baseRef.current) ? onBack() : setDiscarding(true))}
        />
        <View style={themed($empty)}>
          <Text preset="subheading" text="Guest deck unavailable" />
          <Text text="This deck was deleted or has not been saved yet." />
          <Button text="Back" onPress={onBack} />
        </View>
      </Screen>
    )
  }

  const current = draft ?? stored?.deck
  if (!current) return null
  const game = current.game ?? DEFAULT_DECK_GAME
  const sections = deckSections(game, current.format)
  const sectionLabel = (card: GuestCard) => {
    const id = card.section ?? card.board ?? "main"
    return sections.find((section) => section.id === id)?.label ?? id
  }

  const updateCard = (index: number, card: GuestCard | undefined) =>
    setDraft({
      ...current,
      cards: current.cards.flatMap((entry, cardIndex) =>
        cardIndex === index && card ? [card] : cardIndex === index ? [] : [entry],
      ),
    })
  const update = (changes: Partial<GuestDeckPayload>) => setDraft({ ...current, ...changes })
  const focusedCard = focusedIndex === undefined ? undefined : current.cards[focusedIndex]
  const save = () => {
    setError(undefined)
    setConflict(false)
    if (!current.name.trim()) {
      setError("Enter a deck name.")
      return
    }
    const latest = loadGuestDeck()
    const revision = revisionRef.current
    if (
      !latest ||
      !revision ||
      latest.localId !== revision.localId ||
      latest.updatedAt !== revision.updatedAt
    ) {
      setError("This deck changed elsewhere. Reload it before saving.")
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
      setError(cause instanceof Error ? cause.message : "Unable to save guest deck.")
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
        dirty={!sameDraft(current, baseRef.current)}
        onBack={() => (sameDraft(current, baseRef.current) ? onBack() : setDiscarding(true))}
        onEdit={() => setEditing(true)}
        onSave={save}
        onCancel={() => {
          if (!sameDraft(current, baseRef.current)) {
            setCancelling(true)
            setDiscarding(true)
          } else setEditing(false)
        }}
        onDetails={() => setSettings(true)}
        onAdd={() => {
          setEditing(true)
          setAdding(true)
        }}
        onNoteChange={(note) => update({ note })}
        onFocus={(card) => setFocusedIndex(current.cards.indexOf(card))}
        onIncrement={(card) => {
          setUndo(undefined)
          updateCard(current.cards.indexOf(card), { ...card, quantity: card.quantity + 1 })
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
            {error ? <Text testID="guest-deck-error" style={themed($error)} text={error} /> : null}
            {conflict ? (
              <Button
                testID="guest-deck-reload"
                text="Reload saved deck"
                onPress={() => {
                  const latest = loadGuestDeck()
                  if (!latest) return
                  setDraft(latest.deck)
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
          onClose={() => setAdding(false)}
          onAdd={(card) => {
            setUndo(undefined)
            const index = current.cards.findIndex(
              (entry) => printingKey(entry) === printingKey(card),
            )
            if (index >= 0) {
              const entry = current.cards[index]
              if (entry.quantity >= 999) return "A card can have at most 999 copies."
              updateCard(index, { ...entry, quantity: entry.quantity + 1 })
            } else {
              if (current.cards.length >= MAX_DECK_CARDS)
                return `A deck can have at most ${MAX_DECK_CARDS} entries.`
              update({ cards: [...current.cards, card] })
            }
            return undefined
          }}
        />
      ) : null}
      {focusedCard && focusedIndex !== undefined ? (
        <CardFocusDialog
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
          }}
          details={{
            imageUrl: focusedCard.imageUrl,
            smallImageUrl: focusedCard.smallImageUrl,
            typeLine: sectionLabel(focusedCard),
          }}
          onClose={() => setFocusedIndex(undefined)}
          {...(editing
            ? {
                onIncrement: () =>
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
        title="Discard changes?"
        message="Your edits will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        destructive
        confirmTestID="guest-deck-discard-confirm"
        onClose={() => {
          setPendingNavigation(undefined)
          setCancelling(false)
          setDiscarding(false)
        }}
        onConfirm={() => {
          if (cancelling) {
            setDraft(baseRef.current)
            setEditing(false)
            setUndo(undefined)
            setDiscarding(false)
            setCancelling(false)
          } else setLeaving(true)
        }}
      />
      <ConfirmDialog
        visible={deleting}
        title="Delete guest deck?"
        message="This removes the deck from this device."
        confirmText="Delete"
        destructive
        cancelTestID="confirm-dialog-cancel"
        confirmTestID="guest-deck-confirm-delete"
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          try {
            const latest = loadGuestDeck()
            if (
              !latest ||
              !deleteRevision ||
              latest.localId !== deleteRevision.localId ||
              latest.updatedAt !== deleteRevision.updatedAt
            ) {
              setError("This deck changed elsewhere. Reload it before deleting.")
              setConflict(true)
              setDeleting(false)
              return
            }
            deleteGuestDeck()
            setLeaving(true)
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Unable to delete guest deck.")
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
