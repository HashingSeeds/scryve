import { useEffect, useRef, useState } from "react"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"
import { Image } from "expo-image"
import { useNavigation } from "expo-router"
import { usePreventRemove } from "expo-router/react-navigation"

import { Button } from "@/components/Button"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import {
  deleteGuestDeck,
  loadGuestDeck,
  saveGuestDeck,
  useGuestDeck,
  type GuestDeckPayload,
} from "@/features/decks/guestDeck"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import {
  DEFAULT_DECK_GAME,
  DECK_GAME_LIST,
  deckFormatLabel,
  deckGame,
  deckSections,
} from "../../convex/lib/deckGames"

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
      backgroundColor={theme.colors.surface}
      contentContainerStyle={themed($screen)}
    >
      <Header
        title="Guest deck"
        leftTx="common:back"
        onLeftPress={() => (sameDraft(draft, baseRef.current) ? onBack() : setDiscarding(true))}
      />
      <ScrollView contentContainerStyle={themed($content)}>
        <TextField
          testID="guest-deck-name"
          label="Name"
          value={current.name}
          onChangeText={(name) => update({ name })}
        />
        <Text
          size="sm"
          style={themed($metadata)}
          text={[
            deckGame(game)?.shortLabel ??
              DECK_GAME_LIST.find((item) => item.id === game)?.shortLabel ??
              game,
            deckFormatLabel(game, current.format),
          ].join(" · ")}
        />
        <TextField
          testID="guest-deck-notes"
          label="Notes"
          multiline
          value={current.note ?? ""}
          onChangeText={(note) => update({ note })}
        />
        <View style={themed($cards)}>
          <Text
            preset="subheading"
            text={`Cards (${current.cards.reduce((total, card) => total + card.quantity, 0)})`}
          />
          {current.cards.map((card, index) => (
            <View
              key={`${card.name}-${index}`}
              testID={`guest-card-${index}`}
              style={themed($card)}
            >
              {card.smallImageUrl || card.imageUrl ? (
                <TouchableOpacity
                  testID={`guest-card-${index}-image`}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${card.name}`}
                  onPress={() => setFocusedIndex(index)}
                >
                  <Image
                    testID={`guest-card-${index}-thumbnail`}
                    source={card.smallImageUrl ?? card.imageUrl}
                    accessibilityLabel={card.name}
                    style={$cardImage}
                    contentFit="contain"
                  />
                </TouchableOpacity>
              ) : null}
              <View style={themed($cardCopy)}>
                <Text weight="medium" text={card.name} />
                <Text size="sm" style={themed($metadata)} text={sectionLabel(card)} />
              </View>
              <Button
                testID={`guest-card-${index}-decrease`}
                text="−"
                accessibilityLabel={`Decrease ${card.name}`}
                onPress={() =>
                  card.quantity > 1
                    ? updateCard(index, { ...card, quantity: card.quantity - 1 })
                    : updateCard(index, undefined)
                }
              />
              <Text accessibilityLabel={`${card.name} quantity`} text={String(card.quantity)} />
              <Button
                testID={`guest-card-${index}-increase`}
                text="+"
                accessibilityLabel={`Increase ${card.name}`}
                disabled={card.quantity >= 999}
                onPress={() => updateCard(index, { ...card, quantity: card.quantity + 1 })}
              />
            </View>
          ))}
        </View>
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
            }}
          />
        ) : null}
        <Button testID="guest-deck-save" preset="reversed" text="Save" onPress={save} />
        <Button
          testID="guest-deck-delete"
          text="Delete deck"
          onPress={() => {
            setDeleteRevision(revisionRef.current)
            setDeleting(true)
          }}
        />
      </ScrollView>
      {focusedCard && focusedIndex !== undefined ? (
        <CardFocusDialog
          card={{
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
          onIncrement={() =>
            updateCard(focusedIndex, { ...focusedCard, quantity: focusedCard.quantity + 1 })
          }
          onDecrement={() => {
            if (focusedCard.quantity <= 1) setFocusedIndex(undefined)
            updateCard(
              focusedIndex,
              focusedCard.quantity > 1
                ? { ...focusedCard, quantity: focusedCard.quantity - 1 }
                : undefined,
            )
          }}
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
          setDiscarding(false)
        }}
        onConfirm={() => setLeaving(true)}
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
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm, padding: spacing.md })
const $empty: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.sm,
  padding: spacing.lg,
})
const $cards: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs, marginTop: spacing.sm })
const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  borderBottomColor: colors.border,
  borderBottomWidth: 1,
  flexDirection: "row",
  gap: spacing.xs,
  paddingVertical: spacing.xs,
})
const $cardCopy: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $cardImage: ImageStyle = { height: 56, width: 40 }
const $metadata: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $error: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
