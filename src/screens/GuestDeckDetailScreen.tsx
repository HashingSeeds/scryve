import { useEffect, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { router } from "expo-router"
import { useConvexConnectionState } from "convex/react"

import { Button } from "@/components/Button"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { DeckActionsSheet, type DeckAction } from "@/components/DeckActionsSheet"
import { DeckSettingsDialog } from "@/components/DeckSettingsDialog"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { loadCardDetails } from "@/features/decks/cardDetailsCache"
import { getCommanderWarnings } from "@/features/decks/commanderSelection"
import { countCardChanges } from "@/features/decks/deckBuild"
import { cardDetailsKey, cardSection, printingKey } from "@/features/decks/deckCards"
import { canChooseCommander, isCommanderPick } from "@/features/decks/deckDraft"
import {
  useLocalDeckDraft,
  type LocalDeckDraft as GuestDraft,
} from "@/features/decks/deckDraftStore"
import { DeckStats } from "@/features/decks/DeckStats"
import { DeckView, type DeckMode } from "@/features/decks/DeckView"
import {
  deleteGuestDeck,
  loadGuestDeck,
  saveGuestDeck,
  useGuestDeck,
  type GuestDeckPayload,
} from "@/features/decks/guestDeck"
import { useLocalDeckSyncing } from "@/features/decks/localDeckSync"
import { forgetLocalDraft, keepLocalDraft, loadLocalDraft } from "@/features/decks/savedDeckDrafts"
import { useCardDetails } from "@/features/decks/useCardDetails"
import { useDeckKeyStats } from "@/features/decks/useDeckKeyStats"
import { useLocalDeckSyncAction } from "@/features/decks/useLocalDeckSyncAction"
import { localizedDeckSections } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { Id } from "../../convex/_generated/dataModel"
import { DEFAULT_DECK_GAME } from "../../convex/lib/deckGames"
import { picksCommander } from "../../convex/lib/systems"

type GuestDeckDetailScreenProps = {
  localId: string
  access?: CloudAccess
  onBack: () => void
  onSynced?: (deckId: Id<"decks">) => void
  onAddMatch?: (deckName: string) => void
}
type GuestCard = GuestDeckPayload["cards"][number]

function deckOf({ undo: _undo, commanderSelected: _selected, ...deck }: GuestDraft) {
  return deck
}

function sameDraft(a: GuestDraft | undefined, b: GuestDraft | undefined) {
  const contents = (draft: GuestDraft | undefined) =>
    draft && { ...deckOf(draft), cards: draft.cards.map((card) => JSON.stringify(card)).sort() }
  return JSON.stringify(contents(a)) === JSON.stringify(contents(b))
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
  const { draft, latest: draftRef, setDraft, edit } = useLocalDeckDraft({ localId })
  const revisionRef = useRef(
    restored?.revision ??
      (stored ? { localId: stored.localId, updatedAt: stored.updatedAt } : undefined),
  )
  const baseRef = useRef(restored?.base ?? stored?.deck)
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState(false)
  const [mode, setMode] = useState<DeckMode>(restored ? "build" : "play")
  const building = mode === "build"
  const [sheet, setSheet] = useState<"actions" | "settings">()
  const [deleting, setDeleting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const syncingElsewhere = useLocalDeckSyncing(localId)
  const deckSync = useLocalDeckSyncAction({
    access,
    localId,
    onSynced: (deckId) => onSynced?.(deckId),
    onSyncingChange: setSyncing,
  })
  const offline = useConvexConnectionState()?.isWebSocketConnected === false
  const [leaving, setLeaving] = useState(false)
  const [focusedKey, setFocusedKey] = useState<string>()
  // why: Play lists the saved deck, so a card focused there may already be gone from the draft.
  const focusedCard = (building ? (draft ?? stored?.deck) : (stored?.deck ?? draft))?.cards.find(
    (card) => printingKey(card) === focusedKey,
  )
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
  const currentCommander = building
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
      setDraft({ ...stored.deck, commanderSelected: draftRef.current?.commanderSelected })
      baseRef.current = stored.deck
      revisionRef.current = { localId: stored.localId, updatedAt: stored.updatedAt }
    } else if (!stored && sameDraft(draftRef.current, baseRef.current)) {
      setDraft(undefined)
      baseRef.current = undefined
      revisionRef.current = undefined
    }
  }, [draftRef, setDraft, stored])

  useEffect(() => {
    const base = baseRef.current
    const revision = revisionRef.current
    if (draft && base && revision && !sameDraft(draft, base))
      keepLocalDraft(localId, { deck: deckOf(draft), base, revision })
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

  const current: GuestDraft | undefined = draft ?? stored?.deck
  if (!current) return null
  const game = current.game ?? DEFAULT_DECK_GAME
  const rules = { game, format: current.format }
  const singleCommander = canChooseCommander(rules, current.cards)
  const cachedRules = current.commanderSelected ? loadCardDetails() : {}
  const commanderWarnings = current.commanderSelected
    ? getCommanderWarnings(current.cards, (card) => cachedRules[cardDetailsKey(card, game)])
    : []
  const sections = localizedDeckSections(game, current.format)
  const sectionLabel = (card: GuestCard) => {
    const id = card.section ?? card.board ?? "main"
    return sections.find((section) => section.id === id)?.label ?? id
  }

  const update = (changes: Partial<GuestDeckPayload>) =>
    setDraft({ ...(draftRef.current ?? current), ...changes })
  const addCard = (card: GuestCard) => edit({ type: "add", card }, rules)
  const removeCard = (card: GuestCard) => edit({ type: "remove", card }, rules)
  const chooseCommander = (color?: GuestCard["commanderColor"]) => {
    if (!focusedCard) return
    setFocusedKey(undefined)
    setError(edit({ type: "chooseCommander", card: focusedCard, details, color }, rules))
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
        { ...deckOf(current), name: current.name.trim() },
        { localId: revision.localId },
      )
      setDraft({ ...saved.deck, commanderSelected: current.commanderSelected })
      baseRef.current = saved.deck
      revisionRef.current = { localId: saved.localId, updatedAt: saved.updatedAt }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("decks:guestStorage.saveFailed"))
    }
  }

  const discard = () => {
    baseRef.current = stored?.deck
    revisionRef.current = stored
      ? { localId: stored.localId, updatedAt: stored.updatedAt }
      : undefined
    setDraft(stored?.deck)
    setError(undefined)
  }
  const base = baseRef.current
  const dirty = !sameDraft(current, base)
  const changes = dirty
    ? Math.max(
        1,
        countCardChanges(base?.cards ?? [], current.cards) +
          (["name", "format", "note"] as const).filter(
            (field) => (current[field] ?? "") !== (base?.[field] ?? ""),
          ).length,
      )
    : 0
  const savedDeck = stored?.deck ?? current
  const shown = building ? current : savedDeck
  const canSync = (access?.signedIn ?? Boolean(access?.ownerId)) && Boolean(onSynced)
  const deckActions: DeckAction[] = [
    {
      id: "details",
      label: translate("decks:actions.nameAndFormat"),
      onPress: () => setSheet("settings"),
    },
    ...(canSync
      ? [
          {
            id: "sync",
            label: translate("decks:actions.sync"),
            detail: deckSync.capacityLabel,
            blocked:
              !access?.ready || offline
                ? (access?.message ?? translate("account:cloud.reconnect"))
                : dirty
                  ? translate("decks:actions.saveFirst")
                  : undefined,
            onPress: () => {
              setSheet(undefined)
              deckSync.sync()
            },
          },
        ]
      : []),
    {
      id: "delete",
      label: translate("decks:actions.delete"),
      destructive: true,
      onPress: () => {
        setSheet(undefined)
        setDeleteRevision(revisionRef.current)
        setDeleting(true)
      },
    },
  ]

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={themed($screen)}
    >
      <DeckView
        mode={mode}
        onModeChange={setMode}
        guest
        name={shown.name}
        game={game}
        format={shown.format}
        cards={current.cards}
        savedCards={savedDeck.cards}
        note={current.note ?? ""}
        savedNote={savedDeck.note ?? ""}
        changes={changes}
        editingDisabled={syncing || syncingElsewhere}
        onStats={
          stored
            ? () =>
                router.push({
                  pathname: "/connected/decks/stats",
                  params: {
                    deckKey: stored.deckKey ?? stored.localId,
                    deckName: savedDeck.name,
                    game,
                    format: savedDeck.format,
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
          onAddMatch && access?.ready && stored ? () => onAddMatch(savedDeck.name) : undefined
        }
        onBack={onBack}
        onSave={save}
        onDiscard={discard}
        onDetails={() => setSheet("actions")}
        cardSearch={{ onAdd: addCard, onRemove: removeCard }}
        canChooseCommander={singleCommander}
        commanderWarnings={commanderWarnings}
        onNoteChange={(note) => edit({ type: "note", note }, rules)}
        onFocus={(card) => setFocusedKey(printingKey(card))}
        onIncrement={addCard}
        onDecrement={removeCard}
        onMove={(card) => setError(edit({ type: "move", card }, rules))}
        undo={
          current.undo
            ? { name: current.undo.name, restore: () => edit({ type: "undo" }, rules) }
            : undefined
        }
        error={
          <>
            {deckSync.busy ? <Text size="xs" tone="dim" tx="decks:localSync.syncing" /> : null}
            {deckSync.error ? (
              <Text accessibilityRole="alert" size="xs" text={deckSync.error} />
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
                  baseRef.current = latest.deck
                  revisionRef.current = { localId: latest.localId, updatedAt: latest.updatedAt }
                  setError(undefined)
                  setConflict(false)
                }}
              />
            ) : null}
          </>
        }
      />
      {sheet === "actions" ? (
        <DeckActionsSheet actions={deckActions} onClose={() => setSheet(undefined)} />
      ) : null}
      {sheet === "settings" ? (
        <DeckSettingsDialog
          game={game}
          initial={{ name: current.name, format: current.format }}
          onClose={() => setSheet(undefined)}
          onSubmit={(settingsChange) => {
            update(settingsChange)
            setSheet(undefined)
            setMode("build")
          }}
        />
      ) : null}
      {deckSync.dialogs}
      {focusedCard ? (
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
          onClose={() => setFocusedKey(undefined)}
          onSetCommander={building && singleCommander ? chooseCommander : undefined}
          {...(building
            ? {
                onIncrement: isCommanderPick(rules, focusedCard)
                  ? undefined
                  : () => addCard(focusedCard),
                onDecrement: () => {
                  if (focusedCard.quantity <= 1) setFocusedKey(undefined)
                  removeCard(focusedCard)
                },
              }
            : {})}
        />
      ) : null}
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
