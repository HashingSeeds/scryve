import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { useConvex } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { TextField } from "@/components/TextField"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { loadGuestDeck } from "@/features/decks/guestDeck"
import { createClientId } from "@/features/game/domain"
import {
  BEST_OF_OPTIONS,
  buildManualMatchArgs,
  defaultManualMatchDraft,
  MAX_OPPONENTS,
  OUTCOME_OPTIONS,
  withOpponentAdded,
  withSeatOutcome,
  type BestOf,
  type ManualMatchDraft,
  type SeatOutcome,
} from "@/features/matches/manualMatchForm"
import { getManualMatchController } from "@/features/matches/matchOutbox"
import { localDeckChoices } from "@/features/stats/deckChoices"
import { deckFingerprint } from "@/features/stats/deckFingerprint"
import { saveListSnapshot } from "@/features/stats/listSnapshots"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { Id } from "../../convex/_generated/dataModel"
import { MAX_DISPLAY_NAME_LENGTH, MAX_EVENT_NAME_LENGTH } from "../../convex/lib/policy"

export type RecordMatchDeck =
  { versionId: Id<"deckVersions">; name: string } | { localId: string; name: string }

type RecordMatchScreenProps = {
  access: CloudAccess
  deck?: RecordMatchDeck
  onBack: () => void
  onSaved: () => void
}

const SCORE_FIELDS = [
  { key: "wins", labelTx: "play:summary.badge.win" },
  { key: "losses", labelTx: "play:summary.badge.loss" },
  { key: "draws", labelTx: "play:summary.badge.draw" },
] as const
const ISO_DATE_PLACEHOLDER = "YYYY-MM-DD"

export function RecordMatchScreen({ access, deck, onBack, onSaved }: RecordMatchScreenProps) {
  const { themed, theme } = useAppTheme()
  const client = useConvex()
  // why: one id per form so a retried save cannot record the match twice.
  const [publicId] = useState(() => createClientId("match"))
  const [draft, setDraft] = useState<ManualMatchDraft>(() => defaultManualMatchDraft())
  const [busy, setBusy] = useState(false)
  const [savedOffline, setSavedOffline] = useState(false)
  const [error, setError] = useState<string>()
  const twoPlayer = draft.opponents.length === 1
  const outcomeSegments = OUTCOME_OPTIONS.map(({ id, labelTx }) => ({
    id,
    label: translate(labelTx),
  }))
  const bestOfSegments = BEST_OF_OPTIONS.map((value) => ({
    id: String(value),
    label: translate("play:newGame.bestOfCount", { bestOf: value }),
  }))

  function updateOpponent(index: number, patch: Partial<ManualMatchDraft["opponents"][number]>) {
    setDraft((current) => ({
      ...current,
      opponents: current.opponents.map((opponent, candidate) =>
        candidate === index ? { ...opponent, ...patch } : opponent,
      ),
    }))
  }

  async function save() {
    const { ownerId } = access
    if (!ownerId) {
      access.request()
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const built = buildManualMatchArgs(draft, {
        publicId,
        ...(deck && "localId" in deck ? await localDeckIds(deck.localId) : {}),
        ...(deck && "versionId" in deck ? { deckVersionId: deck.versionId } : {}),
      })
      if (!built.ok) {
        setError(built.error)
        setBusy(false)
        return
      }
      getManualMatchController(client, ownerId).record(built.args)
      if (access.ready) onSaved()
      else setSavedOffline(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("play:recordMatch.saveFailed"))
      setBusy(false)
    }
  }

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={$screen}
    >
      <Header
        titleTx="play:recordMatch.title"
        backgroundColor={theme.colors.surface}
        leftTx="common:back"
        onLeftPress={onBack}
      />
      <ScrollView
        contentContainerStyle={themed($content)}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {deck ? (
          <Text weight="medium" text={deck.name} />
        ) : (
          <Text weight="medium" tx="play:newGame.noDeck" />
        )}
        <SegmentedControl
          testID="match-best-of"
          accessibilityLabel={translate("play:newGame.bestOf")}
          segments={bestOfSegments}
          selectedId={String(draft.bestOf)}
          disabled={busy}
          onSelect={(id) => setDraft({ ...draft, bestOf: Number(id) as BestOf })}
        />
        <View style={themed($field)}>
          <Text size="sm" tx="play:recordMatch.myResult" />
          <SegmentedControl
            testID="match-my-result"
            accessibilityLabel={translate("play:recordMatch.myResult")}
            segments={outcomeSegments}
            selectedId={draft.outcome}
            disabled={busy}
            onSelect={(id) => setDraft(withSeatOutcome(draft, "me", id as SeatOutcome))}
          />
        </View>
        {twoPlayer ? (
          <View style={themed($field)}>
            <Text size="sm" tx="play:recordMatch.gameScore" />
            <View style={themed($row)}>
              {SCORE_FIELDS.map(({ key, labelTx }) => (
                <TextField
                  key={key}
                  testID={`match-score-${key}`}
                  labelTx={labelTx}
                  value={draft.score[key]}
                  keyboardType="number-pad"
                  maxLength={1}
                  editable={!busy}
                  containerStyle={$flex}
                  onChangeText={(value) =>
                    setDraft({ ...draft, score: { ...draft.score, [key]: value } })
                  }
                />
              ))}
            </View>
          </View>
        ) : null}
        {draft.opponents.map((opponent, index) => (
          <View key={index} style={themed($opponent)}>
            <View style={themed($row)}>
              <Text
                size="sm"
                style={$flex}
                tx="play:recordMatch.opponent"
                txOptions={{ number: index + 1 }}
              />
              {draft.opponents.length > 1 ? (
                <TextAction
                  testID={`match-remove-opponent-${index}`}
                  tx="common:remove"
                  disabled={busy}
                  onPress={() =>
                    setDraft({
                      ...draft,
                      opponents: draft.opponents.filter((_, candidate) => candidate !== index),
                    })
                  }
                />
              ) : null}
            </View>
            <TextField
              testID={`match-opponent-name-${index}`}
              placeholder={translate("play:recordMatch.name")}
              value={opponent.name}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              editable={!busy}
              onChangeText={(name) => updateOpponent(index, { name })}
            />
            <TextField
              testID={`match-opponent-deck-${index}`}
              placeholder={translate("play:recordMatch.deckOptional")}
              value={opponent.deckName}
              maxLength={80}
              editable={!busy}
              onChangeText={(deckName) => updateOpponent(index, { deckName })}
            />
            {twoPlayer ? null : (
              <SegmentedControl
                testID={`match-opponent-result-${index}`}
                accessibilityLabel={translate("play:recordMatch.opponentResult", {
                  number: index + 1,
                })}
                segments={outcomeSegments}
                selectedId={opponent.outcome}
                disabled={busy}
                onSelect={(id) => setDraft(withSeatOutcome(draft, index, id as SeatOutcome))}
              />
            )}
          </View>
        ))}
        {draft.opponents.length < MAX_OPPONENTS ? (
          <TextAction
            testID="match-add-opponent"
            tx="play:recordMatch.addOpponent"
            style={$touch}
            disabled={busy}
            onPress={() => setDraft(withOpponentAdded(draft))}
          />
        ) : null}
        <View style={themed($row)}>
          <TextField
            testID="match-event-name"
            label={translate("play:recordMatch.eventOptional")}
            value={draft.eventName}
            maxLength={MAX_EVENT_NAME_LENGTH}
            editable={!busy}
            containerStyle={$flex2}
            onChangeText={(eventName) => setDraft({ ...draft, eventName })}
          />
          <TextField
            testID="match-round"
            label={translate("play:recordMatch.roundOptional")}
            value={draft.round}
            keyboardType="number-pad"
            maxLength={2}
            editable={!busy}
            containerStyle={$flex}
            onChangeText={(round) => setDraft({ ...draft, round })}
          />
        </View>
        <TextField
          testID="match-date"
          label={translate("play:recordMatch.date")}
          value={draft.date}
          placeholder={ISO_DATE_PLACEHOLDER}
          maxLength={10}
          editable={!busy}
          onChangeText={(date) => setDraft({ ...draft, date })}
        />
      </ScrollView>
      <BottomActionBar>
        {error ? <AlertNote text={error} /> : null}
        {savedOffline ? (
          <Text size="xs" testID="match-saved-offline" tx="play:recordMatch.savedOffline" />
        ) : !access.ownerId && access.message ? (
          <Text size="xs" style={themed($dim)} text={access.message} />
        ) : null}
        {savedOffline ? (
          <Button testID="match-done" tx="common:done" preset="primary" onPress={onSaved} />
        ) : (
          <Button
            testID="match-save"
            text={
              busy
                ? translate("play:recordMatch.saving")
                : access.ownerId
                  ? translate("play:recordMatch.saveResult")
                  : (access.actionLabel ?? translate("play:manualMatch.signIn"))
            }
            preset="primary"
            disabled={busy || (!access.ownerId && access.loading)}
            onPress={save}
          />
        )}
      </BottomActionBar>
    </Screen>
  )
}

const $screen: ViewStyle = { flex: 1 }
const $flex: ViewStyle = { flex: 1 }
const $flex2: ViewStyle = { flex: 2 }
const $touch: ViewStyle = { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  paddingHorizontal: spacing.md,
  paddingTop: spacing.sm,
  paddingBottom: spacing.lg,
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
})
const $field: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $opponent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  alignItems: "flex-end",
})
const $dim: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })

async function localDeckIds(localId: string) {
  const stored = loadGuestDeck(localId)
  if (!stored) throw new Error(translate("decks:detail.maybeDeleted"))
  const [choice] = localDeckChoices([stored])
  const fingerprint = await deckFingerprint(stored.deck.cards)
  if (choice.deckKey) saveListSnapshot(choice.deckKey, fingerprint, stored.deck.cards)
  return {
    deckKey: choice.deckKey,
    deckFingerprint: fingerprint,
    deckName: choice.name,
    system: choice.system,
    format: choice.format,
  }
}
