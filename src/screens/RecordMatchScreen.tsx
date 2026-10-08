import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"
import { useMutation } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import type { CloudAccess } from "@/features/auth/CloudScreen"
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
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { MAX_DISPLAY_NAME_LENGTH, MAX_EVENT_NAME_LENGTH } from "../../convex/lib/policy"

export type RecordMatchDeck = {
  versionId: Id<"deckVersions">
  name: string
}

type RecordMatchScreenProps = {
  access: CloudAccess
  // why: History adds results without a deck; deck stats only count matches that name one.
  deck?: RecordMatchDeck
  onBack: () => void
  onSaved: () => void
}

const OUTCOME_SEGMENTS = OUTCOME_OPTIONS.map(({ id, label }) => ({ id, label }))
const BEST_OF_SEGMENTS = BEST_OF_OPTIONS.map((value) => ({
  id: String(value),
  label: `Best of ${value}`,
}))

export function RecordMatchScreen({ access, deck, onBack, onSaved }: RecordMatchScreenProps) {
  const { themed, theme } = useAppTheme()
  const recordMatch = useMutation(api.matches.recordManualMatch)
  // why: one id per form so a retried save cannot record the match twice.
  const [publicId] = useState(() => createClientId("match"))
  const [draft, setDraft] = useState<ManualMatchDraft>(() => defaultManualMatchDraft())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const twoPlayer = draft.opponents.length === 1

  function updateOpponent(index: number, patch: Partial<ManualMatchDraft["opponents"][number]>) {
    setDraft((current) => ({
      ...current,
      opponents: current.opponents.map((opponent, candidate) =>
        candidate === index ? { ...opponent, ...patch } : opponent,
      ),
    }))
  }

  async function save() {
    if (!access.ready) {
      access.request()
      return
    }
    const built = buildManualMatchArgs(draft, { publicId, deckVersionId: deck?.versionId })
    if (!built.ok) {
      setError(built.error)
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      await recordMatch(built.args)
      onSaved()
    } catch (cause) {
      setError(convexErrorMessage(cause, "Could not save this match. Try again."))
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
        title="Add match result"
        backgroundColor={theme.colors.surface}
        leftTx="common:back"
        onLeftPress={busy ? undefined : onBack}
      />
      <ScrollView
        contentContainerStyle={themed($content)}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text weight="medium" text={deck ? deck.name : "No deck"} />
        <SegmentedControl
          testID="match-best-of"
          accessibilityLabel="Best of"
          segments={BEST_OF_SEGMENTS}
          selectedId={String(draft.bestOf)}
          disabled={busy}
          onSelect={(id) => setDraft({ ...draft, bestOf: Number(id) as BestOf })}
        />
        <View style={themed($field)}>
          <Text size="sm" text="My result" />
          <SegmentedControl
            testID="match-my-result"
            accessibilityLabel="My result"
            segments={OUTCOME_SEGMENTS}
            selectedId={draft.outcome}
            disabled={busy}
            onSelect={(id) => setDraft(withSeatOutcome(draft, "me", id as SeatOutcome))}
          />
        </View>
        {twoPlayer ? (
          <View style={themed($field)}>
            <Text size="sm" text="Game score (optional)" />
            <View style={themed($row)}>
              {(["wins", "losses", "draws"] as const).map((key) => (
                <TextField
                  key={key}
                  testID={`match-score-${key}`}
                  label={key === "wins" ? "W" : key === "losses" ? "L" : "D"}
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
              <Text size="sm" style={$flex} text={`Opponent ${index + 1}`} />
              {draft.opponents.length > 1 ? (
                <TouchableOpacity
                  testID={`match-remove-opponent-${index}`}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() =>
                    setDraft({
                      ...draft,
                      opponents: draft.opponents.filter((_, candidate) => candidate !== index),
                    })
                  }
                >
                  <Text size="sm" text="Remove" style={themed($action)} />
                </TouchableOpacity>
              ) : null}
            </View>
            <TextField
              testID={`match-opponent-name-${index}`}
              placeholder="Name"
              value={opponent.name}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              editable={!busy}
              onChangeText={(name) => updateOpponent(index, { name })}
            />
            <TextField
              testID={`match-opponent-deck-${index}`}
              placeholder="Deck or commander (optional)"
              value={opponent.deckName}
              maxLength={80}
              editable={!busy}
              onChangeText={(deckName) => updateOpponent(index, { deckName })}
            />
            {twoPlayer ? null : (
              <SegmentedControl
                testID={`match-opponent-result-${index}`}
                accessibilityLabel={`Opponent ${index + 1} result`}
                segments={OUTCOME_SEGMENTS}
                selectedId={opponent.outcome}
                disabled={busy}
                onSelect={(id) => setDraft(withSeatOutcome(draft, index, id as SeatOutcome))}
              />
            )}
          </View>
        ))}
        {draft.opponents.length < MAX_OPPONENTS ? (
          <TouchableOpacity
            testID="match-add-opponent"
            accessibilityRole="button"
            style={$touch}
            disabled={busy}
            onPress={() => setDraft(withOpponentAdded(draft))}
          >
            <Text size="sm" text="+ Add opponent" style={themed($action)} />
          </TouchableOpacity>
        ) : null}
        <View style={themed($row)}>
          <TextField
            testID="match-event-name"
            label="Event (optional)"
            value={draft.eventName}
            maxLength={MAX_EVENT_NAME_LENGTH}
            editable={!busy}
            containerStyle={$flex2}
            onChangeText={(eventName) => setDraft({ ...draft, eventName })}
          />
          <TextField
            testID="match-round"
            label="Round (optional)"
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
          label="Date"
          value={draft.date}
          placeholder="YYYY-MM-DD"
          maxLength={10}
          editable={!busy}
          onChangeText={(date) => setDraft({ ...draft, date })}
        />
      </ScrollView>
      <BottomActionBar>
        {error ? <AlertNote text={error} /> : null}
        {access.message ? <Text size="xs" style={themed($dim)} text={access.message} /> : null}
        <Button
          testID="match-save"
          text={busy ? "Saving…" : access.ready ? "Save result" : (access.actionLabel ?? "Sign in")}
          preset="primary"
          disabled={busy || access.loading}
          onPress={save}
        />
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
const $action: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
