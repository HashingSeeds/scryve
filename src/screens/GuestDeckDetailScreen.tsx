import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { router, useFocusEffect } from "expo-router"
import { useConvexConnectionState, useQuery } from "convex/react"

import { Button } from "@/components/Button"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { DeckActionsSheet, type DeckAction } from "@/components/DeckActionsSheet"
import { DeckSettingsDialog } from "@/components/DeckSettingsDialog"
import type { DeckVersionDraft } from "@/components/DeckVersionDialog"
import { Header, HeaderIcon } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useSheetPresence } from "@/components/useSheetPresence"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { loadCardDetails } from "@/features/decks/cardDetailsCache"
import { getCommanderWarnings } from "@/features/decks/commanderSelection"
import { countCardChanges } from "@/features/decks/deckBuild"
import { cardDetailsKey, cardSection, printingKey } from "@/features/decks/deckCards"
import { cardCountLabel, deckVersionLabel, versionTitle } from "@/features/decks/deckCopy"
import { canChooseCommander, isCommanderPick } from "@/features/decks/deckDraft"
import {
  useLocalDeckDraft,
  type LocalDeckDraft as GuestDraft,
} from "@/features/decks/deckDraftStore"
import { DeckPlay } from "@/features/decks/DeckPlay"
import { DeckVersionsDialogs } from "@/features/decks/DeckVersionsDialogs"
import { DeckView, type DeckMode } from "@/features/decks/DeckView"
import {
  addGuestDeckVersion,
  deleteGuestDeck,
  deleteGuestDeckVersion,
  guestDeckBringing,
  guestDeckRouteId,
  guestDeckVersions,
  loadGuestDeck,
  saveGuestDeck,
  setGuestDeckBringing,
  updateGuestDeckVersion,
  useGuestDeck,
  type GuestDeck,
  type GuestDeckPayload,
} from "@/features/decks/guestDeck"
import { useLocalDeckSyncing, versionLimitMessage } from "@/features/decks/localDeckSync"
import { useMatchSideboard } from "@/features/decks/matchSideboard"
import {
  forgetLocalDraft,
  keepLocalDraft,
  loadLocalDraft,
  type SavedLocalDraft,
} from "@/features/decks/savedDeckDrafts"
import { SideboardSwapSheet } from "@/features/decks/SideboardSwapSheet"
import { useCardDetails } from "@/features/decks/useCardDetails"
import { useLocalDeckSyncAction } from "@/features/decks/useLocalDeckSyncAction"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { localizedDeckSections } from "@/features/game/playSystems"
import type { LocalGame } from "@/features/game/types"
import { statsDate } from "@/features/stats/DeckStatsParts"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { DEFAULT_DECK_GAME } from "../../convex/lib/deckGames"
import { FREE_DECK_VERSIONS, MAX_DECK_VERSIONS } from "../../convex/lib/policy"
import { picksCommander, tracksResults } from "../../convex/lib/systems"

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

function versionList(stored: GuestDeck, number: number): GuestDeckPayload {
  const version = guestDeckVersions(stored).find((candidate) => candidate.number === number)
  return { ...stored.deck, cards: version?.cards ?? stored.deck.cards }
}

function cardQuantity(cards: GuestDeckPayload["cards"]) {
  return cards.reduce((total, card) => total + card.quantity, 0)
}

function keepDraft(
  localId: string,
  draft: GuestDraft | undefined,
  base: GuestDeckPayload | undefined,
  revision: SavedLocalDraft["revision"] | undefined,
  version: number,
) {
  if (draft && base && revision && !sameDraft(draft, base))
    keepLocalDraft(localId, { deck: deckOf(draft), base, revision, version })
  else forgetLocalDraft(localId)
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
  const {
    draft,
    latest: draftRef,
    setDraft,
    edit,
    subscribe: subscribeDraft,
  } = useLocalDeckDraft({ localId })
  const versions = useMemo(() => (stored ? guestDeckVersions(stored) : []), [stored])
  const latestNumber = versions.at(-1)?.number ?? 1
  const [chosen, setChosen] = useState(restored?.version)
  const active = versions.find((version) => version.number === chosen) ?? versions.at(-1)
  const activeNumber = active?.number ?? latestNumber
  const saved = useMemo(
    () => (stored ? versionList(stored, activeNumber) : undefined),
    [stored, activeNumber],
  )
  const revisionRef = useRef(
    restored?.revision ??
      (stored ? { localId: stored.localId, updatedAt: stored.updatedAt } : undefined),
  )
  const baseRef = useRef(restored?.base ?? saved)
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState(false)
  const [mode, setMode] = useState<DeckMode>(restored ? "build" : "play")
  const building = mode === "build"
  const [sheet, setSheet] = useState<
    | "actions"
    | "settings"
    | "sideboard"
    | "versions"
    | "newVersion"
    | "renameVersion"
    | "deleteVersion"
  >()
  const sheets = useSheetPresence(sheet, (open) => open !== "deleteVersion")
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
  const entitlements = useQuery(api.entitlements.current, access?.ready ? {} : "skip")
  const pro = entitlements?.deckVersions === true
  const versionLimit = pro ? MAX_DECK_VERSIONS : FREE_DECK_VERSIONS
  const [activeGame, setActiveGame] = useState<LocalGame | null>(null)
  useFocusEffect(useCallback(() => setActiveGame(new LocalGameRepository().loadActiveGame()), []))
  const deckKey = stored && (stored.deckKey ?? stored.localId)
  const sideboard = useMatchSideboard(
    deckKey !== undefined && activeGame?.account?.deckKey === deckKey ? activeGame : undefined,
    { game: (draft ?? stored?.deck)?.game ?? DEFAULT_DECK_GAME, format: saved?.format },
  )
  const [leaving, setLeaving] = useState(false)
  const [focusedKey, setFocusedKey] = useState<string>()
  const focus = useSheetPresence(focusedKey)
  const focusedCard = (draft ?? stored?.deck)?.cards.find(
    (card) => printingKey(card) === focus.shown,
  )
  // why: a details sheet whose card vanished can't animate out, so its request goes with it.
  useEffect(() => {
    if (focus.shown && !focusedCard) setFocusedKey(undefined)
  }, [focus.shown, focusedCard])
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
    if (stored && saved && sameDraft(draftRef.current, baseRef.current)) {
      setDraft({ ...saved, commanderSelected: draftRef.current?.commanderSelected })
      baseRef.current = saved
      revisionRef.current = { localId: stored.localId, updatedAt: stored.updatedAt }
    } else if (!stored && sameDraft(draftRef.current, baseRef.current)) {
      setDraft(undefined)
      baseRef.current = undefined
      revisionRef.current = undefined
    }
  }, [draftRef, setDraft, saved, stored])

  useEffect(() => {
    keepDraft(localId, draft, baseRef.current, revisionRef.current, activeNumber)
  }, [activeNumber, draft, localId])

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
        <Header
          titleTx="decks:deckView.guestTitle"
          LeftActionComponent={
            <HeaderIcon icon="back" label={translate("common:back")} onPress={onBack} />
          }
        />
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
  // why: /cards edits the draft while this screen is frozen, and the persist effect waits until it shows again.
  const keepSearchEdit = <Result,>(result: Result) => {
    keepDraft(localId, draftRef.current, baseRef.current, revisionRef.current, activeNumber)
    return result
  }
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
      const list = { ...deckOf(current), name: current.name.trim() }
      const written = saveGuestDeck(list, { localId: revision.localId, version: activeNumber })
      setDraft({ ...list, commanderSelected: current.commanderSelected })
      baseRef.current = list
      revisionRef.current = { localId: written.localId, updatedAt: written.updatedAt }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("decks:guestStorage.saveFailed"))
    }
  }

  const discard = () => {
    baseRef.current = saved
    revisionRef.current = stored
      ? { localId: stored.localId, updatedAt: stored.updatedAt }
      : undefined
    setDraft(saved)
    setError(undefined)
  }
  const versionAction = (run: () => void, failure: string) => {
    setError(undefined)
    try {
      run()
      setSheet(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure)
    }
  }
  const startNewVersion = () => {
    setError(undefined)
    if (versions.length >= versionLimit) {
      setError(translate("decks:detail.versionLimit", { count: versionLimit }))
      return
    }
    setSheet("newVersion")
  }
  const createVersion = ({ name, note, copyCards }: DeckVersionDraft) =>
    versionAction(() => {
      const next = addGuestDeckVersion(
        localId,
        { name, note, cards: copyCards ? (saved?.cards ?? []) : [] },
        versionLimit,
      )
      setChosen(next.versions?.at(-1)?.number)
    }, translate("decks:detail.createVersionFailed"))
  const renameVersion = (details: DeckVersionDraft) =>
    versionAction(
      () => updateGuestDeckVersion(localId, activeNumber, details),
      translate("decks:detail.updateVersionFailed"),
    )
  const deleteVersion = () =>
    versionAction(() => {
      deleteGuestDeckVersion(localId, activeNumber)
      setChosen(undefined)
    }, translate("decks:detail.deleteVersionFailed"))
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
  const savedDeck = saved ?? current
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
                  : entitlements && stored?.versions && versions.length > versionLimit
                    ? versionLimitMessage({
                        versions: versions.length,
                        limit: versionLimit,
                        premium: pro,
                      })
                    : undefined,
            onPress: () => {
              setSheet(undefined)
              deckSync.sync()
            },
          },
        ]
      : []),
    ...(sideboard?.canSwap
      ? [
          {
            id: "sideboard",
            label: translate("decks:sideboard.open"),
            onPress: () => setSheet("sideboard"),
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
        changes={changes}
        editingDisabled={syncing || syncingElsewhere}
        version={
          active && {
            label: versionTitle({ ...active, versionNumber: active.number }, latestNumber),
            latest: active.number === latestNumber,
          }
        }
        onVersions={() => {
          setError(undefined)
          setSheet("versions")
        }}
        play={
          <DeckPlay
            versions={versions.map((version) => ({
              id: String(version.number),
              label: versionTitle({ ...version, versionNumber: version.number }, latestNumber),
              detail: [statsDate(version.updatedAt), cardCountLabel(cardQuantity(version.cards))]
                .filter(Boolean)
                .join(" · "),
            }))}
            bringingId={stored ? String(guestDeckBringing(stored)) : undefined}
            bringDisabled={syncing || syncingElsewhere}
            onBring={(number) => {
              try {
                setGuestDeckBringing(localId, Number(number))
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : translate("decks:play.bringFailed"),
                )
              }
            }}
            match={
              sideboard && {
                pool: sideboard.pool,
                swaps: sideboard.swaps,
                ...(sideboard.canSwap
                  ? {
                      onSideboard: () => setSheet("sideboard"),
                      onReset: () => sideboard.apply({ in: [], out: [] }),
                    }
                  : {}),
              }
            }
            tracked={tracksResults(game)}
            deckKey={stored && (stored.deckKey ?? stored.localId)}
            ready={Boolean(access?.ready)}
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
          />
        }
        onStartGame={
          stored
            ? () =>
                router.push({
                  pathname: "/game/new",
                  params: { deckId: guestDeckRouteId(stored.localId) },
                })
            : undefined
        }
        onAddMatch={
          onAddMatch && access?.ready && stored ? () => onAddMatch(savedDeck.name) : undefined
        }
        onBack={onBack}
        onSave={save}
        onDiscard={discard}
        onDetails={() => setSheet("actions")}
        cardSearch={{
          deckId: guestDeckRouteId(localId),
          onAdd: (card) => keepSearchEdit(addCard(card)),
          onRemove: (card) => keepSearchEdit(removeCard(card)),
          cards: () => (draftRef.current ?? current).cards,
          subscribe: subscribeDraft,
        }}
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
                  const list = versionList(latest, activeNumber)
                  setDraft(list)
                  baseRef.current = list
                  revisionRef.current = { localId: latest.localId, updatedAt: latest.updatedAt }
                  setError(undefined)
                  setConflict(false)
                }}
              />
            ) : null}
          </>
        }
      />
      {sheets.shown === "actions" ? (
        <DeckActionsSheet
          visible={sheets.visible}
          actions={deckActions}
          onClose={() => setSheet(undefined)}
          onDismissed={sheets.onDismissed}
        />
      ) : null}
      {sheets.shown === "sideboard" && sideboard ? (
        <SideboardSwapSheet
          visible={sheets.visible}
          onDismissed={sheets.onDismissed}
          pool={sideboard.pool}
          swaps={sideboard.swaps}
          onApply={(swaps) => {
            sideboard.apply(swaps)
            setSheet(undefined)
          }}
          onClose={() => setSheet(undefined)}
        />
      ) : null}
      <DeckVersionsDialogs
        visible={sheets.visible}
        onDismissed={sheets.onDismissed}
        dialog={sheets.shown}
        rows={versions.map((version) => ({
          id: String(version.number),
          label: deckVersionLabel({ ...version, versionNumber: version.number }, latestNumber),
          note: version.note,
          cardQuantity: cardQuantity(version.cards),
        }))}
        activeId={String(activeNumber)}
        error={error}
        chooseDisabled={dirty}
        newDisabled={dirty || syncing || syncingElsewhere}
        copyFromLabel={
          active && deckVersionLabel({ ...active, versionNumber: active.number }, latestNumber)
        }
        rename={
          active && {
            name: deckVersionLabel({ ...active, versionNumber: active.number }, active.number),
            note: active.note ?? "",
            notesLocked: !pro,
          }
        }
        onChoose={(number) => {
          setChosen(Number(number))
          setSheet(undefined)
        }}
        onNew={startNewVersion}
        onCreate={createVersion}
        onManage={
          dirty || syncing || syncingElsewhere ? undefined : () => setSheet("renameVersion")
        }
        onRename={renameVersion}
        onDelete={versions.length > 1 ? () => setSheet("deleteVersion") : undefined}
        onConfirmDelete={deleteVersion}
        onClose={() => {
          setSheet(undefined)
          setError(undefined)
        }}
      />
      {sheets.shown === "settings" ? (
        <DeckSettingsDialog
          visible={sheets.visible}
          onDismissed={sheets.onDismissed}
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
          visible={focus.visible}
          onClose={() => setFocusedKey(undefined)}
          onDismissed={focus.onDismissed}
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
        visible={deleting && !sheets.shown}
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
